/**
 * XRPL secret detection, enforced before any message reaches a model.
 *
 * The system prompt tells the assistant to refuse a pasted seed, but an
 * instruction to a model is not a control: by the time the model reads
 * it, the seed has already been sent to whoever runs the model. This
 * check runs first, in chatStream, so a message carrying a secret is
 * never sent at all.
 *
 * It recognises XRPL family seeds ("s…", secp256k1) and Ed25519 seeds
 * ("sEd…") by full base58check decoding — the version prefix and the
 * double-SHA-256 checksum must both match — so ordinary text and
 * addresses that happen to start with "s" are not caught. It does not
 * recognise mnemonic word lists or raw hex private keys: a 64-character
 * hex string is also every transaction hash, and blocking those would
 * break the assistant's main job.
 */

const BASE58_XRPL = "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz";

/** Candidate tokens: base58 runs of seed length, starting with "s". */
const CANDIDATE = /\bs[1-9A-HJ-NP-Za-km-z]{24,34}\b/g;

function decodeBase58(text: string): Uint8Array | null {
  const bytes: number[] = [0];
  for (const char of text) {
    const value = BASE58_XRPL.indexOf(char);
    if (value < 0) return null;
    let carry = value;
    for (let i = bytes.length - 1; i >= 0; i -= 1) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.unshift(carry & 0xff);
      carry >>= 8;
    }
  }
  let zeros = 0;
  while (zeros < text.length && text[zeros] === BASE58_XRPL[0]) zeros += 1;
  let first = 0;
  while (first < bytes.length && bytes[first] === 0) first += 1;
  const out = new Uint8Array(zeros + bytes.length - first);
  out.set(bytes.slice(first), zeros);
  return out;
}

async function checksumOk(decoded: Uint8Array): Promise<boolean> {
  const payload = decoded.slice(0, decoded.length - 4);
  const first = await crypto.subtle.digest("SHA-256", payload);
  const second = new Uint8Array(await crypto.subtle.digest("SHA-256", first));
  const check = decoded.slice(decoded.length - 4);
  return check.every((byte, i) => byte === second[i]);
}

/** Whether `token` is a checksum-valid XRPL secret seed of either kind. */
export async function isLedgerSeed(token: string): Promise<boolean> {
  const decoded = decodeBase58(token);
  if (!decoded) return false;
  // secp256k1 family seed: 0x21 + 16 bytes of entropy + 4 checksum.
  const family = decoded.length === 21 && decoded[0] === 0x21;
  // Ed25519 seed: 0x01 0xE1 0x4B + 16 bytes + 4 checksum.
  const ed25519 = decoded.length === 23 && decoded[0] === 0x01 && decoded[1] === 0xe1 && decoded[2] === 0x4b;
  if (!family && !ed25519) return false;
  return checksumOk(decoded);
}

/** True when the text contains an XRPL secret seed anywhere. */
export async function containsLedgerSeed(text: string): Promise<boolean> {
  for (const match of text.matchAll(CANDIDATE)) {
    if (await isLedgerSeed(match[0])) return true;
  }
  return false;
}

export class SecretInMessageError extends Error {
  constructor() {
    super(
      "That message contains an XRPL secret seed, so it was not sent. NOSHASHI never needs a seed. Treat this one as exposed: move the funds to a new account and stop using it."
    );
    this.name = "SecretInMessageError";
  }
}
