/**
 * The JWTs the Fireblocks API Co-signer and its Callback Handler exchange
 * (public key authentication: Options 1, 4 and 5 in Fireblocks' "Securing
 * communication"). RS256 for an RSA key, ES256 for an ECDSA P-256 key;
 * Fireblocks rejects any other algorithm, and so does this.
 *
 * node:crypto only, so the guard needs no JWT library.
 */
import { createPrivateKey, createPublicKey, sign as cryptoSign, verify as cryptoVerify, type KeyObject } from "node:crypto";

type Alg = "RS256" | "ES256";

const b64url = (buf: Buffer) => buf.toString("base64url");
const fromB64url = (s: string) => Buffer.from(s, "base64url");

function algFor(key: KeyObject): Alg {
  if (key.asymmetricKeyType === "rsa") return "RS256";
  if (key.asymmetricKeyType === "ec" && key.asymmetricKeyDetails?.namedCurve === "prime256v1") return "ES256";
  throw new Error(`Unsupported key type (${key.asymmetricKeyType}${key.asymmetricKeyDetails?.namedCurve ? " " + key.asymmetricKeyDetails.namedCurve : ""}). Use RSA 2048 or ECDSA P-256.`);
}

export const publicKey = (pem: string | Buffer) => createPublicKey(pem);
export const privateKey = (pem: string | Buffer) => createPrivateKey(pem);

/**
 * Verify a compact JWT against the Co-signer's public key and return its
 * payload. Throws on anything else: a wrong algorithm (including "none"),
 * a bad signature, or a payload that is not a JSON object.
 */
export function verifyJwt(token: string, key: KeyObject): Record<string, unknown> {
  const parts = token.trim().split(".");
  if (parts.length !== 3) throw new Error("Not a compact JWT.");
  const [h, p, s] = parts;
  const header = JSON.parse(fromB64url(h).toString("utf8")) as { alg?: string };
  const expected = algFor(key);
  if (header.alg !== expected) throw new Error(`JWT algorithm ${String(header.alg)} does not match the Co-signer key (${expected}).`);
  const ok = cryptoVerify(
    "sha256",
    Buffer.from(`${h}.${p}`),
    expected === "ES256" ? { key, dsaEncoding: "ieee-p1363" } : key,
    fromB64url(s)
  );
  if (!ok) throw new Error("JWT signature does not verify against the Co-signer public key.");
  const payload = JSON.parse(fromB64url(p).toString("utf8"));
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("JWT payload is not an object.");
  return payload as Record<string, unknown>;
}

/** Sign the handler's response with its own private key. */
export function signJwt(payload: Record<string, unknown>, key: KeyObject): string {
  const alg = algFor(key);
  const h = b64url(Buffer.from(JSON.stringify({ alg, typ: "JWT" })));
  const p = b64url(Buffer.from(JSON.stringify(payload)));
  const s = cryptoSign("sha256", Buffer.from(`${h}.${p}`), alg === "ES256" ? { key, dsaEncoding: "ieee-p1363" } : key);
  return `${h}.${p}.${b64url(s)}`;
}
