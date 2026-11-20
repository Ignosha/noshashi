import { amountText, amountUnits } from "./amounts";

export function inputRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("A JSON object is required.");
  return value as Record<string, unknown>;
}
export function inputText(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 160)
    throw new Error("A text reference of 1–160 characters is required.");
  return value.trim();
}
function identity(value: string): string {
  return /^0x[0-9a-fA-F]{40}$/.test(value) ? value.toLowerCase() : value;
}
function status(value: unknown): string {
  if (value !== "confirmed" && value !== "pending" && value !== "failed")
    throw new Error("Status must be confirmed, pending or failed.");
  return value;
}

/** Reconcile supplied bridge and accounting records; provenance stays operator-declared. */
export function reviewBridge(value: unknown) {
  const input = inputRecord(value);
  const route = inputRecord(input.route);
  const source = inputRecord(input.source);
  const bridge = inputRecord(input.bridge);
  const id = inputText(route.id);
  inputText(source.network);
  inputText(source.transactionId);
  const sourceStatus = status(source.status);
  const expected = {
    network: inputText(route.destinationNetwork),
    account: inputText(route.destinationAccount),
    assetId: inputText(route.destinationAssetId),
    amount: amountUnits(route.expectedDelivered),
  };
  const messageId = inputText(bridge.messageId);
  const bridgeStatus = status(bridge.status);
  const reasons: string[] = [];
  if (sourceStatus === "failed" || bridgeStatus === "failed")
    reasons.push("Source or bridge reports failure");
  if (sourceStatus !== "confirmed" || bridgeStatus !== "confirmed")
    reasons.push("Source or bridge confirmation outstanding");
  if (
    typeof input.creditExportComplete !== "boolean" ||
    !Array.isArray(input.credits) ||
    input.credits.length > 100
  )
    throw new Error(
      "Supply up to 100 credits and a creditExportComplete flag.",
    );
  if (input.receipt === null) {
    if (input.credits.length)
      reasons.push("Credits exist without destination receipt evidence");
    reasons.push("Destination receipt outstanding");
  } else {
    const receipt = inputRecord(input.receipt);
    const receiptId = inputText(receipt.transactionId);
    if (status(receipt.status) !== "confirmed")
      reasons.push("Destination confirmation outstanding");
    if (inputText(receipt.messageId) !== messageId)
      reasons.push("Bridge message identifier mismatch");
    if (inputText(receipt.network) !== expected.network)
      reasons.push("Destination network mismatch");
    if (identity(inputText(receipt.account)) !== identity(expected.account))
      reasons.push("Destination account mismatch");
    if (identity(inputText(receipt.assetId)) !== identity(expected.assetId))
      reasons.push("Destination asset identity mismatch");
    const delivered = amountUnits(receipt.delivered);
    if (delivered !== expected.amount)
      reasons.push("Delivered amount differs from expected net amount");
    if (input.credits.length > 1)
      reasons.push("Multiple credits supplied for this transfer");
    for (const value of input.credits) {
      const credit = inputRecord(value);
      if (
        inputText(credit.receiptTransactionId) !== receiptId ||
        identity(inputText(credit.assetId)) !== identity(expected.assetId)
      )
        reasons.push("Accounting credit identity mismatch");
      if (amountUnits(credit.amount) !== delivered)
        reasons.push("Accounting credit amount mismatch");
    }
    if (input.creditExportComplete && !input.credits.length)
      reasons.push("Confirmed destination receipt has no accounting credit");
  }
  if (!input.creditExportComplete)
    reasons.push("Accounting export coverage unconfirmed");
  return {
    id,
    outcome: reasons.length ? "Review required" : "Supplied records reconcile",
    reasons: [...new Set(reasons)],
    source:
      "Operator-supplied records. Chain and bridge observations require independent verification.",
    input,
  };
}

/** Aggregate the supplied borrower mappings without deriving identities from addresses. */
export function reviewLending(value: unknown) {
  const input = inputRecord(value);
  const borrower = inputText(input.borrowerId);
  const asset = inputText(input.assetId);
  const basis = amountUnits(input.portfolioValue);
  const requested = amountUnits(input.requested);
  if (!basis) throw new Error("Portfolio limit basis must be positive.");
  const bps = input.maximumShareBps;
  if (
    typeof bps !== "number" ||
    !Number.isInteger(bps) ||
    bps < 0 ||
    bps > 10000
  )
    throw new Error("Set a limit of 0–10,000 basis points.");
  if (
    !Array.isArray(input.loans) ||
    input.loans.length > 1000 ||
    typeof input.exportComplete !== "boolean"
  )
    throw new Error("Supply up to 1,000 loans and an exportComplete flag.");
  const seen = new Set<string>();
  const mappings = new Map<string, string>();
  let existing = 0n;
  let unmapped = 0;
  for (const value of input.loans) {
    const row = inputRecord(value);
    const loanId = inputText(row.loanId);
    if (seen.has(loanId)) throw new Error("Duplicate loan reference.");
    seen.add(loanId);
    if (identity(inputText(row.assetId)) !== identity(asset))
      throw new Error(
        "Use one exact asset identity and limit basis per review.",
      );
    const amount = amountUnits(row.outstanding);
    const address = identity(inputText(row.address));
    if (row.entityId === null) {
      unmapped++;
      continue;
    }
    const entityId = inputText(row.entityId);
    if (mappings.has(address) && mappings.get(address) !== entityId)
      throw new Error("A wallet has conflicting entity mappings.");
    mappings.set(address, entityId);
    if (entityId === borrower) existing += amount;
  }
  const proposed = existing + requested;
  const limit = (basis * BigInt(bps)) / 10000n;
  const exceeds = proposed * 10000n > basis * BigInt(bps);
  const covered = input.exportComplete && unmapped === 0;
  return {
    borrower,
    assetId: asset,
    existing: amountText(existing),
    proposed: amountText(proposed),
    remainingUnderLimit: amountText(limit > existing ? limit - existing : 0n),
    exceeds,
    covered,
    unmapped,
    outcome: exceeds
      ? "Proposed exposure exceeds limit"
      : covered
        ? "Within declared concentration limit"
        : "Coverage requires review",
    source:
      "Operator-supplied loan export and entity mappings. Creditworthiness and external debt require separate evidence.",
    input,
  };
}
