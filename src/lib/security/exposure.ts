import type { Holdings } from "./objects";
import { dropsToXrp, isoFromRipple, lineSide } from "./objects";
import { decodeCurrency } from "../../../supabase/functions/_shared/xrplEvents.ts";

/**
 * Exposure audit — the XRP Ledger's version of "revoke token approvals".
 *
 * XRPL has no ERC-20 allowances, but an account can still leave standing
 * permissions that let someone else take value later: checks it wrote
 * (the payee can pull up to the amount), open NFT sell offers (anyone, or
 * the named buyer, can take the NFT at that price, and a zero-price offer
 * signed on a phishing site gives it away), funded payment channels, open
 * DEX orders, deposit preauthorisations, escrows it cannot take back, the
 * keys and signers that can act for it, an authorised NFT minter, and
 * Default Ripple on an account that issues nothing. Each finding comes
 * with the unsigned transaction that revokes it.
 */

type Json = Record<string, any>;

export type ExposureRisk = "high" | "medium" | "low";

export type Exposure = {
  id: string;
  risk: ExposureRisk;
  kind: "check" | "nft_sell_offer" | "payment_channel" | "dex_offer" | "deposit_preauth" | "escrow" | "signer" | "regular_key" | "nft_minter" | "default_ripple";
  title: string;
  detail: string;
  /** XRP someone else could take, where the ledger says (0 when it is a token or unknowable). */
  atRiskXrp: number;
  /** Unsigned revoking transaction, or null when nothing can revoke it. */
  revoke: Json | null;
  caution?: string;
};

export type ExposureReport = {
  address: string;
  exists: boolean;
  ledgerIndex: number;
  exposures: Exposure[];
  atRiskXrp: number;
  complete: boolean;
};

const LSF_SELL_NFTOKEN = 0x00000001;
const LSF_DEFAULT_RIPPLE = 0x00800000;
const ASF_DEFAULT_RIPPLE = 8;
const ASF_AUTHORIZED_NFTOKEN_MINTER = 10;

function amountText(raw: unknown): string {
  const xrp = dropsToXrp(raw);
  if (xrp !== null) return `${xrp.toLocaleString("en-US", { maximumFractionDigits: 6 })} XRP`;
  const a = raw as Json;
  return `${a?.value} ${decodeCurrency(String(a?.currency ?? ""))}`;
}

/** Every standing permission this account has left open. Pure. */
export function exposureFrom(h: Holdings, known: string[] = []): ExposureReport {
  const me = h.address;
  const now = h.closeTime;
  const out: Exposure[] = [];
  const root = h.root;
  if (!root) return { address: me, exists: false, ledgerIndex: h.ledgerIndex, exposures: [], atRiskXrp: 0, complete: true };
  const trusted = (a: unknown) => typeof a === "string" && known.includes(a);

  for (const o of h.objects) {
    const index = String(o.index ?? "");
    const expired = typeof o.Expiration === "number" && o.Expiration <= now;
    switch (o.LedgerEntryType) {
      case "Check":
        if (o.Account === me && !expired) {
          out.push({
            id: `check-${index}`,
            risk: trusted(o.Destination) ? "low" : "high",
            kind: "check",
            title: `${o.Destination} can pull up to ${amountText(o.SendMax)} from you`,
            detail: `A check you wrote${o.Expiration ? `, valid until ${isoFromRipple(o.Expiration)?.slice(0, 10)}` : " with no expiry"}. It is cashable for as long as it exists.`,
            atRiskXrp: dropsToXrp(o.SendMax) ?? 0,
            revoke: { TransactionType: "CheckCancel", Account: me, CheckID: index },
          });
        }
        break;
      case "NFTokenOffer": {
        if (o.Owner !== me || expired || (Number(o.Flags ?? 0) & LSF_SELL_NFTOKEN) === 0) break;
        const free = (dropsToXrp(o.Amount) ?? Number((o.Amount as Json)?.value ?? 1)) === 0;
        out.push({
          id: `nft-${index}`,
          risk: free ? "high" : trusted(o.Destination) ? "low" : "medium",
          kind: "nft_sell_offer",
          title: `${o.Destination ? o.Destination : "Anyone"} can take NFT ${String(o.NFTokenID).slice(0, 12)}… for ${free ? "NOTHING" : amountText(o.Amount)}`,
          detail: free
            ? "A zero-price sell offer gives the NFT away to whoever accepts it. Phishing sites ask for exactly this signature, disguised as a claim or a verification. If you did not mean to give it away, cancel it now."
            : "An open sell offer: it fills the moment someone accepts it at that price.",
          atRiskXrp: 0,
          revoke: { TransactionType: "NFTokenCancelOffer", Account: me, NFTokenOffers: [index] },
        });
        break;
      }
      case "PayChannel": {
        if (o.Account !== me) break;
        const unclaimed = (dropsToXrp(o.Amount) ?? 0) - (dropsToXrp(o.Balance) ?? 0);
        out.push({
          id: `channel-${index}`,
          risk: trusted(o.Destination) ? "low" : "medium",
          kind: "payment_channel",
          title: `${o.Destination} can redeem claims on ${unclaimed.toLocaleString("en-US", { maximumFractionDigits: 6 })} XRP`,
          detail: "A payment channel you fund. Every claim you have signed for it can be redeemed until it closes. Signing claims on a site you do not trust hands that XRP over.",
          atRiskXrp: unclaimed,
          revoke: { TransactionType: "PaymentChannelClaim", Account: me, Channel: index, Flags: 0x00020000 },
          caution: "Closing starts the settle delay; the recipient can still redeem claims you already signed until it ends.",
        });
        break;
      }
      case "Offer":
        if (o.Account !== me || expired) break;
        out.push({
          id: `offer-${index}`,
          risk: "low",
          kind: "dex_offer",
          title: `Open order: pay ${amountText(o.TakerGets)} for ${amountText(o.TakerPays)}`,
          detail: "Anyone can fill it at that price, now or months from now. Old orders left open are filled when the market moves through them.",
          atRiskXrp: dropsToXrp(o.TakerGets) ?? 0,
          revoke: { TransactionType: "OfferCancel", Account: me, OfferSequence: o.Sequence },
        });
        break;
      case "DepositPreauth":
        if (o.Account !== me || typeof o.Authorize !== "string") break;
        out.push({ id: `preauth-${index}`, risk: "low", kind: "deposit_preauth", title: `${o.Authorize} is preauthorised to pay you`, detail: "With deposit authorisation on, this sender's payments are accepted. Remove it if you no longer deal with them.", atRiskXrp: 0, revoke: { TransactionType: "DepositPreauth", Account: me, Unauthorize: o.Authorize } });
        break;
      case "Escrow":
        if (o.Account !== me || o.Destination === me) break;
        out.push({
          id: `escrow-${index}`,
          risk: "low",
          kind: "escrow",
          title: `${amountText(o.Amount)} escrowed to ${o.Destination}`,
          detail: typeof o.CancelAfter === "number" ? `Returnable to you if not finished by ${isoFromRipple(o.CancelAfter)?.slice(0, 10)}.` : "It has no cancel time: once it matures it can only go to the destination.",
          atRiskXrp: dropsToXrp(o.Amount) ?? 0,
          revoke: null,
        });
        break;
      case "SignerList": {
        const entries = ((o.SignerEntries ?? []) as Json[]).map((e) => e.SignerEntry ?? e);
        for (const e of entries) {
          out.push({
            id: `signer-${e.Account}`,
            risk: trusted(e.Account) ? "low" : "medium",
            kind: "signer",
            title: `${e.Account} is a signer (weight ${e.SignerWeight} of quorum ${o.SignerQuorum})`,
            detail: "Signers together can move everything. Each should be a key you or a trusted colleague control.",
            atRiskXrp: 0,
            revoke: null,
            caution: "Change signers with a new SignerListSet covering the whole list; removing one here would need the rest re-stated.",
          });
        }
        break;
      }
    }
  }

  if (typeof root.RegularKey === "string") {
    out.push({
      id: "regular-key",
      risk: trusted(root.RegularKey) ? "low" : "medium",
      kind: "regular_key",
      title: `${root.RegularKey} can sign for this account on its own`,
      detail: "The regular key has full power. If you do not recognise it, someone else can empty the account: open Incident Response.",
      atRiskXrp: Number(root.Balance ?? 0) / 1_000_000,
      revoke: { TransactionType: "SetRegularKey", Account: me },
      caution: "Removing the regular key when the master key is disabled and no signer list exists locks the account forever.",
    });
  }
  if (typeof root.NFTokenMinter === "string") {
    out.push({ id: "nft-minter", risk: trusted(root.NFTokenMinter) ? "low" : "medium", kind: "nft_minter", title: `${root.NFTokenMinter} can mint NFTs in your name`, detail: "An authorised minter issues NFTs that name this account as issuer: fakes of your collection look genuine.", atRiskXrp: 0, revoke: { TransactionType: "AccountSet", Account: me, ClearFlag: ASF_AUTHORIZED_NFTOKEN_MINTER } });
  }
  const issues = h.objects.some((o) => o.LedgerEntryType === "RippleState" && lineSide(o, me).balance < 0);
  if ((Number(root.Flags ?? 0) & LSF_DEFAULT_RIPPLE) !== 0 && !issues) {
    out.push({
      id: "default-ripple",
      risk: "low",
      kind: "default_ripple",
      title: "Default Ripple is on, but this account issues nothing",
      detail: "Balances in the same currency from different issuers can ripple through your trust lines, swapping one issuer's IOU for another's without you acting. Only issuers need it.",
      atRiskXrp: 0,
      revoke: { TransactionType: "AccountSet", Account: me, ClearFlag: ASF_DEFAULT_RIPPLE },
      caution: "Clearing it affects new trust lines; set No Ripple on existing lines to close them too.",
    });
  }

  const rank = { high: 0, medium: 1, low: 2 } as const;
  out.sort((a, b) => rank[a.risk] - rank[b.risk] || b.atRiskXrp - a.atRiskXrp);
  const atRiskXrp = Math.round(out.filter((e) => e.kind !== "regular_key" && e.kind !== "escrow").reduce((n, e) => n + e.atRiskXrp, 0) * 1e6) / 1e6;
  return { address: me, exists: true, ledgerIndex: h.ledgerIndex, exposures: out, atRiskXrp, complete: h.complete };
}
