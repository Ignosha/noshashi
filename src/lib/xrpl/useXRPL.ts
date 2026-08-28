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

      setCredentials(
        credentialResult.status === "fulfilled" ? credentialResult.value : []
      );
      setTransactions(
        activityResult.status === "fulfilled" ? activityResult.value : []
      );
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

  /** Successful transactions as a share of the live window. */
  const successRate =
    events.length === 0
      ? 100
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
    loadingAccount,
    events,
    history,
    latencyMs,
    successRate,
    refresh,
    refreshAccount,
  };
}
