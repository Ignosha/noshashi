import { rpc } from "@/lib/xrpl/client";

/**
 * What an account owns on the ledger, read once and shared by the
 * recovery scan, the exposure audit and the asset inventory: its
 * AccountRoot, every object it owns or is the destination of (escrows,
 * checks, payment channels, offers, NFT offers, trust lines, deposit
 * preauthorisations, tickets, signer list), its NFTs, the validated
 * ledger's close time, and the reserves in force.
 */

type Json = Record<string, any>;

export const RIPPLE_EPOCH = 946_684_800;

export type Holdings = {
  address: string;
  /** Null when the account does not exist. */
  root: Json | null;
  objects: Json[];
  nfts: Json[];
  ledgerIndex: number;
  /** Close time of the validated ledger read, in Ripple seconds: what "expired" is measured against. */
  closeTime: number;
  reserveBaseXrp: number;
  reserveIncXrp: number;
  /** False when a page limit stopped the read early. */
  complete: boolean;
};

export type HoldingsReader = {
  request(command: string, params: Json): Promise<Json>;
};

export const liveHoldingsReader: HoldingsReader = { request: (command, params) => rpc(command, params) as Promise<Json> };

const notFound = (e: unknown) => /actNotFound|not found/i.test(e instanceof Error ? e.message : String(e));

async function paged(reader: HoldingsReader, command: string, params: Json, key: string, pages: number): Promise<{ rows: Json[]; complete: boolean }> {
  const rows: Json[] = [];
  let marker: unknown;
  for (let i = 0; i < pages; i++) {
    const page = await reader.request(command, { ...params, ...(marker ? { marker } : {}) });
    rows.push(...((page[key] ?? []) as Json[]));
    marker = page.marker;
    if (!marker) return { rows, complete: true };
  }
  return { rows, complete: false };
}

/** Read everything an account owns, at one validated ledger. */
export async function readHoldings(address: string, reader: HoldingsReader = liveHoldingsReader, pages = 10): Promise<Holdings> {
  const ledger = await reader.request("ledger", { ledger_index: "validated" });
  const ledgerIndex = Number(ledger.ledger?.ledger_index ?? ledger.ledger_index);
  const closeTime = Number(ledger.ledger?.close_time ?? 0);
  const server = await reader.request("server_info", {}).catch(() => ({}) as Json);
  const vl = (server.info?.validated_ledger ?? {}) as Json;
  const reserveBaseXrp = Number(vl.reserve_base_xrp ?? 1);
  const reserveIncXrp = Number(vl.reserve_inc_xrp ?? 0.2);

  const info = await reader.request("account_info", { account: address, ledger_index: ledgerIndex }).catch((e) => {
    if (notFound(e)) return null;
    throw e;
  });
  if (!info) return { address, root: null, objects: [], nfts: [], ledgerIndex, closeTime, reserveBaseXrp, reserveIncXrp, complete: true };

  const [objects, nfts] = await Promise.all([
    paged(reader, "account_objects", { account: address, ledger_index: ledgerIndex, limit: 400 }, "account_objects", pages),
    paged(reader, "account_nfts", { account: address, ledger_index: ledgerIndex, limit: 400 }, "account_nfts", pages).catch(() => ({ rows: [], complete: false })),
  ]);
  return {
    address,
    root: info.account_data as Json,
    objects: objects.rows,
    nfts: nfts.rows,
    ledgerIndex,
    closeTime,
    reserveBaseXrp,
    reserveIncXrp,
    complete: objects.complete && nfts.complete,
  };
}

export const isoFromRipple = (t: unknown) => (typeof t === "number" && t > 0 ? new Date((t + RIPPLE_EPOCH) * 1000).toISOString() : null);

export const dropsToXrp = (raw: unknown) => (typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) / 1_000_000 : null);

/** The account's side of a trust line: its balance, limit, and whether its owner reserve is held for it. */
export function lineSide(line: Json, address: string) {
  const low = line.LowLimit?.issuer === address;
  const raw = Number(line.Balance?.value ?? 0);
  const LSF_LOW_RESERVE = 0x00010000;
  const LSF_HIGH_RESERVE = 0x00020000;
  return {
    currency: String(line.Balance?.currency ?? line.LowLimit?.currency ?? ""),
    /** The other side of the line: for a holder, the issuer. */
    counterparty: String(low ? line.HighLimit?.issuer : line.LowLimit?.issuer),
    balance: low ? raw : -raw,
    limit: Number((low ? line.LowLimit : line.HighLimit)?.value ?? 0),
    counterpartyLimit: Number((low ? line.HighLimit : line.LowLimit)?.value ?? 0),
    reserved: (Number(line.Flags ?? 0) & (low ? LSF_LOW_RESERVE : LSF_HIGH_RESERVE)) !== 0,
    index: String(line.index ?? ""),
  };
}
