import { minimumSigners } from "../lib/security/quorum";

const form = document.querySelector<HTMLFormElement>("#security-quorum");
const result = document.querySelector<HTMLElement>("#security-quorum-result");
if (form && result) {
  const show = () => {
    const data = new FormData(form);
    const weights = String(data.get("weights") ?? "")
      .split(",")
      .map((s) => Number(s.trim()));
    const quorum = Number(data.get("quorum"));
    const lost = Number(data.get("lost"));
    if (
      weights.length < 1 ||
      weights.length > 8 ||
      weights.some((w) => !Number.isInteger(w) || w < 1 || w > 65535) ||
      !Number.isInteger(quorum) ||
      quorum < 1 ||
      quorum > 4294967295 ||
      !Number.isInteger(lost) ||
      lost < 0 ||
      lost > weights.length
    ) {
      result.textContent =
        "Enter 1–8 integer weights (1–65535), a positive quorum and a valid number of unavailable signers.";
      return;
    }
    const full = minimumSigners(
      weights.map((weight) => ({ weight })),
      quorum,
    );
    const sorted = [...weights].sort((a, b) => b - a);
    const remaining = sorted.slice(lost);
    const minimum = minimumSigners(
      remaining.map((weight) => ({ weight })),
      quorum,
    );
    const bypass = data.has("master") || data.has("regular");
    result.textContent = `${Number.isFinite(full) ? `${full} signer address(es) can reach the configured quorum.` : "The original quorum cannot be reached."} After removing the ${lost} highest-weight signer(s): ${remaining.reduce((a, b) => a + b, 0)} weight remains / ${quorum} required. ${Number.isFinite(minimum) ? "Quorum remains reachable." : "Quorum becomes unreachable."} ${bypass ? "A direct master or regular key can sign independently of this list; the list does not enforce multiple approvals." : "No direct key bypass was assumed in this scenario."} This is local arithmetic, not a wallet read or key-possession test.`;
  };
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    show();
  });
  show();
}
