import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { digestOf } from "@/lib/policy";
// @ts-expect-error — untyped JS module, imported deliberately.
import * as vercel from "../../../../api/_lib/authority.js";

/**
 * One digest, three runtimes.
 *
 * The canonical form an authority certificate is hashed over is written
 * out three times, because three runtimes need it and none can import
 * from the others:
 *
 *   src/lib/policy.ts                          Vite / TypeScript — the console
 *   api/_lib/authority.js                      Node on Vercel — the free page
 *   supabase/functions/noshashi-verify/…       Deno — the checking verb
 *
 * The third is the one that matters most and is hardest to test. It is
 * the endpoint someone uses to establish that a certificate they were
 * handed is intact. If its canonical form drifts by one key or one
 * sort, every genuine certificate starts failing verification — and it
 * fails in the direction that destroys the feature's whole purpose,
 * because the reader concludes the document was tampered with.
 *
 * Text-matching the three would pass on a file that does not run. So
 * the Deno function's source is extracted and EXECUTED here instead,
 * against the same inputs as the other two. Deno's `crypto.subtle` and
 * `TextEncoder` are both present in Node, and the function touches
 * nothing else, so it runs unmodified.
 */

const root = resolve(import.meta.dirname, "../../../..");
const EDGE = "supabase/functions/noshashi-verify/index.ts";

/** Lift `authorityDigest` out of the Deno function and make it callable. */
function denoDigest(): (input: Record<string, unknown>) => Promise<string> {
  const source = readFileSync(resolve(root, EDGE), "utf8");

  const start = source.indexOf("async function authorityDigest(");
  if (start === -1) {
    throw new Error(
      `Could not find authorityDigest in ${EDGE}. If it was renamed, update this ` +
        "test with it — do not delete it. It is the only check that the Deno " +
        "canonical form still matches the one certificates are issued with."
    );
  }
  // The function body ends at the first line that is exactly "}".
  const end = source.indexOf("\n}\n", start);
  if (end === -1) throw new Error(`Malformed authorityDigest in ${EDGE}`);

  // Strip the TypeScript annotations the runtime does not need. Only the
  // parameter's type literal and the return type are annotated, and both
  // sit between the first "(" and the "{" that opens the body.
  const declaration = source.slice(start, end + 2);
  const bodyStart = declaration.indexOf("): Promise<string> {");
  if (bodyStart === -1) {
    throw new Error(
      `authorityDigest in ${EDGE} no longer has the signature this test strips types from.`
    );
  }
  const body = declaration.slice(bodyStart + "): Promise<string> {".length, -1);

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(
    "input",
    `return (async () => {${body}})();`
  ) as (input: Record<string, unknown>) => Promise<string>;
}

const CASES = [
  {
    name: "an ordinary certificate",
    input: {
      kind: "authority",
      subject: "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De",
      scope: { currency: "USD", ledgerIndex: 84_112_907, verdict: "hold" },
      checks: [
        { id: "FREEZE_SURRENDERED", passed: false },
        { id: "NOT_GLOBALLY_FROZEN", passed: true },
        { id: "NO_UNILATERAL_SIGNER", passed: true },
      ],
      evaluatedAt: "2026-09-20T05:00:00.000Z",
    },
  },
  {
    name: "no currency scoped",
    input: {
      kind: "authority",
      subject: "rIssuer",
      scope: { currency: "", ledgerIndex: 1, verdict: "no-go" },
      checks: [{ id: "AUTHORITY_READABLE", passed: false }],
      evaluatedAt: "2026-01-01T00:00:00.000Z",
    },
  },
  {
    name: "scope keys written out of order",
    input: {
      kind: "authority",
      subject: "rIssuer",
      // Deliberately not alphabetical. All three sort before hashing, so
      // a caller reconstructing a body from a printed certificate does
      // not have to guess the order it was written in.
      scope: { verdict: "go", ledgerIndex: 99, currency: "EUR" },
      checks: [{ id: "OPEN_HOLDING", passed: true }],
      evaluatedAt: "2026-05-05T12:00:00.000Z",
    },
  },
  {
    name: "no checks at all",
    input: {
      kind: "authority",
      subject: "rIssuer",
      scope: { currency: "", ledgerIndex: 0, verdict: "no-go" },
      checks: [],
      evaluatedAt: "2026-05-05T12:00:00.000Z",
    },
  },
];

describe("the authority digest is the same in all three runtimes", () => {
  const deno = denoDigest();

  for (const testCase of CASES) {
    it(`${testCase.name}: console, Vercel and Deno agree`, async () => {
      const [ts, node, edge] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        digestOf(testCase.input as any),
        vercel.digestOf(testCase.input),
        deno(testCase.input),
      ]);
      expect(node).toBe(ts);
      expect(edge).toBe(ts);
      expect(ts).toMatch(/^[0-9A-F]{64}$/);
    });
  }

  it("distinguishes two readings of one issuer at different ledgers", async () => {
    const at = (ledgerIndex: number) => ({
      kind: "authority",
      subject: "rIssuer",
      scope: { currency: "USD", ledgerIndex, verdict: "go" },
      checks: [{ id: "OPEN_HOLDING", passed: true }],
      evaluatedAt: "2026-05-05T12:00:00.000Z",
    });
    // The property the certificate rests on: a claim about one ledger
    // cannot be reused as a claim about another.
    expect(await deno(at(1))).not.toBe(await deno(at(2)));
  });

  it("changes when a single check result is flipped", async () => {
    const withResult = (passed: boolean) => ({
      kind: "authority",
      subject: "rIssuer",
      scope: { currency: "USD", ledgerIndex: 7, verdict: "go" },
      checks: [{ id: "NOT_GLOBALLY_FROZEN", passed }],
      evaluatedAt: "2026-05-05T12:00:00.000Z",
    });
    expect(await deno(withResult(true))).not.toBe(await deno(withResult(false)));
  });
});
