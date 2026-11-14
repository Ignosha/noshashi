// Only fixed public XRPL methods/endpoints. Never accept a provider URL or report.
import {
  terminalInput,
  issuerFacts,
  paymentFacts,
  assembleTerminal,
  NODE_ENDPOINTS,
} from "../../../api/_lib/terminal-model.js";
export async function readEvidence(
  raw: Record<string, unknown>,
  fetcher: typeof fetch = fetch,
) {
  const input = terminalInput(raw);
  for (const endpoint of NODE_ENDPOINTS.slice(0, 2)) {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 12000);
    try {
      const sources: unknown[] = [];
      const rpc = async (method: string, params: Record<string, unknown>) => {
        const response = await fetcher(endpoint, {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ method, params: [params] }),
        });
        if (!response.ok) throw new Error("node unavailable");
        // Bound upstream data before decoding.
        const reader = response.body?.getReader();
        if (!reader) throw new Error("empty node");
        const chunks: Uint8Array[] = [];
        let size = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 131072) {
            await reader.cancel();
            throw new Error("node response too large");
          }
          chunks.push(value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        const result = JSON.parse(new TextDecoder().decode(bytes)).result;
        if (!result || result.error) throw new Error("node result unavailable");
        sources.push({
          endpoint,
          method,
          ledger_index: result.ledger_index ?? null,
        });
        return result;
      };
      let facts;
      if (input.mode === "issuer") {
        const account = await rpc("account_info", {
          account: input.issuer,
          ledger_index: "validated",
          signer_lists: true,
          strict: true,
        });
        if (
          account.validated !== true ||
          !Number.isSafeInteger(account.ledger_index) ||
          account.ledger_index <= 0
        )
          throw new Error("Unverified ledger index");
        const validatedIndex = account.ledger_index;
        const header = await rpc("ledger", {
          ledger_index: validatedIndex,
          transactions: false,
          expand: false,
        });
        facts = issuerFacts(input, account, header);
      } else
        facts = paymentFacts(
          input,
          await rpc("tx", { transaction: input.hash, binary: false }),
        );
      const report = assembleTerminal(input, facts, sources);
      if (report.status !== "VERIFIED" || report.validated !== true)
        throw new Error("complete validated evidence required");
      return report;
    } catch {
      /* Bounded fallback; no arbitrary endpoints. */
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(
    "Verified evidence unavailable. Public exploration remains separate; nothing was saved.",
  );
}
