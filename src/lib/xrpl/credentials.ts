import type { CredentialRecord } from "./types";
import { credentialFromEntry } from "../../../supabase/functions/_shared/ledgerRegistry.ts";

type Request = (
  command: string,
  params: Record<string, unknown>,
) => Promise<Record<string, any>>;

/** Held credentials only. Never present a truncated directory as complete. */
export async function readHeldCredentials(
  address: string,
  ledger: number | "validated",
  request: Request,
): Promise<CredentialRecord[]> {
  const held: CredentialRecord[] = [];
  let marker: unknown;
  let pinned = ledger;
  const markers = new Set<string>();
  for (let page = 0; page < 10; page++) {
    const r = await request("account_objects", {
      account: address,
      type: "credential",
      ledger_index: pinned,
      limit: 400,
      ...(marker ? { marker } : {}),
    });
    if (!Array.isArray(r.account_objects))
      throw new Error(
        "The ledger omitted its credential objects. Retry the read.",
      );
    const index = Number(r.ledger_index);
    if (
      !Number.isSafeInteger(index) ||
      index <= 0 ||
      r.validated !== true ||
      (pinned !== "validated" && pinned !== index)
    )
      throw new Error(
        "Credential pages could not be pinned to the same validated ledger.",
      );
    pinned = index;
    for (const raw of r.account_objects) {
      const c = credentialFromEntry(raw, raw.index);
      if (!c)
        throw new Error(
          "The ledger returned a malformed credential object. This reading is incomplete.",
        );
      if (c.subject !== address) continue;
      held.push({
        subject: c.subject,
        issuer: c.issuer,
        credentialType: c.type ?? c.typeHex,
        accepted: c.accepted,
        revoked: false,
        ...(c.uri ? { uri: c.uri } : {}),
        ...(c.expiration !== null ? { expiration: c.expiration } : {}),
      });
    }
    marker = r.marker;
    if (!marker) return held;
    const key = JSON.stringify(marker);
    if (markers.has(key))
      throw new Error(
        "The credential directory repeated a page. Retry the read.",
      );
    markers.add(key);
  }
  throw new Error(
    "Credential read exceeded 4,000 objects. Partial results cannot establish the held-credential list.",
  );
}
