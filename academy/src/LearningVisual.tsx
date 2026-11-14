/** Each graphic is an explicitly simulated teaching example, never a live dashboard. */
export function LearningVisual({ lesson }: { lesson: string }) {
  if (!["a1", "a5", "a9", "a11", "a12", "a15"].includes(lesson)) return null;
  const rows =
    lesson === "a1"
      ? [
          ["Current", "Accepting changes"],
          ["Closed", "Awaiting validation"],
          ["Validated", "Node-reported finalized state"],
          ["Ledger index", "Sequence number: 108316232"],
          ["Close time", "Separate field; not derived from the index"],
        ]
      : lesson === "a5"
        ? [
            ["Freeze", "Can restrict issued-token movement"],
            [
              "Clawback",
              "May reclaim eligible issued balances; protocol limits apply",
            ],
            ["Authorization", "Controls eligible holders"],
            ["Off-ledger question", "Reserves and legal redemption rights"],
          ]
        : lesson === "a9"
          ? [
              [
                "Direction / band",
                "Sell TOKEN · bids within 1% of 1 USD/TOKEN",
              ],
              ["Trade size", "10,000 TOKEN"],
              ["Quoted bids", "20,000 TOKEN"],
              ["Funded bids", "4,000 TOKEN"],
              [
                "Conclusion",
                "Capacity shortfall within this snapshot; no fill guarantee",
              ],
            ]
          : lesson === "a15"
            ? [
                ["Training rule", "Maximum evidence age: 30 seconds"],
                ["Observed age", "90 seconds"],
                ["Verdict", "HOLD — obtain fresher evidence"],
                [
                  "Receipt",
                  "Keep rule, observations, policy version and scope",
                ],
              ]
            : [
                ["Requested", "100 USD"],
                ["Delivered metadata", "40 USD"],
                ["Validation", "true (reported by node)"],
                ["Destination / tag", "Must match invoice"],
                [
                  "Decision",
                  "60 USD shortfall; apply the stated partial-credit policy",
                ],
              ];
  return (
    <figure className="learning-visual">
      <figcaption>ONE IDEA / SIMULATED TRAINING EXAMPLE</figcaption>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </figure>
  );
}
