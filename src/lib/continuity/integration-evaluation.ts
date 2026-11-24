import { isValidClassicAddress } from "ripple-address-codec";
import { canonicalJson, hashContinuityIntent, type ContinuityIntent, type IntentValue } from "./intent";

type Mode = "SIMULATED" | "EXTERNAL";
type ReviewScope = Readonly<{ tenantId: string; network: "xrpl-mainnet" }>;
type WalletScope = ReviewScope & Readonly<{ walletIntentRef: string }>;
type ThreatScope = ReviewScope & Readonly<{ address: string }>;

export type Provenance = Readonly<{
  provider: string;
  sourceRef: string;
  observedAtMs: number;
  expiresAtMs: number;
}>;

export type WalletObservation = WalletScope & Readonly<{
  intentHash: string;
  transactionHash: string | null;
  provenance: Provenance;
}>;

type Binding = Readonly<{
  intentHash: string;
  policyHash: string;
  ledgerHash: string;
}>;

export type WalletEvaluationRequest = Readonly<{
  schema: "noshashi.continuity.wallet-evaluation.v1";
  walletIntentRef: string;
  intent: ContinuityIntent;
  policyHash: string;
  ledgerHash: string;
  prior: (Binding & Readonly<{ expiresAtMs: number }>) | null;
}>;

export type ThreatIndicator = Readonly<{
  id: string;
  network: "xrpl-mainnet";
  address: string;
  kind: "SUSPICIOUS_DESTINATION" | "COUNTERPARTY_INCIDENT" | "OPERATIONAL_ALERT";
  disposition: "UNREVIEWED" | "DISPUTED" | "DISMISSED";
  provenance: Provenance;
}>;

export type ThreatObservation = ThreatScope & Readonly<{
  provenance: Provenance;
  indicators: readonly ThreatIndicator[];
}>;

export type ThreatEvaluationRequest = ThreatScope & Readonly<{
  schema: "noshashi.continuity.threat-evaluation.v1";
}>;

export interface ReadOnlyWalletAdapter {
  readonly mode: Mode;
  readIntent(scope: WalletScope): Promise<unknown>;
}

export interface ReadOnlyThreatAdapter {
  readonly mode: Mode;
  readIndicators(scope: ThreatScope): Promise<unknown>;
}

export function simulatedWalletAdapter(observation: WalletObservation | null): ReadOnlyWalletAdapter {
  return { mode: "SIMULATED", readIntent: async () => observation };
}

export function simulatedThreatAdapter(observation: ThreatObservation | null): ReadOnlyThreatAdapter {
  return { mode: "SIMULATED", readIndicators: async () => observation };
}

type EvaluationClock = Readonly<{ nowMs: number; maxEvidenceAgeMs: number }>;
type Reason =
  | "PROVIDER_UNAVAILABLE"
  | "MISSING_OBSERVATION"
  | "MALFORMED_OBSERVATION"
  | "SCOPE_MISMATCH"
  | "STALE_OBSERVATION"
  | "INTENT_MISMATCH"
  | "APPROVAL_CONTEXT_CHANGED"
  | "APPROVAL_EXPIRED"
  | "INDICATOR_REQUIRES_REVIEW"
  | "INDICATOR_STALE"
  | "INDICATOR_DISPUTED"
  | "NO_CURRENT_INDICATORS";

type ReviewRecord = Readonly<{
  mode: Mode;
  review: "HOLD";
  evaluatedAtMs: number;
  maxEvidenceAgeMs: number;
  reasons: readonly Reason[];
}>;

export type WalletEvaluationRecord = ReviewRecord & Readonly<{
  schema: WalletEvaluationRequest["schema"];
  scope: WalletScope;
  binding: Binding;
  prior: WalletEvaluationRequest["prior"];
  approvalDrift: "UNKNOWN" | "UNCHANGED" | "CHANGED" | "EXPIRED";
  providerObservation: "MATCHED" | "UNKNOWN";
  observation: WalletObservation | null;
}>;

export type ThreatEvaluationRecord = ReviewRecord & Readonly<{
  schema: ThreatEvaluationRequest["schema"];
  scope: ThreatScope;
  providerObservation: "INDICATORS_REPORTED" | "UNKNOWN";
  observation: ThreatObservation | null;
}>;

export type EvaluationReceipt<T extends WalletEvaluationRecord | ThreatEvaluationRecord> = Readonly<{
  record: T;
  sha256: string;
}>;

const hashPattern = /^[0-9a-f]{64}$/i;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,127}$/;
const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
const indicatorLimit = 32;
const bindingKeys = ["intentHash", "policyHash", "ledgerHash"] as const;

function hasFields(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.keys(value).length === fields.length && fields.every(key => Object.prototype.hasOwnProperty.call(value, key));
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && identifierPattern.test(value);
}

function hash(value: unknown): value is string {
  return typeof value === "string" && hashPattern.test(value);
}

function address(value: unknown): value is string {
  return typeof value === "string" && value.length <= 35 && isValidClassicAddress(value);
}

function timestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validateContext(clock: EvaluationClock, mode: Mode): void {
  if (!timestamp(clock.nowMs) || !timestamp(clock.maxEvidenceAgeMs) ||
      clock.maxEvidenceAgeMs < 1 || clock.maxEvidenceAgeMs > maxAgeMs ||
      (mode !== "SIMULATED" && mode !== "EXTERNAL")) throw new Error("INVALID_EVALUATION_CONTEXT");
}

function isBinding(value: unknown): value is NonNullable<WalletEvaluationRequest["prior"]> {
  return hasFields(value, ["intentHash", "policyHash", "ledgerHash", "expiresAtMs"]) &&
    hash(value.intentHash) && hash(value.policyHash) && hash(value.ledgerHash) && timestamp(value.expiresAtMs);
}

function walletRequest(value: unknown): WalletEvaluationRequest {
  if (!hasFields(value, ["schema", "walletIntentRef", "intent", "policyHash", "ledgerHash", "prior"]) ||
      value.schema !== "noshashi.continuity.wallet-evaluation.v1" ||
      !identifier(value.walletIntentRef) || !hash(value.policyHash) || !hash(value.ledgerHash) ||
      (value.prior !== null && !isBinding(value.prior))) throw new Error("INVALID_WALLET_REQUEST");
  const intent = value.intent;
  if (!hasFields(intent, [
    "schema", "network", "tenantId", "requestId", "transactionType", "sourceAccount", "destinationAccount",
    "asset", "amount", "destinationTag", "lastLedgerSequence", "signingPayloadSha256",
  ]) || intent.transactionType !== "Payment" || !identifier(intent.tenantId) || !identifier(intent.requestId) ||
      !address(intent.sourceAccount) || !address(intent.destinationAccount) ||
      typeof intent.amount !== "string" || intent.amount.length > 80 ||
      !hasFields(intent.asset, ["currency", "issuer"]) ||
      typeof intent.asset.currency !== "string" || !/^(?:[A-Za-z0-9]{3}|[0-9A-F]{40})$/.test(intent.asset.currency) ||
      (intent.asset.issuer !== null && !address(intent.asset.issuer)) ||
      (intent.asset.currency === "XRP" && !/^\d+$/.test(intent.amount)) ||
      !hash(intent.signingPayloadSha256)) throw new Error("INVALID_WALLET_INTENT");
  // hashContinuityIntent runs the existing semantic checks on the now structural input.
  return value as WalletEvaluationRequest;
}

function threatRequest(value: unknown): ThreatEvaluationRequest {
  if (!hasFields(value, ["schema", "tenantId", "network", "address"]) ||
      value.schema !== "noshashi.continuity.threat-evaluation.v1" || !identifier(value.tenantId) ||
      value.network !== "xrpl-mainnet" || !address(value.address)) throw new Error("INVALID_THREAT_REQUEST");
  return value as ThreatEvaluationRequest;
}

function isProvenance(value: unknown): value is Provenance {
  return hasFields(value, ["provider", "sourceRef", "observedAtMs", "expiresAtMs"]) &&
    identifier(value.provider) && identifier(value.sourceRef) && timestamp(value.observedAtMs) &&
    timestamp(value.expiresAtMs) && value.expiresAtMs > value.observedAtMs;
}

function fresh(provenance: Provenance, clock: EvaluationClock): boolean {
  return provenance.observedAtMs <= clock.nowMs && clock.nowMs < provenance.expiresAtMs &&
    clock.nowMs - provenance.observedAtMs <= clock.maxEvidenceAgeMs;
}

function walletShape(value: unknown): value is WalletObservation {
  return hasFields(value, ["tenantId", "network", "walletIntentRef", "intentHash", "transactionHash", "provenance"]) &&
    identifier(value.tenantId) && value.network === "xrpl-mainnet" && identifier(value.walletIntentRef) &&
    hash(value.intentHash) && (value.transactionHash === null || hash(value.transactionHash)) && isProvenance(value.provenance);
}

function indicatorShape(value: unknown): value is ThreatIndicator {
  return hasFields(value, ["id", "network", "address", "kind", "disposition", "provenance"]) &&
    identifier(value.id) && value.network === "xrpl-mainnet" && address(value.address) &&
    (value.kind === "SUSPICIOUS_DESTINATION" || value.kind === "COUNTERPARTY_INCIDENT" || value.kind === "OPERATIONAL_ALERT") &&
    (value.disposition === "UNREVIEWED" || value.disposition === "DISPUTED" || value.disposition === "DISMISSED") &&
    isProvenance(value.provenance);
}

function threatShape(value: unknown): value is ThreatObservation {
  if (!hasFields(value, ["tenantId", "network", "address", "provenance", "indicators"]) ||
      !identifier(value.tenantId) || value.network !== "xrpl-mainnet" || !address(value.address) ||
      !isProvenance(value.provenance) || !Array.isArray(value.indicators) ||
      value.indicators.length > indicatorLimit || !Array.from(value.indicators).every(indicatorShape)) return false;
  return new Set(value.indicators.map(indicator => indicator.id)).size === value.indicators.length;
}

function sameTenant(observation: ReviewScope, scope: ReviewScope): boolean {
  return observation.tenantId === scope.tenantId && observation.network === scope.network;
}

function assessDrift(binding: Binding, prior: WalletEvaluationRequest["prior"], nowMs: number): WalletEvaluationRecord["approvalDrift"] {
  if (!prior) return "UNKNOWN";
  if (bindingKeys.some(key => binding[key] !== prior[key].toLowerCase())) return "CHANGED";
  return nowMs >= prior.expiresAtMs ? "EXPIRED" : "UNCHANGED";
}

type ReadResult<T> = { observation: T; reason: null } | { observation: null; reason: Reason };

async function readObservation<T extends ReviewScope & { provenance: Provenance }>(
  read: () => Promise<unknown>,
  validate: (value: unknown) => value is T,
  inScope: (observation: T) => boolean,
  clock: EvaluationClock,
): Promise<ReadResult<T>> {
  let raw: unknown;
  try { raw = await read(); }
  catch { return { observation: null, reason: "PROVIDER_UNAVAILABLE" }; }
  if (raw === null) return { observation: null, reason: "MISSING_OBSERVATION" };
  if (!validate(raw)) return { observation: null, reason: "MALFORMED_OBSERVATION" };
  if (!inScope(raw)) return { observation: null, reason: "SCOPE_MISMATCH" };
  if (!fresh(raw.provenance, clock)) return { observation: null, reason: "STALE_OBSERVATION" };
  return { observation: raw, reason: null };
}

export async function evaluationDigest(record: WalletEvaluationRecord | ThreatEvaluationRecord): Promise<string> {
  const canonical = canonicalJson(record as unknown as IntentValue);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("NOSHASHI_CONTINUITY_EVALUATION_V1\n" + canonical));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function evaluateWalletIntegration(
  input: unknown, adapter: ReadOnlyWalletAdapter, evaluationClock: EvaluationClock,
): Promise<EvaluationReceipt<WalletEvaluationRecord>> {
  const request = walletRequest(input);
  const clock = { ...evaluationClock };
  const mode = adapter.mode;
  validateContext(clock, mode);
  const scope: WalletScope = Object.freeze({
    tenantId: request.intent.tenantId, network: request.intent.network, walletIntentRef: request.walletIntentRef,
  });
  const prior = request.prior ? { ...request.prior } : null;
  const ledgerHash = request.ledgerHash.toLowerCase();
  const policyHash = request.policyHash.toLowerCase();
  const intentHash = await hashContinuityIntent(request.intent);
  const binding = { intentHash, policyHash, ledgerHash };
  const approvalDrift = assessDrift(binding, prior, clock.nowMs);
  const result = await readObservation(() => adapter.readIntent(scope), walletShape,
    observation => sameTenant(observation, scope) && observation.walletIntentRef === scope.walletIntentRef, clock);
  const reasons: Reason[] = [];
  let observation = result.observation;
  if (result.reason) reasons.push(result.reason);
  if (observation && observation.intentHash.toLowerCase() !== binding.intentHash) {
    observation = null;
    reasons.push("INTENT_MISMATCH");
  }
  if (approvalDrift === "CHANGED") reasons.push("APPROVAL_CONTEXT_CHANGED");
  if (approvalDrift === "EXPIRED") reasons.push("APPROVAL_EXPIRED");
  const record: WalletEvaluationRecord = {
    schema: request.schema, mode, review: "HOLD", scope, binding, prior, approvalDrift, reasons,
    observation: observation ? { ...observation, provenance: { ...observation.provenance } } : null,
    providerObservation: observation ? "MATCHED" : "UNKNOWN", evaluatedAtMs: clock.nowMs, maxEvidenceAgeMs: clock.maxEvidenceAgeMs,
  };
  return { record, sha256: await evaluationDigest(record) };
}

export async function evaluateThreatIntegration(
  input: unknown, adapter: ReadOnlyThreatAdapter, evaluationClock: EvaluationClock,
): Promise<EvaluationReceipt<ThreatEvaluationRecord>> {
  const request = threatRequest(input);
  const clock = { ...evaluationClock };
  const mode = adapter.mode;
  validateContext(clock, mode);
  const scope: ThreatScope = Object.freeze({ tenantId: request.tenantId, network: request.network, address: request.address });
  const result = await readObservation(() => adapter.readIndicators(scope), threatShape,
    observation => sameTenant(observation, scope) && observation.address === scope.address &&
      observation.indicators.every(indicator => indicator.network === scope.network && indicator.address === scope.address), clock);
  const reasons = new Set<Reason>();
  if (result.reason) reasons.add(result.reason);
  let current = false;
  for (const indicator of result.observation?.indicators ?? []) {
    if (!fresh(indicator.provenance, clock)) reasons.add("INDICATOR_STALE");
    else if (indicator.disposition === "DISPUTED") reasons.add("INDICATOR_DISPUTED");
    else if (indicator.disposition === "UNREVIEWED") {
      reasons.add("INDICATOR_REQUIRES_REVIEW");
      current = true;
    }
  }
  if (result.observation && !current) reasons.add("NO_CURRENT_INDICATORS");
  const record: ThreatEvaluationRecord = {
    schema: request.schema, mode, review: "HOLD", scope, reasons: [...reasons],
    observation: result.observation ? {
      ...result.observation, provenance: { ...result.observation.provenance },
      indicators: result.observation.indicators.map(indicator => ({ ...indicator, provenance: { ...indicator.provenance } })),
    } : null,
    providerObservation: current ? "INDICATORS_REPORTED" : "UNKNOWN",
    evaluatedAtMs: clock.nowMs, maxEvidenceAgeMs: clock.maxEvidenceAgeMs,
  };
  return { record, sha256: await evaluationDigest(record) };
}
