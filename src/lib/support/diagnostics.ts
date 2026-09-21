import { isTauri } from "@/lib/env";
import { isValidAddress } from "@/lib/xrpl/client";
import { xrplLink } from "@/lib/xrpl/link";
import { autodetect } from "@/lib/agent/client";
import type { XrplState } from "@/lib/xrpl/useXRPL";

/**
 * Self-healing diagnostics.
 *
 * Every check is a real probe of something that actually breaks, and a
 * check that can repair itself carries the repair. This is the support
 * path that works on the free tier with no account, no AI runtime and no
 * network round trip to us — most "it's broken" reports are one of these
 * eight things, and the user can resolve them without waiting on a human.
 */

export type CheckState = "pass" | "warn" | "fail" | "running";

export type Diagnostic = {
  id: string;
  label: string;
  state: CheckState;
  detail: string;
  /** Present when the console can repair this itself. */
  fix?: { label: string; run: () => Promise<string> };
};

export type DiagnosticsInput = {
  data: XrplState;
  address: string;
  onResync: () => void;
};

export async function runDiagnostics({
  data,
  address,
  onResync,
}: DiagnosticsInput): Promise<Diagnostic[]> {
  const checks: Diagnostic[] = [];

  // 1 · Ledger link
  checks.push(
    data.connected
      ? {
          id: "link",
          label: "Mainnet link",
          state: "pass",
          detail: `Connected. Last validated ledger ${
            data.ledger?.ledgerIndex?.toLocaleString() ?? "pending"
          }.`,
        }
      : {
          id: "link",
          label: "Mainnet link",
          state: "fail",
          detail:
            "No live connection to an XRPL node. Usually a local network block on outbound WebSockets.",
          fix: {
            label: "Reconnect",
            run: async () => {
              onResync();
              await new Promise((resolve) => setTimeout(resolve, 1500));
              return xrplLink.isConnected()
                ? "Reconnected to mainnet."
                : "Still unreachable — check whether a firewall or VPN is blocking wss:// on port 443.";
            },
          },
        }
  );

  // 2 · Round-trip latency
  const latency = data.latencyMs;
  checks.push({
    id: "latency",
    label: "Node latency",
    state: latency === 0 ? "warn" : latency > 1200 ? "warn" : "pass",
    detail:
      latency === 0
        ? "No successful round trip measured yet."
        : `${latency}ms round trip.${latency > 1200 ? " Slower than usual; the public node may be loaded." : ""}`,
  });

  // 3 · Watched wallet
  checks.push(
    !isValidAddress(address)
      ? {
          id: "wallet",
          label: "Watched wallet",
          state: "fail",
          detail:
            "The configured address is not a valid XRPL classic address. It should start with r and be 25–35 characters.",
        }
      : data.accountError
        ? {
            id: "wallet",
            label: "Watched wallet",
            state: "fail",
            detail: data.accountError,
            fix: {
              label: "Re-read account",
              run: async () => {
                await data.refreshAccount();
                return "Account re-read from the validated ledger.";
              },
            },
          }
        : data.account?.unfunded
          ? {
              id: "wallet",
              label: "Watched wallet",
              state: "warn",
              detail:
                "The address is well-formed but has never been funded, so it has no ledger state to evaluate.",
            }
          : {
              id: "wallet",
              label: "Watched wallet",
              state: "pass",
              detail: `Reading ${address}. Balance ${data.account?.balanceXrp ?? "0"} XRP.`,
            }
  );

  // 4 · Reserve solvency — the most common cause of a surprise NO-GO
  if (data.account) {
    const balance = Number(data.account.balanceXrp);
    const reserve = 1 + data.account.ownerCount * 0.2;
    checks.push({
      id: "reserve",
      label: "Reserve headroom",
      state: balance < reserve ? "fail" : balance - reserve < reserve * 0.25 ? "warn" : "pass",
      detail:
        balance < reserve
          ? `Balance ${balance.toFixed(2)} XRP is below the ${reserve.toFixed(1)} XRP reserve for ${data.account.ownerCount} owned objects. The account cannot settle until it is topped up.`
          : `${(balance - reserve).toFixed(2)} XRP spendable above a ${reserve.toFixed(1)} XRP reserve.`,
    });
  }

  // 5 · Credential registry
  checks.push({
    id: "credentials",
    label: "Credential registry",
    state: data.credentials.length > 0 ? "pass" : "warn",
    detail:
      data.credentials.length > 0
        ? `${data.credentials.length} credential object(s) found on-ledger.`
        : "No XLS-70 credentials on this account. That is normal — most mainnet accounts have none yet, and every domain rule requiring one will read NO-GO.",
  });

  // 6 · Local AI runtime
  const runtime = await autodetect().catch(() => null);
  checks.push(
    runtime
      ? {
          id: "agent",
          label: "AI runtime",
          state: "pass",
          detail: `Local runtime detected at ${runtime.baseUrl} (${runtime.model || "no model selected"}).`,
        }
      : {
          id: "agent",
          label: "AI runtime",
          state: "warn",
          detail:
            "No local model runtime found. Support answers still work — they fall back to the built-in knowledge base, which needs no AI at all.",
        }
  );

  // 7 · Desktop integration
  checks.push({
    id: "runtime",
    label: "Desktop integration",
    state: isTauri ? "pass" : "warn",
    detail: isTauri
      ? "Running as the desktop app. Menu bar HUD, notifications, keyring and global shortcut are available."
      : "Running in a browser. The menu bar HUD, OS keyring and native notifications need the desktop build.",
  });

  // 8 · Preference storage
  checks.push({
    id: "storage",
    label: "Preference storage",
    state: (() => {
      try {
        window.localStorage.setItem("noshashi:probe", "1");
        window.localStorage.removeItem("noshashi:probe");
        return "pass" as const;
      } catch {
        return "warn" as const;
      }
    })(),
    detail: isTauri
      ? "Preferences are written to the application data directory."
      : "Preferences are written to browser storage. Private browsing may discard them.",
  });

  return checks;
}
