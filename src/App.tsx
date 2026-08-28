import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PatternMark } from "@/components/nova/brand/BrandPattern";
import { TitleBar } from "@/components/nova/TitleBar";
import { StatusRail } from "@/components/nova/StatusRail";
import { Preloader } from "@/components/nova/Preloader";
import { NovaLogo } from "@/components/nova/NovaLogo";
import { ErrorBoundary } from "@/components/nova/ErrorBoundary";
import { CommandPalette, type Command } from "@/components/nova/CommandPalette";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  NovaBolt,
  NovaCredit,
  NovaEye,
  NovaFlare,
  NovaGrid,
  NovaSat,
  NovaShield,
  NovaTerminal,
  NovaVault,
  NovaChevron,
  NovaSearch,
} from "@/components/nova/NovaIcon";
import { LandingScene } from "@/components/scenes/LandingScene";
/**
 * Scenes past the startup path are code-split.
 *
 * Mission Control, Verification and the mission brief are what an
 * operator hits in the first seconds, so they stay in the main chunk.
 * Billing, legal, the agent and the desk surfaces are each a separate
 * request that only happens if someone actually opens them.
 */
const AuthScene = lazy(() =>
  import("@/components/scenes/AuthScene").then((m) => ({ default: m.AuthScene }))
);
const PlansScene = lazy(() =>
  import("@/components/scenes/PlansScene").then((m) => ({ default: m.PlansScene }))
);
const DeskScene = lazy(() =>
  import("@/components/scenes/DeskScene").then((m) => ({ default: m.DeskScene }))
);
const RiskScene = lazy(() =>
  import("@/components/scenes/RiskScene").then((m) => ({ default: m.RiskScene }))
);
const WorkstationScene = lazy(() =>
  import("@/components/scenes/WorkstationScene").then((m) => ({ default: m.WorkstationScene }))
);
const IssuanceScene = lazy(() =>
  import("@/components/scenes/IssuanceScene").then((m) => ({ default: m.IssuanceScene }))
);
const SettlementScene = lazy(() =>
  import("@/components/scenes/SettlementScene").then((m) => ({ default: m.SettlementScene }))
);
const NetworkScene = lazy(() =>
  import("@/components/scenes/NetworkScene").then((m) => ({ default: m.NetworkScene }))
);
const AmmScene = lazy(() =>
  import("@/components/scenes/AmmScene").then((m) => ({ default: m.AmmScene }))
);
const ControlScene = lazy(() =>
  import("@/components/scenes/ControlScene").then((m) => ({ default: m.ControlScene }))
);
const GrowthScene = lazy(() =>
  import("@/components/scenes/GrowthScene").then((m) => ({ default: m.GrowthScene }))
);
const LearnScene = lazy(() =>
  import("@/components/scenes/LearnScene").then((m) => ({ default: m.LearnScene }))
);
const SafeShopScene = lazy(() =>
  import("@/components/scenes/SafeShopScene").then((m) => ({ default: m.SafeShopScene }))
);
const AccountScene = lazy(() =>
  import("@/components/scenes/AccountScene").then((m) => ({ default: m.AccountScene }))
);
import { HomeScene } from "@/components/scenes/HomeScene";
import { MissionControlScene } from "@/components/scenes/MissionControlScene";
import { VerificationScene } from "@/components/scenes/VerificationScene";
import { CredentialsScene } from "@/components/scenes/CredentialsScene";
import { DomainsScene } from "@/components/scenes/DomainsScene";
const HistoryScene = lazy(() =>
  import("@/components/scenes/HistoryScene").then((m) => ({ default: m.HistoryScene }))
);
const AgentScene = lazy(() =>
  import("@/components/scenes/AgentScene").then((m) => ({ default: m.AgentScene }))
);
const RevenueScene = lazy(() =>
  import("@/components/scenes/RevenueScene").then((m) => ({ default: m.RevenueScene }))
);
const LegalScene = lazy(() =>
  import("@/components/scenes/LegalScene").then((m) => ({ default: m.LegalScene }))
);
import { SettingsScene } from "@/components/scenes/SettingsScene";
import { TrayScene } from "@/components/scenes/TrayScene";
import { useXRPL } from "@/lib/xrpl/useXRPL";
import { useSetting } from "@/lib/store";
import { isTauri, isTrayView } from "@/lib/env";
import { ToastProvider, useToast } from "@/lib/toast";
import { AppearanceProvider } from "@/lib/appearance";
import { AuthProvider, useAuth } from "@/lib/auth/useAuth";
import { BillingProvider, useBilling } from "@/lib/billing/useEntitlements";
import { SkipLink, Announcer } from "@/components/nova/A11y";
import { AccessibilityWidget } from "@/components/nova/AccessibilityWidget";
import { BRAND } from "@/lib/brand";
import { sceneVariants } from "@/lib/motion";
import { useTrayTicker } from "@/lib/trayTicker";
import { cn } from "@/lib/utils";
import type { Status } from "@/lib/xrpl/types";
import { DOMAIN_REGISTRY, evaluatePolicy } from "@/lib/policy";

export type SceneId =
  | "home"
  | "control"
  | "verify"
  | "credentials"
  | "domains"
  | "history"
  | "agent"
  | "desk"
  | "risk"
  | "workstation"
  | "safeshop"
  | "learn"
  | "growth"
  | "issuance"
  | "amm"
  | "network"
  | "settlement"
  | "treasury"
  | "plans"
  | "account"
  | "revenue"
  | "legal"
  | "settings";

type SceneDef = {
  id: SceneId;
  label: string;
  /** Window/document title for this scene. */
  title: string;
  hint: string;
  icon: React.ReactNode;
  digit: string;
  group: "primary" | "utility" | "hidden";
  /** Paid capability this scene needs, when it needs one. */
  requires?: string;
};

/**
 * Sidebar sections.
 *
 * The brand board's sidebar is wide, labelled and grouped — OVERVIEW,
 * MARKETS, ON-CHAIN, MACRO, ALERTS, WATCHLIST — not a strip of unlabelled
 * icons. These are the same headings mapped onto what this application
 * actually does, so the information architecture matches the board without
 * inventing a destination that has nothing behind it.
 */
const NAV_SECTIONS: Array<{ id: string; label: string; scenes: SceneId[] }> = [
  { id: "overview", label: "OVERVIEW", scenes: ["home", "control"] },
  { id: "adjudication", label: "ADJUDICATION", scenes: ["verify", "credentials", "domains"] },
  { id: "markets", label: "MARKETS & EXPOSURE", scenes: ["risk", "desk", "amm"] },
  { id: "treasury", label: "TREASURY & ISSUANCE", scenes: ["treasury", "issuance"] },
  { id: "record", label: "RECORD", scenes: ["history", "settlement", "workstation"] },
  { id: "intelligence", label: "INTELLIGENCE", scenes: ["agent"] },
  { id: "public", label: "PUBLIC", scenes: ["safeshop", "network", "learn"] },
  { id: "growth", label: "GROWTH", scenes: ["growth"] },
];

const SCENES: SceneDef[] = [
  {
    id: "home",
    label: "OVERVIEW",
    title: "OVERVIEW",
    hint: "What NOSHASHI is, what it does, and what is coming",
    icon: <NovaSat size={15} />,
    digit: "1",
    group: "primary",
  },
  {
    id: "control",
    label: "MISSION CONTROL",
    title: "MISSION CONTROL",
    hint: "Live mainnet telemetry and the wallet gate",
    icon: <NovaFlare size={15} />,
    digit: "2",
    group: "primary",
  },
  {
    id: "verify",
    label: "VERIFICATION",
    title: "VERIFICATION",
    hint: "Run a settlement through the compliance gate",
    icon: <NovaShield size={15} />,
    digit: "3",
    group: "primary",
  },
  {
    id: "credentials",
    label: "CREDENTIALS",
    title: "CREDENTIAL REGISTRY",
    hint: "XLS-70 credential registry and selective disclosure",
    icon: <NovaCredit size={15} />,
    digit: "4",
    group: "primary",
  },
  {
    id: "domains",
    label: "DOMAIN GRID",
    title: "DOMAIN GRID",
    hint: "XLS-80 permissioned domains and policy state",
    icon: <NovaGrid size={15} />,
    digit: "5",
    group: "primary",
  },
  {
    id: "history",
    label: "AUDIT TRAIL",
    title: "AUDIT TRAIL",
    hint: "Wallet history with exportable compliance metadata",
    icon: <NovaTerminal size={15} />,
    digit: "6",
    group: "primary",
  },
  {
    id: "agent",
    label: "AGENT",
    title: "COMPLIANCE AGENT",
    hint: "On-device analyst and support desk",
    icon: <NovaEye size={15} />,
    digit: "7",
    group: "primary",
  },
  {
    id: "desk",
    label: "PORTFOLIO & RADAR",
    title: "PORTFOLIO & RADAR",
    hint: "Multi-wallet surveillance and the compliance radar",
    icon: <NovaGrid size={15} />,
    digit: "8",
    group: "primary",
    requires: "portfolios",
  },
  {
    id: "risk",
    label: "EXPOSURE ANALYSIS",
    title: "EXPOSURE ANALYSIS",
    hint: "Issuer freeze rights, Travel Rule scope and counterparty concentration",
    icon: <NovaVault size={15} />,
    digit: "9",
    group: "primary",
    requires: "portfolios",
  },
  {
    id: "workstation",
    label: "LEDGER & POLICY",
    title: "LEDGER & POLICY",
    hint: "Local adjudication history, editable rule set and signed export",
    icon: <NovaTerminal size={15} />,
    digit: "0",
    group: "primary",
    requires: "portfolios",
  },
  {
    id: "safeshop",
    label: "CHECK AN ADDRESS",
    title: "CHECK AN ADDRESS",
    hint: "Read what the ledger publishes about any account before you pay it",
    icon: <NovaSearch size={15} />,
    digit: "",
    group: "primary",
  },
  {
    id: "learn",
    label: "LEARN",
    title: "LEARN",
    hint: "Short animated explainers — the gate, freeze rights, book depth, the address check",
    icon: <NovaEye size={15} />,
    digit: "",
    group: "primary",
  },
  {
    id: "treasury",
    label: "CONTROL SURFACE",
    title: "CONTROL SURFACE",
    hint: "Who can move this treasury — signers, quorum, master key, locked reserve",
    icon: <NovaShield size={15} />,
    digit: "",
    group: "primary",
    requires: "portfolios",
  },
  {
    id: "issuance",
    label: "ISSUANCE",
    title: "ISSUANCE",
    hint: "Holder concentration and enforcement history for any issuance",
    icon: <NovaVault size={15} />,
    digit: "",
    group: "primary",
    requires: "compliance_api",
  },
  {
    id: "settlement",
    label: "SETTLEMENT",
    title: "SETTLEMENT",
    hint: "What a transaction actually delivered, not what it requested",
    icon: <NovaCredit size={15} />,
    digit: "",
    group: "primary",
    requires: "portfolios",
  },
  {
    id: "network",
    label: "LEDGER SYNC",
    title: "LEDGER SYNC",
    hint: "What four public nodes each report, and where they disagree — free",
    icon: <NovaSat size={15} />,
    digit: "",
    group: "primary",
  },
  {
    id: "amm",
    label: "POOL GOVERNANCE",
    title: "POOL GOVERNANCE",
    hint: "Who votes an AMM's fee, on what share of liquidity, and who holds the discount",
    icon: <NovaGrid size={15} />,
    digit: "",
    group: "primary",
    requires: "portfolios",
  },
  {
    id: "growth",
    label: "GROWTH",
    title: "GROWTH",
    hint: "Platform-native drafts built from measured figures — you post them",
    icon: <NovaBolt size={15} />,
    digit: "",
    group: "primary",
  },
  {
    id: "plans",
    label: "PRICING",
    title: "PRICING",
    hint: "Plans, checkout and verification credits",
    icon: <NovaCredit size={15} />,
    digit: "",
    group: "utility",
  },
  {
    id: "account",
    label: "ACCOUNT",
    title: "ACCOUNT",
    hint: "Subscription, two-factor authentication and API keys",
    icon: <NovaShield size={15} />,
    digit: "",
    group: "utility",
  },
  {
    id: "revenue",
    label: "BUSINESS PLAN",
    title: "BUSINESS PLAN",
    hint: "Revenue streams, tiers and sequencing",
    icon: <NovaBolt size={15} />,
    digit: "",
    group: "hidden",
  },
  {
    id: "legal",
    label: "LEGAL & ACCESSIBILITY",
    title: "LEGAL & ACCESSIBILITY",
    hint: "Policies, accessibility statement and contact routes",
    icon: <NovaEye size={15} />,
    digit: "",
    group: "hidden",
  },
  {
    id: "settings",
    label: "SETTINGS",
    title: "SETTINGS",
    hint: "Appearance, accessibility, wallet and desktop integration",
    icon: <NovaVault size={15} />,
    digit: "",
    group: "utility",
  },
];

const SCENE_BY_ID = new Map(SCENES.map((scene) => [scene.id, scene]));

/**
 * A well-known, heavily-used mainnet account so the console has real
 * history to render on first launch. Replaced from Settings.
 */
const DEFAULT_WALLET = "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B";

export default function App() {
  return (
    <AppearanceProvider>
      <AuthProvider>
        <BillingProvider>
          <ToastProvider>
            {isTrayView ? <TrayApp /> : <ConsoleApp />}
          </ToastProvider>
        </BillingProvider>
      </AuthProvider>
    </AppearanceProvider>
  );
}

/** The menu bar HUD — no chrome, no navigation, one answer. */
function TrayApp() {
  const [address] = useSetting("wallet.address", DEFAULT_WALLET);
  const data = useXRPL(address);

  const gate = evaluatePolicy({
    account: data.account,
    credentials: data.credentials,
    domain: DOMAIN_REGISTRY[0],
    amountXrp: 0,
  });

  useTrayTicker({
    verdict: gate.verdict,
    ledgerIndex: data.ledger?.ledgerIndex,
    connected: data.connected,
  });

  return (
    <div className="relative h-full w-full overflow-hidden bg-background text-foreground">
      <ErrorBoundary scope="Menu bar HUD">
        <TrayScene data={data} />
      </ErrorBoundary>
    </div>
  );
}

function ConsoleApp() {
  const [scene, setScene] = useState<SceneId>("home");
  /**
   * boot → the launch sequence, landing → the mission brief,
   * console → the instrument. Returning operators skip the brief.
   */
  const [stage, setStage] = useState<"boot" | "landing" | "console">("boot");
  // The board's sidebar is open by default; collapsing is an escape hatch
  // for narrow windows, not the resting state.
  const [railOpen, setRailOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth >= 1180
  );
  // Below ~1180 the labelled sidebar costs more than it gives: the content
  // columns start truncating their own labels. Collapse to icons and let
  // the operator reopen it deliberately if they want it back.
  useEffect(() => {
    let manual = false;
    const onResize = () => {
      if (manual) return;
      setRailOpen(window.innerWidth >= 1180);
    };
    window.addEventListener("resize", onResize);
    return () => {
      manual = true;
      window.removeEventListener("resize", onResize);
    };
  }, []);
  const [authOpen, setAuthOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [address, setAddress] = useSetting("wallet.address", DEFAULT_WALLET);
  const [notificationsEnabled, setNotificationsEnabled] = useSetting(
    "notifications.enabled",
    true
  );
  const [onboarded, setOnboarded, onboardedReady] = useSetting(
    "console.onboarded",
    false
  );
  const { push } = useToast();
  const { user, signOut } = useAuth();
  const { entitlement } = useBilling();

  const data = useXRPL(address);
  const { connected, ledgerError, ledger, events, latencyMs, refresh, refreshAccount } =
    data;

  const active = SCENE_BY_ID.get(scene) ?? SCENES[0];
  /**
   * Data freshness. The board asks the interface to answer "when was this
   * updated?" without the operator going looking, so the age of the newest
   * validated read is carried in the title bar. Measured from arrival
   * rather than from the ledger's own close time, because that is the fact
   * the operator cares about: how long since *we* last heard.
   */
  const [lastLedgerAt, setLastLedgerAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (data.ledger?.ledgerIndex) setLastLedgerAt(Date.now());
  }, [data.ledger?.ledgerIndex]);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const ledgerAgeSeconds = (now - lastLedgerAt) / 1000;

  const linkStatus: Status = ledgerError ? "hold" : connected ? "go" : "no-go";
  const linkLabel = ledgerError ? "DEGRADED" : connected ? "ONLINE" : "OFFLINE";

  // Keep the window/tab title in step with the visible scene.
  useEffect(() => {
    document.title = `${BRAND.name} · ${active.title}`;
  }, [active.title]);

  const goTo = useCallback((next: string) => {
    if (!SCENE_BY_ID.has(next as SceneId)) return;
    setScene(next as SceneId);
    setStage("console");
  }, []);

  const openPlans = useCallback(() => {
    setScene("plans");
    setStage("console");
  }, []);

  const openAuth = useCallback(() => setAuthOpen(true), []);

  const enterConsole = useCallback(() => {
    if (!onboarded) setOnboarded(true);
    setStage("console");
  }, [onboarded, setOnboarded]);

  /** The launch sequence ends in the brief, or straight in for regulars. */
  const finishBoot = useCallback(() => {
    // If preferences have not hydrated yet, show the brief: a returning
    // operator seeing it once costs less than a first-timer never seeing it.
    setStage(onboardedReady && onboarded ? "console" : "landing");
  }, [onboarded, onboardedReady]);

  const resync = useCallback(() => {
    void refresh();
    void refreshAccount();
    push({ title: "RESYNCING", body: "Re-reading mainnet state.", tone: "info" });
  }, [refresh, refreshAccount, push]);

  const toggleTray = useCallback(async () => {
    if (!isTauri) {
      push({
        title: "DESKTOP ONLY",
        body: "The menu bar HUD requires the desktop runtime.",
        tone: "hold",
      });
      return;
    }
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("toggle_tray_window");
    } catch (error) {
      push({
        title: "HUD UNAVAILABLE",
        body: error instanceof Error ? error.message : "Window command failed.",
        tone: "no-go",
      });
    }
  }, [push]);

  const commands = useMemo<Command[]>(
    () => [
      ...SCENES.map((item) => ({
        id: `scene-${item.id}`,
        label: item.label,
        group: "SCENES",
        hint: item.hint,
        shortcut: `mod+${item.digit}`,
        icon: item.icon,
        run: () => setScene(item.id),
      })),
      {
        id: "action-resync",
        label: "Resync mainnet state",
        group: "ACTIONS",
        hint: "Re-read ledger, server and account data",
        shortcut: "mod+r",
        icon: <NovaFlare size={15} />,
        run: resync,
      },
      {
        id: "action-tray",
        label: "Toggle menu bar HUD",
        group: "ACTIONS",
        hint: "Show or hide the tray panel",
        shortcut: "mod+shift+x",
        icon: <NovaShield size={15} />,
        run: () => void toggleTray(),
      },
      {
        id: "action-copy-address",
        label: "Copy wallet address",
        group: "ACTIONS",
        hint: address,
        icon: <NovaCredit size={15} />,
        run: () => {
          void navigator.clipboard.writeText(address);
          push({ title: "ADDRESS COPIED", body: address, tone: "info" });
        },
      },
      {
        id: "action-auth",
        label: user ? "Open account" : "Sign in or create an account",
        group: "ACCOUNT",
        hint: user ? (user.email ?? "Signed in") : "Needed for paid capabilities",
        icon: <NovaShield size={15} />,
        run: () => (user ? setScene("account") : setAuthOpen(true)),
      },
      {
        id: "action-signout",
        label: "Sign out",
        group: "ACCOUNT",
        hint: user ? `Ends the session for ${user.email ?? "this account"}` : "Not signed in",
        icon: <NovaVault size={15} />,
        run: () => {
          if (!user) {
            push({ title: "NOT SIGNED IN", tone: "hold" });
            return;
          }
          void signOut().then(() =>
            push({
              title: "SIGNED OUT",
              body: "Paid capabilities are locked until you sign in again.",
              tone: "info",
            })
          );
        },
      },
      {
        id: "action-plans",
        label: "See plans and pricing",
        group: "ACCOUNT",
        hint: `Currently on the ${entitlement.tier} plan`,
        icon: <NovaCredit size={15} />,
        run: () => setScene("plans"),
      },
      {
        id: "action-brief",
        label: "Open mission brief",
        group: "ACTIONS",
        hint: "The landing page: objective, audiences and security posture",
        icon: <NovaSat size={15} />,
        run: () => setStage("landing"),
      },
      {
        id: "action-ask-agent",
        label: "Ask the compliance agent",
        group: "ACTIONS",
        hint: "On-device analyst — nothing is transmitted",
        icon: <NovaEye size={15} />,
        run: () => setScene("agent"),
      },
    ],
    [address, resync, toggleTray, push, user, entitlement.tier, signOut]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;

      const key = event.key.toLowerCase();
      if (key === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (key === "r") {
        event.preventDefault();
        resync();
        return;
      }
      const match = SCENES.find((item) => item.digit !== "" && item.digit === event.key);
      if (match) {
        event.preventDefault();
        setScene(match.id);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [resync]);

  // The native File ▸ Export menu item routes here.
  useEffect(() => {
    const onExport = () => setScene("history");
    window.addEventListener("noshashi:export", onExport);
    return () => window.removeEventListener("noshashi:export", onExport);
  }, []);

  return (
    <TooltipProvider delayDuration={220}>
      <div className="scanlines vignette relative flex h-full w-full overflow-hidden bg-background text-foreground">
        <SkipLink />
        <Announcer
          message={
            ledgerError
              ? `Ledger link degraded: ${ledgerError}`
              : connected
                ? ""
                : "Ledger link offline. Reconnecting."
          }
        />
        {/*
          Board section 07 geometry rather than a starfield. The starfield ran
          a requestAnimationFrame loop for the life of the session behind live
          telemetry — a continuous cost, competing with the data for
          attention. This is static, and it never asks to be looked at.
        */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <PatternMark
            element="orbital"
            size={620}
            opacity={0.035}
            className="-right-56 -top-40"
          />
          <PatternMark
            element="hatch"
            size={300}
            opacity={0.03}
            className="-bottom-16 -left-16"
          />
        </div>

        <AnimatePresence>
          {stage === "boot" && <Preloader onDone={finishBoot} />}
        </AnimatePresence>

        <AnimatePresence>
          {stage === "landing" && (
            <motion.div
              className="fixed inset-0 z-[70]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 1.02, filter: "blur(4px)" }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              <ErrorBoundary scope="Mission brief">
                <LandingScene
                  data={data}
                  onGetStarted={enterConsole}
                  onNavigate={goTo}
                />
              </ErrorBoundary>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative z-10 flex h-full w-full min-w-0">
          <AccessibilityWidget />

          {/* Sidebar — board section 10 */}
          <aside
            className={cn(
              "flex h-full shrink-0 flex-col border-r border-border bg-card/40",
              railOpen ? "w-[212px]" : "w-[60px]"
            )}
          >
            {/* Brand */}
            <div className="flex h-14 shrink-0 items-center gap-2.5 px-3.5">
              <button
                onClick={() => setScene("home")}
                className="flex min-w-0 items-center gap-2.5 text-left"
                aria-label={`${BRAND.name} overview`}
              >
                <NovaLogo size={24} animated={false} tone="color" />
                {railOpen && (
                  <span
                    className="display truncate text-[13px] font-[600] tracking-[0.26em] text-foreground"
                  >
                    NOSHASHI
                  </span>
                )}
              </button>
            </div>

            <nav
              className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-2.5 pb-4"
              aria-label="Primary"
            >
              {NAV_SECTIONS.map((section) => {
                const items = section.scenes
                  .map((id) => SCENES.find((sc) => sc.id === id))
                  .filter((sc): sc is SceneDef => Boolean(sc));
                if (items.length === 0) return null;
                return (
                  <div key={section.id}>
                    {railOpen && (
                      <p className="px-2 pb-1 font-mono text-[8.5px] tracking-[0.2em] text-faint">
                        {section.label}
                      </p>
                    )}
                    <div className="flex flex-col gap-0.5">
                      {items.map((item) => (
                        <NavButton
                          key={item.id}
                          item={item}
                          active={scene === item.id}
                          expanded={railOpen}
                          onSelect={() => setScene(item.id)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </nav>

            {/* System — always visible, never scrolled away with the nav. */}
            <div className="shrink-0 border-t border-border bg-card/40 px-2.5 py-2.5">
              {railOpen && (
                <p className="px-2 pb-1.5 font-mono text-[8.5px] tracking-[0.22em] text-faint">
                  SYSTEM
                </p>
              )}
              <div className="flex flex-col gap-0.5">
                {SCENES.filter((item) => item.group === "utility").map((item) => (
                  <NavButton
                    key={item.id}
                    item={item}
                    active={scene === item.id}
                    expanded={railOpen}
                    onSelect={() => setScene(item.id)}
                  />
                ))}

                <RailAction
                  expanded={railOpen}
                  icon={<NovaSat size={15} />}
                  label="MENU BAR HUD"
                  hint="⌘⇧X"
                  onSelect={() => void toggleTray()}
                />

                {user && (
                  <RailAction
                    expanded={railOpen}
                    icon={<NovaBolt size={15} />}
                    label="SIGN OUT"
                    hint={user.email ?? undefined}
                    danger
                    onSelect={() =>
                      void signOut().then(() =>
                        push({
                          title: "SIGNED OUT",
                          body: "Paid capabilities are locked until you sign in again.",
                          tone: "info",
                        })
                      )
                    }
                  />
                )}

                <RailAction
                  expanded={railOpen}
                  icon={
                    <NovaChevron
                      size={15}
                      className={cn("transition-transform", railOpen && "rotate-180")}
                    />
                  }
                  label="COLLAPSE"
                  onSelect={() => setRailOpen((v) => !v)}
                />
              </div>
            </div>
          </aside>

          {/* Main */}
          <div className="flex min-w-0 flex-1 flex-col">
            <TitleBar
              title={active.title}
              status={linkStatus}
              statusLabel={linkLabel}
              onClose={() => setStage("landing")}
              onCommand={() => setPaletteOpen(true)}
              freshness={ledgerAgeSeconds}
            />

            <main
              id="main-content"
              tabIndex={-1}
              className="relative min-h-0 min-w-0 flex-1 overflow-hidden focus-visible:outline-none"
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={scene}
                  variants={sceneVariants}
                  /*
                   * Only mount hidden when there is something to animate.
                   *
                   * `initial="initial"` writes opacity:0 into the DOM and
                   * relies on requestAnimationFrame to undo it. rAF is paused
                   * in a background tab, so a scene mounted while the window
                   * is occluded stays invisible — and the same is true if the
                   * motion bundle ever fails to load. The primary content
                   * container should not be able to end up permanently blank,
                   * so when the document is hidden it mounts already visible
                   * and skips the transition nobody is watching anyway.
                   */
                  initial={
                    typeof document !== "undefined" &&
                    document.visibilityState === "visible"
                      ? "initial"
                      : false
                  }
                  animate="animate"
                  exit="exit"
                  className="h-full min-w-0"
                >
                  <ErrorBoundary scope={active.title} onReset={resync}>
                    <Suspense fallback={<SceneLoading />}>
                    {scene === "home" ? (
                      <HomeScene data={data} onNavigate={goTo} />
                    ) : scene === "control" ? (
                      <MissionControlScene
                        data={data}
                        onOpenVerification={() => setScene("verify")}
                      />
                    ) : scene === "verify" ? (
                      <VerificationScene data={data} />
                    ) : scene === "credentials" ? (
                      <CredentialsScene data={data} />
                    ) : scene === "domains" ? (
                      <DomainsScene data={data} />
                    ) : scene === "history" ? (
                      <HistoryScene data={data} />
                    ) : scene === "agent" ? (
                      <AgentScene data={data} />
                    ) : scene === "desk" ? (
                      <DeskScene onUpgrade={openPlans} onSignIn={openAuth} />
                    ) : scene === "risk" ? (
                      <RiskScene data={data} onUpgrade={openPlans} onSignIn={openAuth} />
                    ) : scene === "workstation" ? (
                      <WorkstationScene data={data} onUpgrade={openPlans} onSignIn={openAuth} />
                    ) : scene === "safeshop" ? (
                      <SafeShopScene onUpgrade={openPlans} />
                    ) : scene === "treasury" ? (
                      <ControlScene onUpgrade={openPlans} onSignIn={openAuth} />
                    ) : scene === "settlement" ? (
                      <SettlementScene onUpgrade={openPlans} onSignIn={openAuth} />
                    ) : scene === "network" ? (
                      <NetworkScene />
                    ) : scene === "amm" ? (
                      <AmmScene onUpgrade={openPlans} onSignIn={openAuth} />
                    ) : scene === "issuance" ? (
                      <IssuanceScene onUpgrade={openPlans} onSignIn={openAuth} />
                    ) : scene === "growth" ? (
                      <GrowthScene data={data} />
                    ) : scene === "learn" ? (
                      <LearnScene />
                    ) : scene === "plans" ? (
                      <PlansScene onSignIn={openAuth} />
                    ) : scene === "account" ? (
                      <AccountScene onSignIn={openAuth} onUpgrade={openPlans} />
                    ) : scene === "revenue" ? (
                      <RevenueScene />
                    ) : scene === "legal" ? (
                      <LegalScene />
                    ) : (
                      <SettingsScene
                        data={data}
                        address={address}
                        onAddressChange={setAddress}
                        notificationsEnabled={notificationsEnabled}
                        onNotificationsChange={setNotificationsEnabled}
                      />
                    )}
                    </Suspense>
                  </ErrorBoundary>
                </motion.div>
              </AnimatePresence>
            </main>

            <StatusRail
              status={linkStatus}
              statusLabel={linkLabel}
              ledgerIndex={ledger?.ledgerIndex}
              latencyMs={latencyMs}
              events={events}
              onOpenPalette={() => setPaletteOpen(true)}
              onOpenLegal={() => setScene("legal")}
            />
          </div>
        </div>

        <AnimatePresence>
          {authOpen && (
            <motion.div
              className="fixed inset-0 z-[85]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <ErrorBoundary scope="Sign in">
                <Suspense fallback={<SceneLoading />}>
                <AuthScene
                  onAuthenticated={() => {
                    setAuthOpen(false);
                    push({ title: "SIGNED IN", tone: "go" });
                  }}
                  onDismiss={() => setAuthOpen(false)}
                />
                </Suspense>
              </ErrorBoundary>
            </motion.div>
          )}
        </AnimatePresence>

        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          commands={commands}
        />
      </div>
    </TooltipProvider>
  );
}

/** Held for the moment a split chunk is in flight. */
function SceneLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <span className="mono-font animate-pulse text-[10px] tracking-[0.24em] text-muted-foreground">
        LOADING
      </span>
    </div>
  );
}

function NavButton({
  item,
  active,
  expanded,
  onSelect,
}: {
  item: SceneDef;
  active: boolean;
  expanded: boolean;
  onSelect: () => void;
}) {
  const row = (
    <button
      onClick={onSelect}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center rounded-md transition-colors",
        expanded ? "h-8 gap-2.5 px-2" : "h-9 w-9 justify-center",
        active
          ? "bg-brand/12 text-foreground"
          : "text-muted-foreground hover:bg-card hover:text-foreground"
      )}
    >
      <span className={cn("shrink-0", active && "text-brand")}>{item.icon}</span>
      {expanded && (
        <span className="min-w-0 flex-1 truncate text-left text-[11.5px] tracking-[0.06em]">
          {item.label}
        </span>
      )}
      {expanded && item.digit && (
        <span className="font-mono text-[9px] text-faint opacity-0 transition-opacity group-hover:opacity-100">
          {item.digit}
        </span>
      )}
      {active && (
        <motion.span
          layoutId="nav-marker"
          className="absolute left-0 h-4 w-[2px] rounded-full bg-brand"
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
        />
      )}
    </button>
  );

  // A label beside the icon already names the destination, so the tooltip
  // would just repeat it. Keep it only for the collapsed rail.
  if (expanded) return row;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{row}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {item.label}
        {item.digit ? ` · ⌘${item.digit}` : ""}
      </TooltipContent>
    </Tooltip>
  );
}

/** A sidebar row that runs an action rather than navigating. */
function RailAction({
  icon,
  label,
  hint,
  expanded,
  danger = false,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  expanded: boolean;
  danger?: boolean;
  onSelect: () => void;
}) {
  const row = (
    <button
      onClick={onSelect}
      aria-label={label}
      className={cn(
        "flex items-center rounded-md text-muted-foreground transition-colors",
        expanded ? "h-8 gap-2.5 px-2" : "h-9 w-9 justify-center",
        danger ? "hover:bg-no-go/10 hover:text-no-go" : "hover:bg-card hover:text-foreground"
      )}
    >
      <span className="shrink-0">{icon}</span>
      {expanded && (
        <span className="min-w-0 flex-1 truncate text-left text-[11.5px] tracking-[0.06em]">
          {label}
        </span>
      )}
    </button>
  );
  if (expanded && !hint) return row;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{row}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {hint ? `${label} · ${hint}` : label}
      </TooltipContent>
    </Tooltip>
  );
}
