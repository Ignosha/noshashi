/** Minimum number of configured addresses whose weights meet quorum.
 * This does not establish independence or possession of their keys. */
export function minimumSigners(
  signers: Array<{ weight: number }>,
  quorum: number,
): number {
  if (
    !Number.isSafeInteger(quorum) ||
    quorum <= 0 ||
    signers.some(
      (s) => !Number.isInteger(s.weight) || s.weight < 1 || s.weight > 65535,
    )
  )
    return Infinity;
  const weights = signers.map((s) => s.weight).sort((a, b) => b - a);
  let total = 0;
  for (let i = 0; i < weights.length; i++) {
    total += weights[i];
    if (total >= quorum) return i + 1;
  }
  return Infinity;
}
