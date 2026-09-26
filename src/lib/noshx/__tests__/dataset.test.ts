import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import mainnet from "@/lib/desk/__tests__/fixtures/xrpl-mainnet-107193471.json";

/*
 * The NOSHX model's training data. Run with UPDATE_NOSHX_DATASET=1 to
 * write scripts/noshx-model/noshx-train.jsonl, which the training
 * notebook downloads:
 *
 *   UPDATE_NOSHX_DATASET=1 npx vitest run src/lib/noshx/__tests__/dataset.test.ts
 *
 * The grounded examples teach the model to answer from ledger readings it
 * is given. Their readings are NOSHX Core's own, taken from the recorded
 * mainnet payment (ledger 107193471) through the real settlement reader.
 */

const PAYMENT = mainnet.tx_payment;

vi.mock("@/lib/xrpl/client", async (original) => ({
  ...(await original<typeof import("@/lib/xrpl/client")>()),
  rpc: vi.fn(async (method: string, params: Record<string, unknown>) => {
    if (method === "tx" && params.transaction === PAYMENT.hash) return PAYMENT;
    throw new Error(`not recorded: ${method}`);
  }),
}));

const { buildDataset, NOSHX_SYSTEM, toJsonl } = await import("../dataset");
const { answerWithCore } = await import("../core/engine");

async function grounded() {
  const questions = [`What did ${PAYMENT.hash} deliver?`, `Did transaction ${PAYMENT.hash} arrive in full?`, `Check this payment: ${PAYMENT.hash}`];
  return Promise.all(
    questions.map(async (question) => {
      const core = await answerWithCore(question, { has: () => true, spendFreeCheck: () => true });
      return {
        messages: [
          { role: "system" as const, content: `${NOSHX_SYSTEM}\n\nLEDGER READINGS (read by NOSHX Core just now; answer from these):\n${core.facts}` },
          { role: "user" as const, content: question },
          { role: "assistant" as const, content: core.facts },
        ],
      };
    })
  );
}

describe("the NOSHX training data", () => {
  it("is built from NOSHASHI's own content and is well formed", async () => {
    const examples = await buildDataset(await grounded());
    expect(examples.length).toBeGreaterThan(600);
    for (const e of examples) {
      expect(e.messages.map((m) => m.role)).toEqual(["system", "user", "assistant"]);
      expect(e.messages[1].content.length).toBeGreaterThan(3);
      expect(e.messages[2].content.length).toBeGreaterThan(10);
    }
    const text = toJsonl(examples);
    // Nothing the product does not do.
    expect(text).not.toMatch(/SAML 2\.0 or OIDC, with SCIM/);
    // The grounded answers carry the recorded reading.
    expect(text).toContain(PAYMENT.meta.delivered_amount.value.slice(0, 7));

    if (process.env.UPDATE_NOSHX_DATASET) {
      writeFileSync(resolve(import.meta.dirname, "../../../../scripts/noshx-model/noshx-train.jsonl"), text);
    }
  });
});
