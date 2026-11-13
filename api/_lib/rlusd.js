import { rippleRpcWithSource } from './authority.js';
import { fetchWithTimeout } from './html.js';

export const RLUSD = Object.freeze({ issuer: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De', currency: '524C555344000000000000000000000000000000', contract: '0x8292bb45bf1ee4d140127049757c2e0ff06317ed', identitySource: 'https://docs.ripple.com/products/stablecoin/overview/token-addresses' });
const ETH = 'https://ethereum-rpc.publicnode.com';
const HASH = /^[A-Fa-f0-9]{64}$/;
const HEX = /^0x[0-9a-f]+$/i;
// Never pass monetary values through Number. XRPL can return scientific notation.
export function decimal(value) {
  if (typeof value !== 'string' || value.length > 200) throw new Error('Invalid decimal');
  const m = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d{1,3}))?$/i.exec(value);
  if (!m) throw new Error('Invalid decimal');
  const scale = (m[2] || '').length - Number(m[3] || 0);
  if (Math.abs(scale) > 120) throw new Error('Decimal out of range');
  let digits = (m[1] + (m[2] || '')).replace(/^0+(?=\d)/, '');
  if (scale <= 0) return digits === '0' ? '0' : digits + '0'.repeat(-scale);
  digits = digits.padStart(scale + 1, '0');
  return (digits.slice(0, -scale) + '.' + digits.slice(-scale)).replace(/\.?0+$/, '') || '0';
}
export function units(raw, places) {
  if (!HEX.test(raw) || raw.length > 66 || !Number.isInteger(places) || places < 0 || places > 36) throw new Error('Invalid contract amount');
  const n = BigInt(raw).toString();
  return decimal(places ? n.padStart(places + 1, '0').slice(0, -places) + '.' + n.padStart(places + 1, '0').slice(-places) : n);
}
export async function readXRPL(rpc = rippleRpcWithSource) {
  const first = await rpc('ledger', { ledger_index: 'validated', transactions: false, expand: false }, 3000);
  const l = first.result?.ledger;
  const hash = first.result?.ledger_hash || l?.ledger_hash;
  const index = Number(first.result?.ledger_index || l?.ledger_index);
  const close = Number(l?.close_time);
  if (first.result?.validated !== true || !HASH.test(hash || '') || !Number.isSafeInteger(index) || index <= 0 || !Number.isSafeInteger(close) || close <= 0) throw new Error('Unvalidated ledger');
  const stamp = new Date((close + 946684800) * 1000).toISOString();
  const { result: b, endpoint } = await rpc('gateway_balances', { account: RLUSD.issuer, strict: true, ledger_hash: hash }, 3000);
  if (b.validated !== true || b.account !== RLUSD.issuer || b.ledger_hash !== hash || Number(b.ledger_index) !== index || typeof b.obligations?.[RLUSD.currency] !== 'string') throw new Error('Incomplete obligations');
  return { status: 'available', value: decimal(b.obligations[RLUSD.currency]), metric: 'Issuer obligations, no operational-wallet exclusions', source: endpoint, method: 'gateway_balances', ledger_hash: hash, ledger_index: index, as_of: stamp, exclusions: [], limitation: 'Not issuer-reported circulating supply. Frozen balances and other gateway categories are not included in obligations; operational treasury balances have not been reconciled. Not liquidity, reserves or trading volume.' };
}
export async function readEthereum(fetcher = fetchWithTimeout) {
  async function rpc(method, params) {
    const res = await fetcher(ETH, { timeout: 3500, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    if (!res.ok) throw new Error('Ethereum unavailable');
    const p = await res.json();
    if (p.error || p.id !== 1 || p.result == null) throw new Error('Ethereum invalid response');
    return p.result;
  }
  if (await rpc('eth_chainId', []) !== '0x1') throw new Error('Wrong Ethereum chain');
  const b = await rpc('eth_getBlockByNumber', ['finalized', false]);
  if (!/^0x[0-9a-f]{64}$/i.test(b?.hash || '') || !HEX.test(b?.number || '') || !HEX.test(b?.timestamp || '')) throw new Error('Missing finalized block');
  // EIP-1898 pins both calls to one canonical block, not a moving latest block.
  const at = { blockHash: b.hash, requireCanonical: true };
  const places = await rpc('eth_call', [{ to: RLUSD.contract, data: '0x313ce567' }, at]);
  if (!/^0x[0-9a-f]{64}$/i.test(places)) throw new Error('Invalid decimals');
  const supply = await rpc('eth_call', [{ to: RLUSD.contract, data: '0x18160ddd' }, at]);
  if (!/^0x[0-9a-f]{64}$/i.test(supply)) throw new Error('Invalid totalSupply');
  return { status: 'available', value: units(supply, Number(BigInt(places))), metric: 'Contract totalSupply', source: ETH, method: 'eth_call totalSupply()', block_hash: b.hash, block_number: b.number, as_of: new Date(Number(BigInt(b.timestamp)) * 1000).toISOString(), limitation: 'Finalized block reported by one RPC provider; includes contract supply, not necessarily circulating supply. Not reserves, liquidity or volume.' };
}
export async function snapshot({ xrpl = readXRPL, ethereum = readEthereum, now = () => new Date().toISOString() } = {}) {
  const values = await Promise.allSettled([xrpl(), ethereum()]);
  const channel = i => values[i].status === 'fulfilled' ? values[i].value : { status: 'unavailable', value: null, reason: 'Source did not return complete pinned-ledger evidence. Retry later.' };
  return { schema: 1, asset: RLUSD, observed_at: now(), xrpl: channel(0), ethereum: channel(1), history: [], limitation: 'These metrics have different definitions and are not summed. No historical delta, mint/burn attribution or liquidity change can be established from one snapshot. Public RPC reports are not independent consensus verification.' };
}
