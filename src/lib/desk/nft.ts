import { rpc } from "@/lib/xrpl/client";

/**
 * NFT rights — what the issuer can still do to a token after selling it.
 *
 * An XRPL NFT is a pointer with permissions attached, and both halves are
 * invisible in every marketplace interface. The token you bought may be
 * destroyable by its issuer, its URI may be redirectable to something else
 * entirely, and it may not be resellable at all. None of that appears next
 * to the picture.
 *
 * The unusual part is that none of it needs a lookup. XLS-20 packs the
 * whole rights structure into the NFTokenID itself:
 *
 *   bits   0..15    Flags
 *   bits  16..31    TransferFee, in units of 0.001%
 *   bits  32..191   Issuer AccountID, 160 bits
 *   bits 192..223   Taxon, scrambled against the sequence
 *   bits 224..255   Sequence
 *
 * So an ID pasted from anywhere — a marketplace, a chat message, a
 * screenshot — can be decoded offline, with no server able to lie about
 * the answer. That matters here more than convenience: the issuer's own
 * marketplace is the least trustworthy place to ask whether the issuer
 * kept the right to burn your token.
 *
 * `nft_info` would give ownership and burn status, but it is a Clio method
 * and the public clusters this app talks to answer `unknownCmd`. Offers
 * are read live; everything else is decoded from the ID.
 *
 * Verified against mainnet on 2026-08-28 by decoding IDs from live
 * NFTokenCreateOffer transactions and confirming each derived issuer
 * address resolves to a funded account — a base58 or checksum error would
 * produce an address that does not exist.
 */

/** XLS-20 / XLS-46 NFToken flags. */
const LSF_BURNABLE = 0x0001;
const LSF_ONLY_XRP = 0x0002;
const LSF_TRANSFERABLE = 0x0008;
/** XLS-46: the issuer may rewrite the URI after issuance. */
const LSF_MUTABLE = 0x0010;

/** A transfer fee at or above this takes a serious cut of every resale. */
const HEAVY_FEE_PCT = 5;

const ALPHABET = "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz";

function base58(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = "";
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = ALPHABET[0] + out;
  }
  return out;
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** 160-bit AccountID → classic r-address, with the base58check the ledger uses. */
export async function accountIdToAddress(hex40: string): Promise<string> {
  const payload = new Uint8Array(21);
  payload[0] = 0x00; // classic address prefix
  payload.set(hexToBytes(hex40), 1);
  const checksum = (await sha256(await sha256(payload))).slice(0, 4);
  const full = new Uint8Array(25);
  full.set(payload, 0);
  full.set(checksum, 21);
  return base58(full);
}

export type NftRights = {
  tokenId: string;
  issuer: string;
  /** The issuer can destroy this token at any time. */
  burnable: boolean;
  /** The issuer can rewrite what this token points at. */
  mutable: boolean;
  /** It can be sold on at all. */
  transferable: boolean;
  /** It may only ever be traded for XRP, never for an issued token. */
  onlyXrp: boolean;
  /** Percentage the issuer takes from every secondary sale. */
  transferFeePct: number;
  taxon: number;
  sequence: number;
};

export type NftOffer = {
  index: string;
  owner: string;
  amountXrp?: number;
  amountRaw: unknown;
  /** Set when the offer may only be accepted by one named account. */
  destination?: string;
};

export type NftReport = {
  rights: NftRights;
  sellOffers: NftOffer[];
  buyOffers: NftOffer[];
  /** True when the ledger declined to answer for offers, as opposed to none existing. */
  offersUnreadable: boolean;
  readAt: string;
};

/** Decode everything the ID itself carries. No network, no trust. */
export async function decodeTokenId(raw: string): Promise<NftRights> {
  const tokenId = raw.trim().toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(tokenId)) {
    throw new Error(
      "An NFTokenID is 64 hexadecimal characters. Check for a truncated copy or stray whitespace."
    );
  }

  const flags = parseInt(tokenId.slice(0, 4), 16);
  const feeRaw = parseInt(tokenId.slice(4, 8), 16);

  return {
    tokenId,
    issuer: await accountIdToAddress(tokenId.slice(8, 48)),
    burnable: (flags & LSF_BURNABLE) !== 0,
    mutable: (flags & LSF_MUTABLE) !== 0,
    transferable: (flags & LSF_TRANSFERABLE) !== 0,
    onlyXrp: (flags & LSF_ONLY_XRP) !== 0,
    // TransferFee is in units of 0.001%, so 5000 is 5%.
    transferFeePct: feeRaw / 1000,
    taxon: parseInt(tokenId.slice(48, 56), 16),
    sequence: parseInt(tokenId.slice(56, 64), 16),
  };
}

function toOffers(raw: unknown): NftOffer[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((o: Record<string, any>) => ({
    index: String(o.nft_offer_index ?? ""),
    owner: String(o.owner ?? ""),
    amountXrp: typeof o.amount === "string" ? Number(o.amount) / 1_000_000 : undefined,
    amountRaw: o.amount,
    destination: o.destination ? String(o.destination) : undefined,
  }));
}

export async function readNft(tokenId: string): Promise<NftReport> {
  const rights = await decodeTokenId(tokenId);

  /*
   * `objectNotFound` from these means no offer book exists, which is not an
   * error and not the same as the ledger refusing to answer. Anything else
   * leaves offers unreadable, and the report says so rather than showing an
   * empty list that reads as "nobody wants it".
   */
  let offersUnreadable = false;
  const ask = async (command: string) => {
    try {
      const res = await rpc(command, { nft_id: rights.tokenId, ledger_index: "validated" });
      return toOffers(res.offers);
    } catch (caught) {
      const code = (caught as { code?: string })?.code;
      if (code !== "objectNotFound") offersUnreadable = true;
      return [];
    }
  };

  const [sellOffers, buyOffers] = await Promise.all([
    ask("nft_sell_offers"),
    ask("nft_buy_offers"),
  ]);

  return {
    rights,
    sellOffers,
    buyOffers,
    offersUnreadable,
    readAt: new Date().toISOString(),
  };
}

export type NftFinding = {
  id: string;
  severity: "critical" | "warn" | "info" | "ok";
  title: string;
  detail: string;
  action?: string;
};

export function nftFindings(report: NftReport): NftFinding[] {
  const out: NftFinding[] = [];
  const r = report.rights;

  if (r.burnable) {
    out.push({
      id: "burnable",
      severity: "critical",
      title: "The issuer can destroy this token",
      detail:
        "lsfBurnable is set, so the issuer may burn this NFT while someone else owns it. Whatever it represents, the holder's claim to it can be ended unilaterally and without warning. No marketplace shows this next to the price.",
      action:
        "Treat it as a revocable licence, not as property. Price the issuer's discretion into what you pay.",
    });
  } else {
    out.push({
      id: "not-burnable",
      severity: "ok",
      title: "The issuer cannot destroy this token",
      detail:
        "lsfBurnable is not set. Only the current owner can burn it, and that is a decision the holder makes.",
    });
  }

  if (r.mutable) {
    out.push({
      id: "mutable",
      severity: "warn",
      title: "The issuer can change what this token points at",
      detail:
        "lsfMutable is set, so the URI can be rewritten after sale. An NFT is a pointer, and this one's pointer can be redirected — the artwork, document or entitlement it refers to today is not necessarily what it will refer to tomorrow.",
      action: "Anything you are relying on should be stored where the issuer cannot reach it.",
    });
  }

  if (!r.transferable) {
    out.push({
      id: "soulbound",
      severity: "warn",
      title: "This token cannot be sold on",
      detail:
        "lsfTransferable is not set, so it can only ever move back to its issuer. There is no secondary market for it and there cannot be one.",
      action: "Do not value it against comparable tokens that can be resold.",
    });
  }

  if (r.transferFeePct > 0) {
    out.push({
      id: "transfer-fee",
      severity: r.transferFeePct >= HEAVY_FEE_PCT ? "warn" : "info",
      title: `The issuer takes ${r.transferFeePct.toFixed(3)}% of every resale`,
      detail: `A transfer fee is deducted by the issuer each time this token changes hands, on top of anything a marketplace charges. At this rate a round trip costs ${(r.transferFeePct * 2).toFixed(3)}% before any price movement.`,
    });
  }

  if (r.onlyXrp) {
    out.push({
      id: "only-xrp",
      severity: "info",
      title: "It can only be traded for XRP",
      detail:
        "lsfOnlyXRP is set, so offers denominated in an issued token are not possible for it.",
    });
  }

  if (report.offersUnreadable) {
    out.push({
      id: "offers-unreadable",
      severity: "warn",
      title: "The offer books could not be read",
      detail:
        "The ledger did not answer for this token's offers, so whether any exist is unknown — which is not the same as none existing.",
    });
  } else {
    const named = [...report.sellOffers, ...report.buyOffers].filter((o) => o.destination);
    if (named.length > 0) {
      out.push({
        id: "directed-offers",
        severity: "info",
        title: `${named.length} offer${named.length === 1 ? " is" : "s are"} reserved for a named account`,
        detail:
          "These carry a destination, so only that account can accept them. An offer book showing activity is not the same as a market anyone can trade into.",
      });
    }
    out.push({
      id: "offers",
      severity: "info",
      title: `${report.sellOffers.length} sell, ${report.buyOffers.length} buy offer${report.buyOffers.length === 1 ? "" : "s"}`,
      detail:
        report.sellOffers.length + report.buyOffers.length === 0
          ? "Nothing is currently offered on either side for this token."
          : "Offers rest until cancelled or accepted; their presence says nothing about whether the owner still wants to trade.",
    });
  }

  const rank = { critical: 0, warn: 1, info: 2, ok: 3 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
