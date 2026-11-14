import { LAB_SUBJECTS } from "../learn/labs";
export const CASE_VERSION = "analyst-cases/1";
export type AnalystCase = {
  id: string;
  title: string;
  brief: string;
  task: string;
  done: string;
  sample: string;
  scene: "settlement" | "authority" | "book" | "network";
  subject: string;
  lesson: string;
  concept: string;
  rows: { id: string; label: string; value: string }[];
  required: string[];
  choices: string[];
  answer: number;
  explanation: string;
  hints: string[];
  teachback: string;
};
const row = (id: string, label: string, value: string) => ({
  id,
  label,
  value,
});
export const ANALYST_CASES: AnalystCase[] = [
  {
    id: "invoice",
    title: "Did this invoice get paid?",
    brief:
      "You reconcile invoice TRAIN-100. It requests 100 USD, paid to Training account A with destination tag 44. This training policy does not allow partial settlement.",
    task: "Select the evidence needed to reconcile the invoice. Decide whether the full amount arrived.",
    done: "Choose the relevant evidence and a supported decision, then attempt a 30-second handoff.",
    sample: "TRAIN-100 · 100 USD · destination A · tag 44",
    scene: "settlement",
    subject: LAB_SUBJECTS.cscPayment,
    lesson: "a12",
    concept: "invoice-evidence",
    rows: [
      row("validated", "Node-reported validated", "true"),
      row("requested", "Invoice requested", "100 USD"),
      row("delivered", "Metadata delivered", "40 USD"),
      row("destination", "Destination", "Training account A — matches invoice"),
      row("tag", "Destination tag", "44 — matches invoice"),
      row("result", "Transaction result", "tesSUCCESS"),
      row("note", "Sender memo", "Payment sent"),
    ],
    required: [
      "validated",
      "requested",
      "delivered",
      "destination",
      "tag",
      "result",
    ],
    choices: [
      "Credit 100 USD and close the invoice.",
      "Hold full reconciliation; report 40 USD delivered and a 60 USD shortfall.",
      "Ignore the payment because tesSUCCESS means failure.",
    ],
    answer: 1,
    explanation:
      "Validation and destination/tag match, but metadata delivered 40 USD against 100 USD requested. There is a 60 USD shortfall. This training policy requires escalation rather than full credit. tesSUCCESS and a memo do not prove the invoice was fully paid.",
    hints: [
      "Start with validation and invoice matching, not the sender memo.",
      "Compare delivered metadata with the requested amount in the same asset and units.",
      "Use the stated partial-settlement policy to choose a supported handoff.",
    ],
    teachback:
      "The node reports a validated payment to the expected destination and tag. It delivered 40 USD, not the requested 100 USD. Under this training policy I would hold full settlement and escalate the 60 USD shortfall, preserving the supporting evidence.",
  },
  {
    id: "issuer",
    title: "What can this issuer do?",
    brief:
      "A team is considering a training issued token. AccountRoot flags below describe issuer permissions; no reserve or legal document is supplied.",
    task: "Select the permission evidence and explain which holder controls exist. Identify what requires off-ledger diligence.",
    done: "Identify freeze, clawback and authorization evidence, choose the scoped conclusion and attempt a handoff.",
    sample: "TRAINING ISSUER A / USD",
    scene: "authority",
    subject: LAB_SUBJECTS.cscIssuer,
    lesson: "a5",
    concept: "issuer-controls",
    rows: [
      row("freeze", "NoFreeze", "Not set — freeze authority may remain"),
      row("global", "GlobalFreeze", "Not set at this snapshot"),
      row(
        "clawback",
        "AllowTrustLineClawback",
        "Set — protocol constraints apply",
      ),
      row("auth", "RequireAuth", "Set — holding authorization required"),
      row("marketing", "Marketing description", "“Institutional token”"),
    ],
    required: ["freeze", "global", "clawback", "auth"],
    choices: [
      "The token is fully backed and compliant.",
      "Freeze, eligible issued-balance clawback and holder authorization are distinct controls; request reserves and redemption evidence separately.",
      "The flags prove a holder has already lost funds.",
    ],
    answer: 1,
    explanation:
      "Permissions are not evidence that a specific action occurred. Freeze can restrict token movement, clawback may reclaim eligible issued balances, and authorization controls eligible holders. None establishes reserves or legal redemption rights.",
    hints: [
      "Select control flags, not marketing language.",
      "Separate a permission from evidence that an action occurred.",
      "Name a reserve or redemption question that a ledger flag cannot answer.",
    ],
    teachback:
      "This issuer retains distinct token controls: freeze authority, eligible clawback and authorization. These flags do not establish solvency or wrongdoing. Before a decision I would request off-ledger reserves and legal redemption evidence.",
  },
  {
    id: "liquidity",
    title: "Could we exit this position?",
    brief:
      "Treasury proposes selling 10,000 TOKEN. Use one same-time sell-side snapshot. The training policy requires sufficient funded capacity inside the stated band before an exit assumption.",
    task: "Select evidence for size, direction, funded bids and the price/time scope. Explain what else must be checked.",
    done: "Compare the requested sell quantity to funded bids inside the band, choose a scoped decision and attempt a handoff.",
    sample: "SELL 10,000 TOKEN / USD",
    scene: "book",
    subject: LAB_SUBJECTS.cscIssuer,
    lesson: "a9",
    concept: "funded-depth",
    rows: [
      row("size", "Position to sell", "10,000 TOKEN"),
      row("direction", "Direction / side", "Sell TOKEN into bids"),
      row("quoted", "Quoted bids", "20,000 TOKEN"),
      row("funded", "Funded bids", "4,000 TOKEN"),
      row("band", "Reference / band", "1.00 USD per TOKEN · within 1%"),
      row(
        "time",
        "Snapshot scope",
        "One simulated snapshot; no execution guarantee",
      ),
    ],
    required: ["size", "direction", "quoted", "funded", "band", "time"],
    choices: [
      "A 20,000 TOKEN quote guarantees the sale.",
      "Funded capacity is below the position size; investigate price impact, freshness, fees and execution before relying on an exit.",
      "Funded capacity proves the issuer is solvent.",
    ],
    answer: 1,
    explanation:
      "Only 4,000 TOKEN of funded bids are shown inside this band versus a 10,000 TOKEN sale. Quoted depth is not funded depth. Future price, fill and settlement are not established by this snapshot.",
    hints: [
      "Match trade direction, units and the price band.",
      "Compare the position with funded bids, not all quotes.",
      "State a limitation of the snapshot and what you would check next.",
    ],
    teachback:
      "For a 10,000 TOKEN sale, this same-time snapshot shows only 4,000 TOKEN funded within 1% of 1 USD. The 20,000 TOKEN quoted amount overstates demonstrated funded capacity. I would hold the exit assumption and investigate current depth, impact, fees and execution conditions.",
  },
  {
    id: "verdict",
    title: "Explain the verdict",
    brief:
      "A simulated NOSHASHI receipt evaluates a training freshness rule. The policy threshold is 30 seconds; the liquidity evidence was retrieved 90 seconds ago.",
    task: "Select the rule, threshold, observation and verdict evidence. Prepare a reviewer handoff without making a legal claim.",
    done: "Support GO/HOLD/NO-GO with the supplied training rule and evidence, then attempt a handoff.",
    sample: "TRAINING RECEIPT / policy demo-1 / HOLD",
    scene: "network",
    subject: "",
    lesson: "a15",
    concept: "policy-evidence",
    rows: [
      row("verdict", "Verdict", "HOLD"),
      row("rule", "Rule", "liquidity_snapshot_max_age"),
      row("threshold", "Training threshold", "30 seconds"),
      row("observed", "Observed retrieval age", "90 seconds"),
      row("version", "Policy version", "demo-1"),
      row(
        "digest",
        "Receipt integrity",
        "Not calculated in this simulated exercise",
      ),
    ],
    required: ["verdict", "rule", "threshold", "observed", "version"],
    choices: [
      "HOLD: refresh the stale snapshot and send the rule, values and policy version to the reviewer.",
      "GO: a policy UI guarantees compliance.",
      "NO-GO proves criminal activity.",
    ],
    answer: 0,
    explanation:
      "The observed 90-second age exceeds the explicit 30-second training threshold. HOLD requests fresher evidence under demo-1; it is neither a legal conclusion nor proof of wrongdoing. A hash would detect content consistency, not establish author identity.",
    hints: [
      "Start with the training policy, not an assumed legal threshold.",
      "Compare observed age with the stated maximum.",
      "Include the rule, source limits and a practical next action in the handoff.",
    ],
    teachback:
      "Under training policy demo-1, liquidity evidence must be at most 30 seconds old. This snapshot is 90 seconds old, so the rule produces HOLD. I would refresh the reading and send the rule, observations and limitations to the reviewer; I would not call this a legal determination.",
  },
];
export type CaseRecord = {
  version: string;
  evidence: string[];
  decision: number;
  attempts: number;
  firstCorrect: boolean;
  teachback: string;
  compared: boolean;
  submitted: boolean;
  completedAt?: number;
};
export function gradeCase(
  c: AnalystCase,
  evidence: string[],
  decision: number,
) {
  return (
    decision === c.answer &&
    c.required.every((id) => evidence.includes(id)) &&
    evidence.length === c.required.length
  );
}
