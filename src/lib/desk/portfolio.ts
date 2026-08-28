import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { fetchAccount, fetchWalletCredentials, isValidAddress } from "@/lib/xrpl/client";
import { DOMAIN_REGISTRY, evaluatePolicy, heldCredentialTypes } from "@/lib/policy";
import { rippleTimeToDate } from "@/lib/format";
import type { AccountInfo, CredentialRecord, Status } from "@/lib/xrpl/types";
import { useAuth } from "@/lib/auth/useAuth";

/**
 * Desk portfolios — a book of accounts watched at once.
 *
 * The wallet list is stored per-account in Postgres behind row level
 * security; the ledger state for each is read live and evaluated through
 * the same policy engine the single-wallet gate uses, so a portfolio row
 * and a Verification verdict can never disagree.
 */

export type PortfolioWallet = {
  id: string;
  address: string;
  label: string | null;
};

export type WalletSnapshot = {
  address: string;
  label: string | null;
  account: AccountInfo | null;
  credentials: CredentialRecord[];
  verdict: Status;
  failing: number;
  error: string | null;
  loading: boolean;
};

/** Read a handful of accounts without hammering the public node. */
async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  });

  await Promise.all(runners);
  return results;
}

export function usePortfolio() {
  const { user } = useAuth();
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const [wallets, setWallets] = useState<PortfolioWallet[]>([]);
  const [snapshots, setSnapshots] = useState<WalletSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Ensure the account has a default book to add wallets to. */
  const ensurePortfolio = useCallback(async (): Promise<string | null> => {
    if (!user) return null;
    const db = supabase().schema("noshashi");

    const { data: existing, error: readError } = await db
      .from("portfolios")
      .select("id")
      .eq("account_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (existing?.id) return existing.id as string;

    const { data: created, error: insertError } = await db
      .from("portfolios")
      .insert({ account_id: user.id, name: "Primary book" })
      .select("id")
      .single();
    if (insertError) throw new Error(insertError.message);
    return created.id as string;
  }, [user]);

  const loadWallets = useCallback(async () => {
    if (!user) {
      setWallets([]);
      setSnapshots([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const id = await ensurePortfolio();
      setPortfolioId(id);
      if (!id) return;

      const { data, error: readError } = await supabase()
        .schema("noshashi")
        .from("portfolio_wallets")
        .select("id, address, label")
        .eq("portfolio_id", id)
        .order("created_at", { ascending: true });
      if (readError) throw new Error(readError.message);

      setWallets(
        (data ?? []).map((row) => ({
          id: row.id as string,
          address: row.address as string,
          label: (row.label as string) ?? null,
        }))
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read portfolio");
    } finally {
      setLoading(false);
    }
  }, [user, ensurePortfolio]);

  useEffect(() => {
    void loadWallets();
  }, [loadWallets]);

  /** Read live ledger state and run the gate for every watched wallet. */
  const refreshSnapshots = useCallback(async () => {
    if (wallets.length === 0) {
      setSnapshots([]);
      return;
    }

    setSnapshots(
      wallets.map((wallet) => ({
        address: wallet.address,
        label: wallet.label,
        account: null,
        credentials: [],
        verdict: "hold" as Status,
        failing: 0,
        error: null,
        loading: true,
      }))
    );

    const results = await mapWithLimit(wallets, 3, async (wallet) => {
      try {
        const [account, credentials] = await Promise.all([
          fetchAccount(wallet.address),
          fetchWalletCredentials(wallet.address),
        ]);
        const evaluation = evaluatePolicy({
          account,
          credentials,
          domain: DOMAIN_REGISTRY[0],
          amountXrp: 0,
        });
        return {
          address: wallet.address,
          label: wallet.label,
          account,
          credentials,
          verdict: evaluation.verdict,
          failing: evaluation.checks.filter((check) => !check.passed).length,
          error: null,
          loading: false,
        } satisfies WalletSnapshot;
      } catch (caught) {
        return {
          address: wallet.address,
          label: wallet.label,
          account: null,
          credentials: [],
          verdict: "no-go" as Status,
          failing: 0,
          error: caught instanceof Error ? caught.message : "Unreadable",
          loading: false,
        } satisfies WalletSnapshot;
      }
    });

    setSnapshots(results);
  }, [wallets]);

  useEffect(() => {
    void refreshSnapshots();
  }, [refreshSnapshots]);

  const addWallet = useCallback(
    async (address: string, label?: string) => {
      const trimmed = address.trim();
      if (!isValidAddress(trimmed)) {
        throw new Error("Not a valid XRPL classic address.");
      }
      const id = portfolioId ?? (await ensurePortfolio());
      if (!id) throw new Error("Sign in to keep a portfolio.");

      const { error: insertError } = await supabase()
        .schema("noshashi")
        .from("portfolio_wallets")
        .insert({ portfolio_id: id, address: trimmed, label: label?.trim() || null });
      if (insertError) {
        throw new Error(
          insertError.code === "23505"
            ? "That address is already in this book."
            : insertError.message
        );
      }
      await loadWallets();
    },
    [portfolioId, ensurePortfolio, loadWallets]
  );

  const removeWallet = useCallback(
    async (id: string) => {
      const { error: deleteError } = await supabase()
        .schema("noshashi")
        .from("portfolio_wallets")
        .delete()
        .eq("id", id);
      if (deleteError) throw new Error(deleteError.message);
      await loadWallets();
    },
    [loadWallets]
  );

  return {
    wallets,
    snapshots,
    loading,
    error,
    addWallet,
    removeWallet,
    refresh: refreshSnapshots,
    reload: loadWallets,
  };
}

export type DeskAlert = {
  id: string;
  kind: "policy_drift" | "credential_expiry" | "domain_governance" | "reserve";
  severity: "info" | "warn" | "critical";
  title: string;
  body: string;
  address?: string;
  domainCode?: string;
};

/**
 * The radar: derive alerts from live state.
 *
 * Every alert here is computed from something the ledger actually says —
 * an expiry timestamp, a missing credential, a suspended domain, a
 * balance under reserve — rather than from a schedule or a guess.
 */
export function deriveAlerts(snapshots: WalletSnapshot[]): DeskAlert[] {
  const alerts: DeskAlert[] = [];
  const now = Date.now();
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

  for (const snapshot of snapshots) {
    if (snapshot.loading) continue;
    const shortLabel = snapshot.label ?? snapshot.address;

    if (snapshot.error) {
      alerts.push({
        id: `err-${snapshot.address}`,
        kind: "policy_drift",
        severity: "warn",
        title: "Account unreadable",
        body: `${shortLabel}: ${snapshot.error}`,
        address: snapshot.address,
      });
      continue;
    }

    // Reserve pressure — the wallet is close to being unable to transact.
    if (snapshot.account) {
      const balance = Number(snapshot.account.balanceXrp);
      const reserve = 1 + snapshot.account.ownerCount * 0.2;
      const headroom = balance - reserve;
      if (headroom < 0) {
        alerts.push({
          id: `reserve-${snapshot.address}`,
          kind: "reserve",
          severity: "critical",
          title: "Below owner reserve",
          body: `${shortLabel} holds ${balance.toFixed(2)} XRP against a ${reserve.toFixed(
            1
          )} XRP reserve. It cannot settle.`,
          address: snapshot.address,
        });
      } else if (headroom < reserve * 0.25) {
        alerts.push({
          id: `reserve-low-${snapshot.address}`,
          kind: "reserve",
          severity: "warn",
          title: "Reserve headroom thin",
          body: `${shortLabel} has ${headroom.toFixed(2)} XRP spendable above reserve.`,
          address: snapshot.address,
        });
      }
    }

    // Credential expiry radar.
    for (const credential of snapshot.credentials) {
      if (!credential.expiration) continue;
      const expiresAt = rippleTimeToDate(credential.expiration).getTime();
      const remaining = expiresAt - now;
      if (remaining < 0) {
        alerts.push({
          id: `expired-${snapshot.address}-${credential.credentialType}`,
          kind: "credential_expiry",
          severity: "critical",
          title: "Credential expired",
          body: `${shortLabel}: ${credential.credentialType} lapsed on ${new Date(
            expiresAt
          ).toLocaleDateString()}.`,
          address: snapshot.address,
        });
      } else if (remaining < THIRTY_DAYS) {
        alerts.push({
          id: `expiring-${snapshot.address}-${credential.credentialType}`,
          kind: "credential_expiry",
          severity: "warn",
          title: "Credential expiring",
          body: `${shortLabel}: ${credential.credentialType} expires in ${Math.ceil(
            remaining / (24 * 60 * 60 * 1000)
          )} days.`,
          address: snapshot.address,
        });
      }
    }

    // Policy drift: which domains this wallet has just fallen out of.
    const held = heldCredentialTypes(snapshot.credentials);
    for (const domain of DOMAIN_REGISTRY) {
      if (domain.governance === "suspended") continue;
      const missing = domain.requirements.filter(
        (requirement) => !held.has(requirement)
      );
      // Partially eligible is the interesting case: one credential away.
      if (missing.length > 0 && missing.length < domain.requirements.length) {
        alerts.push({
          id: `drift-${snapshot.address}-${domain.id}`,
          kind: "policy_drift",
          severity: missing.length === 1 ? "warn" : "info",
          title: `${missing.length} credential${
            missing.length === 1 ? "" : "s"
          } short of ${domain.code}`,
          body: `${shortLabel} is missing ${missing.join(", ")} for ${domain.name}.`,
          address: snapshot.address,
          domainCode: domain.code,
        });
      }
    }
  }

  // Domain-level governance changes affect the whole book.
  for (const domain of DOMAIN_REGISTRY) {
    if (domain.governance === "suspended") {
      alerts.push({
        id: `gov-${domain.id}`,
        kind: "domain_governance",
        severity: "critical",
        title: `${domain.code} suspended`,
        body: `${domain.name} is not enforcing settlements. Anything routed there will be refused.`,
        domainCode: domain.code,
      });
    } else if (domain.governance === "review") {
      alerts.push({
        id: `gov-${domain.id}`,
        kind: "domain_governance",
        severity: "warn",
        title: `${domain.code} under governance review`,
        body: `${domain.name} holds settlements for manual sign-off while its policy set is reviewed.`,
        domainCode: domain.code,
      });
    }
  }

  const rank = { critical: 0, warn: 1, info: 2 };
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
