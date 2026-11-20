import type { CredentialEntry, DomainEntry } from "../../../supabase/functions/_shared/ledgerRegistry.ts";

export const sampleTime = 848_448_000;
export const sampleDomain: DomainEntry = {
  domainId: "A".repeat(64), owner: "Sample domain owner", sequence: 1,
  accepted: [
    { issuer: "Sample issuer A", typeHex: "4B5943", type: "KYC" },
    { issuer: "Sample issuer B", typeHex: "4B5943", type: "KYC" },
  ], previousTxnId: null, previousTxnLedger: null,
};

function credential(id: string, subject: string, issuer: string, days: number | null): CredentialEntry {
  return {
    credentialId: id.repeat(64), subject, issuer, typeHex: "4B5943", type: "KYC", accepted: true,
    expiration: days === null ? null : sampleTime + days * 86_400,
    uri: null, previousTxnId: null, previousTxnLedger: null,
  };
}
export const sampleAccounts = [
  { account: "Sample desk A", credentials: [credential("B", "Sample desk A", "Sample issuer A", 2), credential("C", "Sample desk A", "Sample issuer B", 20)] },
  { account: "Sample desk B", credentials: [credential("D", "Sample desk B", "Sample issuer A", 3)] },
  { account: "Sample desk C", credentials: [credential("E", "Sample desk C", "Sample issuer B", null)] },
];
