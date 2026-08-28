import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { SceneHeader } from "./SceneHeader";
import { Panel, DataRow, Eyebrow } from "@/components/nova/Panel";
import { NovaLogo } from "@/components/nova/NovaLogo";
import { Kbd } from "@/components/nova/Kbd";
import { StatusDot } from "@/components/nova/StatusDot";
import {
  NovaBolt,
  NovaFlare,
  NovaSat,
  NovaShield,
} from "@/components/nova/NovaIcon";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { sendNativeNotification } from "@/lib/notifications";
import { isTauri, isMac } from "@/lib/env";
import { isValidAddress, formatUptime } from "@/lib/xrpl/client";
import { useToast } from "@/lib/toast";
import { GLOBAL_SHORTCUT } from "@/lib/shortcuts";
import { useAppearance, TEXT_SCALES, type ThemeMode, type MotionMode } from "@/lib/appearance";
import type { XrplState } from "@/lib/xrpl/useXRPL";
import { staggerChild, staggerParent } from "@/lib/motion";
import { readCapabilities, type CapabilityReport } from "@/lib/xrpl/amendments";

function SettingRow({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border/30 py-2.5 last:border-0">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
          {description}
        </p>
      </div>
      <span className="shrink-0">{children}</span>
    </div>
  );
}

/**
 * SettingsScene — desktop integration and the wallet under observation.
 * Every switch here maps to a real Tauri capability; in the browser they
 * degrade to no-ops with an explicit "desktop only" note.
 */
export function SettingsScene({
  data,
  address,
  onAddressChange,
  notificationsEnabled,
  onNotificationsChange,
}: {
  data: XrplState;
  address: string;
  onAddressChange: (address: string) => void;
  notificationsEnabled: boolean;
  onNotificationsChange: (enabled: boolean) => void;
}) {
  const { server, connected, account, ledger } = data;
  const { push } = useToast();
  const appearance = useAppearance();

  const [draftAddress, setDraftAddress] = useState(address);
  const [launchAtLogin, setLaunchAtLogin] = useState(false);
  const [shortcutOn, setShortcutOn] = useState(false);
  const [secret, setSecret] = useState("");
  const [secretStored, setSecretStored] = useState(false);
  const [integrity, setIntegrity] = useState<{
    digest: string; path: string; bytes: number; version: string;
  } | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => setDraftAddress(address), [address]);

  useEffect(() => {
    if (!isTauri) return;
    let cancelled = false;

    void (async () => {
      try {
        const autostart = await import("@tauri-apps/plugin-autostart");
        const enabled = await autostart.isEnabled();
        if (!cancelled) setLaunchAtLogin(enabled);
      } catch {
        /* plugin unavailable */
      }
      try {
        const shortcuts = await import("@tauri-apps/plugin-global-shortcut");
        const registered = await shortcuts.isRegistered(GLOBAL_SHORTCUT);
        if (!cancelled) setShortcutOn(registered);
      } catch {
        /* plugin unavailable */
      }
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const stored = await invoke<boolean>("has_api_secret");
        if (!cancelled) setSecretStored(stored);
      } catch {
        /* command unavailable */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const addressValid = isValidAddress(draftAddress);
  const addressDirty = draftAddress.trim() !== address;

  const applyAddress = () => {
    if (!addressValid) return;
    onAddressChange(draftAddress.trim());
    push({ title: "WALLET SWITCHED", body: draftAddress.trim(), tone: "go" });
  };

  const toggleLaunchAtLogin = async (enabled: boolean) => {
    setLaunchAtLogin(enabled);
    if (!isTauri) return;
    try {
      const { enable, disable } = await import("@tauri-apps/plugin-autostart");
      if (enabled) await enable();
      else await disable();
    } catch (error) {
      setLaunchAtLogin(!enabled);
      push({
        title: "AUTOSTART UNAVAILABLE",
        body: error instanceof Error ? error.message : "Plugin error",
        tone: "no-go",
      });
    }
  };

  const toggleShortcut = async (enabled: boolean) => {
    setShortcutOn(enabled);
    if (!isTauri) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("set_global_shortcut_enabled", { enabled });
    } catch (error) {
      setShortcutOn(!enabled);
      push({
        title: "SHORTCUT UNAVAILABLE",
        body: error instanceof Error ? error.message : "Plugin error",
        tone: "no-go",
      });
    }
  };

  const storeSecret = async () => {
    if (!secret.trim()) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("store_api_secret", { secret: secret.trim() });
      setSecret("");
      setSecretStored(true);
      push({
        title: "SECRET SEALED",
        body: "Written to the macOS Keychain — never to disk in plaintext.",
        tone: "go",
      });
    } catch (error) {
      push({
        title: "KEYCHAIN WRITE FAILED",
        body: error instanceof Error ? error.message : "Unknown error",
        tone: "no-go",
      });
    }
  };

  const clearSecret = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("clear_api_secret");
      setSecretStored(false);
      push({ title: "SECRET CLEARED", tone: "info" });
    } catch (error) {
      push({
        title: "KEYCHAIN CLEAR FAILED",
        body: error instanceof Error ? error.message : "Unknown error",
        tone: "no-go",
      });
    }
  };

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <SceneHeader
        index="06"
        kicker="SYSTEM CONFIGURATION"
        title="SETTINGS"
        sub="Wallet under observation, desktop integration, and credential storage."
        status={connected ? "go" : "hold"}
        statusLabel={connected ? "READY" : "SYNCING"}
        right={
          <Badge variant={isTauri ? "go" : "hold"}>
            {isTauri ? "DESKTOP RUNTIME" : "BROWSER PREVIEW"}
          </Badge>
        }
      />

      <motion.div
        className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto pr-1 lg:grid-cols-2"
        variants={staggerParent(0.06)}
        initial="hidden"
        animate="show"
      >
        <div className="flex flex-col gap-3">
          <motion.div variants={staggerChild}>
            <Panel label="APPEARANCE & ACCESSIBILITY" corners>
              <SettingRow
                icon={<NovaFlare size={13} />}
                title="Theme"
                description="Dark is the default. Inverted suits bright rooms and some low-vision needs."
              >
                <div className="flex gap-px border border-border">
                  {(["dark", "light", "system"] as ThemeMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => appearance.setTheme(mode)}
                      aria-pressed={appearance.theme === mode}
                      className={
                        "stencil px-2 py-1 text-[8px] tracking-[0.16em] transition-colors " +
                        (appearance.theme === mode
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:text-foreground")
                      }
                    >
                      {mode.toUpperCase()}
                    </button>
                  ))}
                </div>
              </SettingRow>

              <SettingRow
                icon={<NovaShield size={13} />}
                title="High contrast"
                description="Raises rule and text contrast, and removes ambient texture."
              >
                <Switch
                  checked={appearance.highContrast}
                  onCheckedChange={(value) => appearance.setHighContrast(Boolean(value))}
                />
              </SettingRow>

              <SettingRow
                icon={<NovaBolt size={13} />}
                title="Interface scale"
                description="Scales type, rules and hit targets together."
              >
                <div className="flex gap-px border border-border">
                  {TEXT_SCALES.map((scale) => (
                    <button
                      key={scale.value}
                      onClick={() => appearance.setTextScale(scale.value)}
                      aria-pressed={appearance.textScale === scale.value}
                      className={
                        "mono-font px-1.5 py-1 text-[8px] tabular-nums transition-colors " +
                        (appearance.textScale === scale.value
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:text-foreground")
                      }
                    >
                      {scale.label}
                    </button>
                  ))}
                </div>
              </SettingRow>

              <SettingRow
                icon={<NovaSat size={13} />}
                title="Motion"
                description="Stops ambient animation for vestibular comfort, without touching the OS."
              >
                <div className="flex gap-px border border-border">
                  {(["system", "reduced", "full"] as MotionMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => appearance.setMotion(mode)}
                      aria-pressed={appearance.motion === mode}
                      className={
                        "stencil px-2 py-1 text-[8px] tracking-[0.16em] transition-colors " +
                        (appearance.motion === mode
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:text-foreground")
                      }
                    >
                      {mode.toUpperCase()}
                    </button>
                  ))}
                </div>
              </SettingRow>
            </Panel>
          </motion.div>

          <motion.div variants={staggerChild}>
            <Panel label="WALLET" corners>
              <Label htmlFor="wallet">XRPL CLASSIC ADDRESS</Label>
              <div className="mt-1.5 flex gap-2">
                <Input
                  id="wallet"
                  value={draftAddress}
                  onChange={(event) => setDraftAddress(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") applyAddress();
                  }}
                  spellCheck={false}
                  className="mono-font selectable text-[11px]"
                />
                <Button
                  size="default"
                  onClick={applyAddress}
                  disabled={!addressValid || !addressDirty}
                >
                  LOAD
                </Button>
              </div>
              {!addressValid && draftAddress.length > 0 && (
                <p className="mt-1.5 text-[9px] text-no-go">
                  Not a valid XRPL classic address (starts with r, 25–35 characters).
                </p>
              )}
              <div className="mt-3">
                <DataRow
                  label="STATE"
                  value={
                    account?.unfunded
                      ? "VALID · UNFUNDED"
                      : account
                        ? "ACTIVE"
                        : "NOT LOADED"
                  }
                  tone={account?.unfunded ? "hold" : account ? "go" : "muted"}
                />
                <DataRow label="BALANCE" value={`${account?.balanceXrp ?? "—"} XRP`} />
                <DataRow label="SEQUENCE" value={account?.sequence ?? "—"} />
              </div>
            </Panel>
          </motion.div>

          <motion.div variants={staggerChild}>
            <Panel label="DESKTOP INTEGRATION">
              <SettingRow
                icon={<NovaBolt size={13} />}
                title="Native notifications"
                description="Route gate verdicts through Notification Center."
              >
                <Switch
                  checked={notificationsEnabled}
                  onCheckedChange={(value) => onNotificationsChange(Boolean(value))}
                />
              </SettingRow>

              <SettingRow
                icon={<NovaSat size={13} />}
                title="Launch at login"
                description={
                  isTauri
                    ? "Start NOSHASHI in the menu bar when you log in."
                    : "Desktop runtime only."
                }
              >
                <Switch
                  checked={launchAtLogin}
                  disabled={!isTauri}
                  onCheckedChange={(value) => void toggleLaunchAtLogin(Boolean(value))}
                />
              </SettingRow>

              <SettingRow
                icon={<NovaFlare size={13} />}
                title="Global shortcut"
                description={`Toggle the menu bar HUD from anywhere in ${isMac ? "macOS" : "the OS"}.`}
              >
                <span className="flex items-center gap-2">
                  <Kbd keys="mod+shift+x" />
                  <Switch
                    checked={shortcutOn}
                    disabled={!isTauri}
                    onCheckedChange={(value) => void toggleShortcut(Boolean(value))}
                  />
                </span>
              </SettingRow>

              <SettingRow
                icon={<NovaShield size={13} />}
                title="Test notification"
                description="Confirm the integration end to end."
              >
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void sendNativeNotification({
                      title: "NOSHASHI · COMPLIANCE GRID",
                      body: `Ledger ${ledger?.ledgerIndex ?? "—"} · network ${server?.networkId ?? 0} online`,
                    })
                  }
                >
                  SEND
                </Button>
              </SettingRow>
            </Panel>
          </motion.div>
        </div>

        <div className="flex flex-col gap-3">
          <motion.div variants={staggerChild}>
            <Panel
              label="SECURE STORAGE"
              corners
              right={
                <Badge variant={secretStored ? "go" : "outline"}>
                  {secretStored ? "SEALED" : "EMPTY"}
                </Badge>
              }
            >
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                API secrets are held in the {isMac ? "macOS Keychain" : "system keyring"} through
                the Rust <span className="mono-font">keyring</span> crate. Nothing is written to
                the preferences file, and the value is never returned to the webview.
              </p>
              <div className="mt-3 flex gap-2">
                <Input
                  type="password"
                  value={secret}
                  onChange={(event) => setSecret(event.target.value)}
                  placeholder={secretStored ? "•••••••• stored" : "Compliance API secret"}
                  disabled={!isTauri}
                  className="mono-font text-[11px]"
                />
                <Button
                  size="default"
                  onClick={() => void storeSecret()}
                  disabled={!isTauri || secret.trim().length === 0}
                >
                  SEAL
                </Button>
              </div>
              {secretStored && (
                <button
                  onClick={() => void clearSecret()}
                  className="stencil mt-2 text-[8px] tracking-[0.2em] text-muted-foreground transition-colors hover:text-no-go"
                >
                  CLEAR STORED SECRET
                </button>
              )}
              {!isTauri && (
                <p className="mt-2 text-[9px] text-hold">
                  Keychain access requires the desktop runtime.
                </p>
              )}
            </Panel>
          </motion.div>

          <motion.div variants={staggerChild}>
            <Panel label="NETWORK">
              <DataRow label="SERVER STATE" value={server?.serverState ?? "···"} />
              <DataRow label="NETWORK ID" value={server?.networkId ?? "···"} />
              <DataRow label="BUILD" value={server?.version ?? "···"} />
              <DataRow label="PEERS" value={server?.peers ?? "···"} />
              <DataRow label="LOAD FACTOR" value={server?.loadFactor ?? "···"} />
              <DataRow
                label="UPTIME"
                value={server ? formatUptime(server.uptimeSeconds) : "···"}
              />
              <DataRow
                label="COMPLETE LEDGERS"
                value={server?.completeLedgers ?? "···"}
              />
            </Panel>
          </motion.div>

          <motion.div variants={staggerChild}>
            <NetworkCapabilities />
          </motion.div>

          <motion.div variants={staggerChild}>
            <Panel label="BINARY INTEGRITY" corners>
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Hashes the executable that is currently running. Compare the digest
                against the one published for your release; a mismatch means the
                binary changed between download and execution.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3 w-full gap-2"
                disabled={!isTauri || verifying}
                onClick={() =>
                  void (async () => {
                    setVerifying(true);
                    try {
                      const { invoke } = await import("@tauri-apps/api/core");
                      setIntegrity(await invoke("verify_integrity"));
                    } catch (error) {
                      push({
                        title: "INTEGRITY CHECK FAILED",
                        body: error instanceof Error ? error.message : "Unknown error",
                        tone: "no-go",
                      });
                    } finally {
                      setVerifying(false);
                    }
                  })()
                }
              >
                <NovaShield size={13} />
                {verifying ? "HASHING BINARY…" : "VERIFY INTEGRITY"}
              </Button>

              {integrity && (
                <div className="inset-row mt-3 p-2.5">
                  <Eyebrow>SHA-256 · RUNNING BINARY</Eyebrow>
                  <p className="mono-font selectable mt-1.5 break-all text-[9px] leading-relaxed text-foreground">
                    {integrity.digest}
                  </p>
                  <div className="mt-2">
                    <DataRow label="VERSION" value={integrity.version} />
                    <DataRow
                      label="SIZE"
                      value={`${(integrity.bytes / 1_048_576).toFixed(2)} MB`}
                    />
                  </div>
                  <button
                    onClick={() => {
                      void navigator.clipboard.writeText(integrity.digest);
                      push({ title: "DIGEST COPIED", tone: "info" });
                    }}
                    className="stencil mt-2 text-[8px] tracking-[0.2em] text-foreground underline underline-offset-2"
                  >
                    COPY DIGEST
                  </button>
                  <p className="mono-font mt-2 border-t border-border pt-2 text-[8px] leading-relaxed text-muted-foreground">
                    Verify yourself: shasum -a 256 &quot;{integrity.path.split("/").slice(-1)[0]}&quot;
                  </p>
                </div>
              )}

              {!isTauri && (
                <p className="mt-2 text-[9px] text-hold">
                  Integrity verification requires the desktop runtime.
                </p>
              )}
            </Panel>
          </motion.div>

          <motion.div variants={staggerChild}>
            <Panel label="ABOUT">
              <div className="flex items-center gap-3">
                <NovaLogo size={34} className="text-foreground" />
                <div>
                  <p className="display text-[12px] font-[700] tracking-[0.1em] text-foreground">
                    NOSHASHI v0.1.0
                  </p>
                  <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                    Autonomous Compliance Layer · XRPL Mainnet.
                    <br />
                    Built for regulated capital settlement.
                  </p>
                </div>
              </div>
              <Eyebrow className="mb-1.5 mt-3">SHORTCUTS</Eyebrow>
              <div className="space-y-1">
                {[
                  { keys: "mod+k", label: "Command palette" },
                  { keys: "mod+shift+x", label: "Toggle menu bar HUD" },
                  { keys: "mod+r", label: "Resync ledger state" },
                  { keys: "mod+1", label: "Jump to Mission Control" },
                ].map((row) => (
                  <div key={row.keys} className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">{row.label}</span>
                    <Kbd keys={row.keys} />
                  </div>
                ))}
              </div>
            </Panel>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}


/**
 * What the connected network can actually do.
 *
 * Read from the validated ledger's own amendments object rather than from
 * a table in this repository, so it cannot drift and cannot flatter. A
 * feature rippled merely knows about is not a feature you can use: the
 * amendment has to have activated, and until it does every transaction of
 * that type is rejected by every validator on the network.
 */
function NetworkCapabilities() {
  const [report, setReport] = useState<CapabilityReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (force = false) => {
    setBusy(true);
    setError(null);
    try {
      setReport(await readCapabilities(force));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read amendments");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const live = report?.capabilities.filter((c) => c.enabled) ?? [];
  const pending = report?.capabilities.filter((c) => !c.enabled) ?? [];

  return (
    <Panel
      label="NETWORK CAPABILITIES"
      right={
        <Button size="sm" variant="outline" onClick={() => void load(true)} disabled={busy}>
          {busy ? "READING…" : "RE-READ"}
        </Button>
      }
    >
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Read from the validated ledger&rsquo;s amendments object. A feature
        rippled knows about is not one you can use — the amendment has to have
        activated. Anything below marked pending is refused by every validator
        on the network today, and NOSHASHI will not offer it.
      </p>

      {error && <p className="mt-2 text-[11px] text-no-go">{error}</p>}

      {report && (
        <>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[10px] tabular-nums text-faint">
            <span>
              AMENDMENTS ACTIVE{" "}
              <span className="text-muted-foreground">{report.totalEnabled}</span>
            </span>
            <span>
              LEDGER{" "}
              <span className="text-muted-foreground">
                {report.ledgerIndex.toLocaleString()}
              </span>
            </span>
            <span>
              USABLE HERE{" "}
              <span className="text-muted-foreground">
                {live.length}/{report.capabilities.length}
              </span>
            </span>
          </div>

          <div className="mt-3 grid gap-1.5">
            {[...live, ...pending].map((cap) => (
              <div
                key={cap.id}
                className="inset-row flex flex-wrap items-baseline gap-x-2.5 gap-y-1 px-2.5 py-2"
              >
                <StatusDot status={cap.enabled ? "go" : "hold"} size={5} />
                <span className="text-[11.5px] text-foreground">{cap.label}</span>
                {cap.xls && (
                  <span className="font-mono text-[9px] text-faint">{cap.xls}</span>
                )}
                <span
                  className={
                    "ml-auto font-mono text-[9px] tracking-[0.14em] " +
                    (cap.enabled ? "text-go" : "text-hold")
                  }
                >
                  {cap.enabled ? "LIVE" : "NOT ACTIVATED"}
                </span>
                <p className="w-full text-[10.5px] leading-relaxed text-muted-foreground">
                  {cap.blurb}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}
