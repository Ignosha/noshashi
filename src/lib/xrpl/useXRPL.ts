import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchAccount,
  fetchLedger,
  fetchServerInfo,
  fetchWalletCredentials,
  fetchWalletTransactions,
  getLastLatencyMs,
  isValidAddress,
  subscribeLedger,
} from "./client";
import type {
  AccountInfo,
  CredentialRecord,
  LedgerInfo,
  LedgerStreamMessage,
  ServerInfo,
  WalletTransaction,
} from "./types";

export type LiveEvent = {
  id: number;
  account: string;
  type: string;
  result: string;
  ledger: number;
  hash: string;
  amountXrp?: number;
  /** Epoch millis — the rail renders this as relative time. */
  at: number;
};

/** One closed ledger, kept for the strip charts. */
export type LedgerTick = {
  index: number;
  txnCount: number;
  baseFeeXrp: number;
  closeTime: string;
  /**
   * Epoch millis of the close itself. Zero when the node omitted it.
   *
   * Good for labelling a ledger. **Useless for measuring cadence** — see
   * `receivedAt`.
   */
  closeAt: number;
  /**
   * Epoch millis when this close reached this machine.
   *
   * Cadence has to be measured from this rather than from `closeAt`, because
   * `ledger_time` is not a timestamp of the resolution that implies. XRPL
   * rounds a close time to `close_time_resolution`, and when the rounded
   * value collides with the parent ledger's it takes parent + 1 second
   * instead. Consecutive closes inside one resolution bucket therefore report
   * intervals of exactly 1s, and the bucket boundary reports 8s or 9s.
   *
   * Measured against mainnet on 2026-09-15: thirty-three consecutive
   * intervals read 9,1,1,8,1,1,8… — never once the three to four seconds the
   * network actually runs at. Their mean was 3.94s, which is correct, because
   * the rounding preserves the total and destroys the distribution. Drawing
   * those numbers per-interval reported a healthy network as eighteen closes
   * out of band.
   *
   * Arrival interval is a real measurement and is labelled as what it is: it
   * includes this machine's network path, exactly as `roundTripMs` in
   * net/sync.ts does, and it is never presented as the ledger's own rhythm.
   */
  receivedAt: number;
};

const HISTORY_LIMIT = 48;
const EVENT_LIMIT = 60;
const POLL_INTERVAL_MS = 30_000;

export type XrplState = ReturnType<typeof useXRPL>;

/**
 * useXRPL — the console's single connection to mainnet.
 *
 * Combines polled RPC state (account, server, validated ledger) with a
 * live WebSocket subscription, and keeps a rolling window of ledger
 * closes so the charts have real history to draw rather than noise.
 */
export function useXRPL(address: string) {
  const [ledger, setLedger] = useState<LedgerInfo | null>(null);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [credentials, setCredentials] = useState<CredentialRecord[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [server, setServer] = useState<ServerInfo | null>(null);
  const [connected, setConnected] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [credentialError, setCredentialError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [history, setHistory] = useState<LedgerTick[]>([]);
  const [latencyMs, setLatencyMs] = useState(0);
  const eventSeq = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const [ledgerInfo, serverInfo] = await Promise.all([
        fetchLedger(),
        fetchServerInfo(),
      ]);
      setLedger(ledgerInfo);
      setServer(serverInfo);
      setLatencyMs(getLastLatencyMs());
      setLedgerError(null);
    } catch (error) {
      setLedgerError(error instanceof Error ? error.message : "Network error");
    }
  }, []);

  const refreshAccount = useCallback(async () => {
    if (!isValidAddress(address)) {
      setAccount(null);
      setCredentials([]);
      setTransactions([]);
      setAccountError("Address is not a valid XRPL classic address.");
      return;
    }

    setLoadingAccount(true);
    setAccountError(null);
    try {
      // Settled, not all-or-nothing: a node that refuses `account_tx`
      // should not also blank out the balance we did manage to read.
      const [accountResult, credentialResult, activityResult] =
        await Promise.allSettled([
          fetchAccount(address),
          fetchWalletCredentials(address),
          fetchWalletTransactions(address),
        ]);

      if (accountResult.status === "fulfilled") {
        setAccount(accountResult.value);
      } else {
        setAccount(null);
        setAccountError(
          accountResult.reason instanceof Error
            ? accountResult.reason.message
            : "Unable to read account"
        );
      }

      if (credentialResult.status === "fulfilled") {
        setCredentials(credentialResult.value);
        setCredentialError(null);
      } else {
        setCredentials([]);
        setCredentialError(
          credentialResult.reason instanceof Error
            ? credentialResult.reason.message
            : "Unable to read credential objects"
        );
      }
      if (activityResult.status === "fulfilled") {
        setTransactions(activityResult.value);
        setActivityError(null);
      } else {
        setTransactions([]);
        setActivityError(
          activityResult.reason instanceof Error
            ? activityResult.reason.message
            : "Unable to read account activity"
        );
      }
    } finally {
      setLoadingAccount(false);
    }
  }, [address]);

  useEffect(() => {
    void refreshAccount();
  }, [refreshAccount]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    const unsubscribe = subscribeLedger(
      (message: LedgerStreamMessage) => {
        if (message.type === "ledgerClosed") {
          setHistory((prev) =>
            [
              ...prev,
              {
                index: message.ledgerIndex,
                txnCount: message.txnCount,
                baseFeeXrp: Number(message.baseFeeXrp),
                closeTime: message.closeTime,
                closeAt: message.closeAt,
                receivedAt: Date.now(),
              },
            ].slice(-HISTORY_LIMIT)
          );
          // The stream is fresher than the 30s poll; keep the header live.
          setLedger((prev) =>
            prev
              ? {
                  ...prev,
                  ledgerIndex: message.ledgerIndex,
                  ledgerHash: message.ledgerHash,
                  txnCount: message.txnCount,
                  baseFeeXrp: message.baseFeeXrp,
                }
              : prev
          );
          return;
        }

        eventSeq.current += 1;
        const event: LiveEvent = {
          id: eventSeq.current,
          account: message.account,
          type: message.transactionType,
          result: message.result,
          ledger: message.ledgerIndex,
          hash: message.hash,
          amountXrp: message.amountXrp,
          at: Date.now(),
        };
        setEvents((prev) => [event, ...prev].slice(0, EVENT_LIMIT));
      },
      setConnected
    );
    return unsubscribe;
  }, []);

  /**
   * Successful transactions as a share of the live window, or null when
   * nothing has been observed. It used to read 100 with an empty window,
   * so a console that had never connected reported a perfect stream.
   */
  const successRate: number | null =
    events.length === 0
      ? null
      : Math.round(
          (events.filter((event) => event.result === "tesSUCCESS").length /
            events.length) *
            100
        );

  return {
    ledger,
    account,
    credentials,
    transactions,
    server,
    connected,
    ledgerError,
    accountError,
    credentialError,
    activityError,
    loadingAccount,
    events,
    history,
    latencyMs,
    successRate,
    refresh,
    refreshAccount,
  };
}
