export type Status = "go" | "hold" | "no-go";

export type LedgerInfo = {
  ledgerIndex: number;
  ledgerHash: string;
  closeTime: string;
  validated: boolean;
  baseFeeXrp: string;
  /** What the open ledger is charging right now — the congestion signal. */
  openLedgerFeeXrp: string;
  /** Transactions queued for a future ledger. */
  queueSize: number;
  /** Transactions in the last validated ledger. */
  txnCount: number;
};

export type AccountInfo = {
  address: string;
  balanceXrp: string;
  sequence: number;
  ownerCount: number;
  domain?: string;
  /** Set when the address is well-formed but not yet funded on mainnet. */
  unfunded?: boolean;
};

export type CredentialRecord = {
  subject: string;
  issuer: string;
  credentialType: string;
  accepted: boolean;
  revoked: boolean;
  uri?: string;
  expiration?: number;
};

export type ServerInfo = {
  pubkeyNode: string;
  serverState: string;
  completeLedgers: string;
  uptimeSeconds: number;
  version: string;
  networkId: number;
  amendedFeatures: string[];
  /** Load-derived fee multiplier reported by the node. */
  loadFactor: number;
  peers: number;
};

/** A transaction the node validated while we were watching. */
export type LedgerStreamTransaction = {
  type: "transaction";
  ledgerIndex: number;
  account: string;
  transactionType: string;
  result: string;
  hash: string;
  /** Delivered amount in XRP when the transaction moved XRP. */
  amountXrp?: number;
};

/** Emitted once per ledger close — the console's heartbeat. */
export type LedgerStreamClose = {
  type: "ledgerClosed";
  ledgerIndex: number;
  ledgerHash: string;
  txnCount: number;
  baseFeeXrp: string;
  reserveBaseXrp: string;
  closeTime: string;
};

export type LedgerStreamMessage = LedgerStreamTransaction | LedgerStreamClose;

/** A payment the wallet itself sent or received, for the audit trail. */
export type WalletTransaction = {
  hash: string;
  transactionType: string;
  result: string;
  ledgerIndex: number;
  date: string;
  timestamp: number;
  /**
   * The wallet's role: it sent the transaction, it was the destination,
   * or it was merely affected by someone else's (a crossed offer, a
   * trustline change). `cross` is common and should not read as income.
   */
  direction: "in" | "out" | "cross";
  counterparty: string;
  amountXrp?: number;
  feeXrp: string;
};

/** A trust line as reported by `account_lines`, plus derived risk. */
export type TrustLine = {
  issuer: string;
  currency: string;
  balance: number;
  limit: number;
  /** You have frozen this line. */
  frozen: boolean;
  /** The ISSUER has frozen you — your balance is immobilised. */
  frozenByIssuer: boolean;
  /** XLS-77 — you have deep-frozen this line. */
  deepFrozen?: boolean;
  /** XLS-77 — the issuer has deep-frozen you: you can neither send nor receive. */
  deepFrozenByIssuer?: boolean;
  noRipple: boolean;
  authorized: boolean;
  /** The issuer requires explicit authorisation for this line. */
  requiresAuth: boolean;
};

/** Issuer-level capabilities that decide whether a holding is safe. */
export type IssuerPosture = {
  address: string;
  domain?: string;
  /** lsfNoFreeze — the issuer has permanently surrendered freeze. */
  noFreeze: boolean;
  /** lsfGlobalFreeze — every line of this issuer is frozen right now. */
  globalFreeze: boolean;
  /** lsfRequireAuth — holders must be authorised individually. */
  requireAuth: boolean;
  /** lsfDisableMaster — master key disabled, a key-management signal. */
  masterDisabled: boolean;
  /** Transfer fee in basis points, if the issuer charges one. */
  transferRateBps: number;
  unreadable?: string;
};

/**
 * Per-trust-line freeze state, including XLS-77 deep freeze.
 *
 * The distinction matters and is not cosmetic. An ordinary freeze stops the
 * holder *sending*; a deep freeze also stops them *receiving*. A sanctions
 * response that only sets the ordinary flag leaves the address able to keep
 * accepting funds, which is usually the opposite of the intent.
 */
export type FreezeState = {
  /** You have frozen this counterparty's line. */
  frozen: boolean;
  /** The counterparty has frozen you. */
  frozenByPeer: boolean;
  /** XLS-77 — you have deep-frozen them: they can neither send nor receive. */
  deepFrozen: boolean;
  /** XLS-77 — they have deep-frozen you. */
  deepFrozenByPeer: boolean;
};

/* ── Market intelligence ─────────────────────────────────────────── */

/** One side of the XRPL DEX order book, aggregated into price levels. */
export type BookLevel = {
  /** Price in the quote currency per one unit of the base. */
  price: number;
  /**
   * Base-currency quantity that can ACTUALLY FILL at this level, after
   * discounting offers whose owner no longer holds the funds to honour
   * them. This is the number every downstream calculation should use.
   */
  quantity: number;
  /**
   * What the book advertises at this level, funded or not. Kept so the
   * phantom depth can be shown rather than quietly removed — on some
   * mainnet books it is over 90% of the total.
   */
  listedQuantity: number;
  /** Running total of `quantity` from the touch outward. */
  cumulative: number;
};

export type OrderBook = {
  base: string;
  quote: string;
  issuer: string;
  bids: BookLevel[];
  asks: BookLevel[];
  /** Raw touch. May be a stale outlier — see referenceBid/referenceAsk. */
  bestBid?: number;
  bestAsk?: number;
  /**
   * Depth-weighted reference prices, taken where 10% of each side's depth
   * has been consumed. These, not the touch, drive mid and spread.
   */
  referenceBid?: number;
  referenceAsk?: number;
  /** The touch is crossed — bestBid exceeds bestAsk. Reported, not hidden. */
  crossed?: boolean;
  /**
   * Depth reachable within 10% of mid — the only depth that represents a
   * real exit. Total resting depth is not comparable: bid sides carry
   * enormous size at prices a thousandth of the market.
   */
  depthBidBanded?: number;
  depthAskBanded?: number;
  /** Ask minus bid, in quote currency. */
  spread?: number;
  /** Spread as a fraction of the mid. */
  spreadPct?: number;
  mid?: number;
  /** Ledger the book was read at — a book without a ledger index is a rumour. */
  ledgerIndex: number;
  /** Set when the pair simply has no book, which is not an error. */
  empty?: boolean;
};

/** XLS-30 automated market maker pool state. */
export type AmmPool = {
  exists: boolean;
  account?: string;
  /** XRP side, in XRP. */
  amountXrp?: number;
  /** Issued side, in its own units. */
  amount2?: number;
  currency2?: string;
  issuer2?: string;
  /** Pool trading fee in basis points. */
  tradingFeeBps?: number;
  /** The issued asset is frozen — the pool cannot be exited on that side. */
  asset2Frozen?: boolean;
  /** Implied spot price: quote units per one XRP. */
  impliedPrice?: number;
  unreadable?: string;
};

/** What an issuer has actually put into circulation, by currency. */
export type IssuerObligations = {
  issuer: string;
  /** currency code -> total outstanding */
  obligations: Record<string, number>;
  ledgerIndex: number;
  unreadable?: string;
};
