import type { Commitment } from "./rehearsal";
import { sampleDomain } from "./sample";

export const sampleWork: Commitment[] = [
  { id: "Trade-01", activity: "trade", plannedAt: "2026-11-27T12:00:00Z", dependencies: [{ account: "Sample desk A", domainId: sampleDomain.domainId }] },
  { id: "Payment-01", activity: "payment", plannedAt: "2026-11-22T12:00:00Z", dependencies: [{ account: "Sample desk B", domainId: sampleDomain.domainId }] },
  { id: "Bridge-01", activity: "bridge", plannedAt: "2026-11-22T12:00:00Z", dependencies: [{ account: "Sample desk C", domainId: sampleDomain.domainId }] },
  { id: "Loan-01", activity: "loan", plannedAt: "2026-12-11T12:00:00Z", dependencies: [{ account: "Sample desk A", domainId: sampleDomain.domainId }] },
  { id: "Closure-01", activity: "offboarding", plannedAt: "2026-11-25T12:00:00Z", dependencies: [{ account: "Unmapped customer", domainId: sampleDomain.domainId }] },
];
