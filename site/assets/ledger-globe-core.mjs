/** Public-node snapshot validation and illustrative sphere projection. No risk verdicts. */
export function readLedgerSnapshot(data, now = Date.now()) {
  const l = data?.ledger;
  const fetched = typeof data?.fetchedAt === 'string' ? Date.parse(data.fetchedAt) : NaN;
  if (data?.sources?.ledger !== true || l?.node !== 'xrplcluster.com' || !Number.isSafeInteger(l.sequence) || l.sequence <= 0 || !Number.isFinite(fetched) || fetched > now + 60000) return null;
  return {
    sequence: l.sequence,
    baseFeeXrp: typeof l.baseFeeXrp === 'number' && Number.isFinite(l.baseFeeXrp) && l.baseFeeXrp >= 0 ? l.baseFeeXrp : null,
    peers: Number.isSafeInteger(l.peers) && l.peers >= 0 ? l.peers : null,
    source: l.node, fetchedAt: data.fetchedAt, stale: now - fetched > 300000,
  };
}
export function meridianPaths(angle) {
  // Rotating meridians give the sphere depth. Coordinates are design geometry,
  // never wallet/node locations or observed transaction routes.
  return Array.from({ length: 12 }, (_, i) => {
    const longitude = angle + i * Math.PI / 6;
    const front = Math.cos(longitude) >= 0;
    const points = Array.from({ length: 41 }, (_, j) => {
      const latitude = -Math.PI / 2 + j * Math.PI / 40;
      return `${j ? 'L' : 'M'}${(260 + 153 * Math.cos(latitude) * Math.sin(longitude)).toFixed(2)},${(210 + 153 * Math.sin(latitude)).toFixed(2)}`;
    }).join(' ');
    return { d: points, opacity: front ? 0.8 : 0.16 };
  });
}
