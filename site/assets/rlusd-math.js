// Exact decimal change calculation. Values are normalized by the server.
export function change(previous, current, thresholdBps) {
  if (![previous,current].every(v => typeof v === 'string' && /^\d+(?:\.\d+)?$/.test(v) && v.length <= 250)) throw new Error('Invalid sample');
  if (!Number.isInteger(thresholdBps) || thresholdBps < 1 || thresholdBps > 10000) throw new Error('Threshold must be 1–10000 bps');
  const scale = Math.max(...[previous,current].map(v => (v.split('.')[1] || '').length));
  const integer = v => { const [a,b=''] = v.split('.'); return BigInt(a + b.padEnd(scale,'0')); };
  const a = integer(previous), b = integer(current), delta = b-a;
  return { direction: delta > 0n ? 'increase' : delta < 0n ? 'decrease' : 'unchanged', triggered: a === 0n ? null : (delta < 0n ? -delta : delta) * 10000n >= a * BigInt(thresholdBps) };
}
