import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SceneHeader } from "./SceneHeader";
import { Panel, DataRow, Eyebrow } from "@/components/nova/Panel";
import { EmptyState } from "@/components/nova/EmptyState";
import { Gated } from "@/components/nova/Gated";
import { NovaBolt, NovaCredit, NovaShield, NovaVault } from "@/components/nova/NovaIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth/useAuth";
import { useBilling } from "@/lib/billing/useEntitlements";
import {
  createApiKey,
  listApiKeys,
  readUsage,
  revokeApiKey,
  type ApiKeyRow,
  type UsageSummary,
} from "@/lib/desk/apiKeys";
import { planFor } from "@/lib/billing/catalog";
import { useToast } from "@/lib/toast";
import { CONTACT } from "@/lib/brand";
import { truncateMiddle } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SPRING } from "@/lib/motion";

/**
 * AccountScene — identity, second factors, subscription and API keys.
 *
 * The security controls live next to the billing controls on purpose:
 * the moment an account can spend money is the moment it needs a second
 * factor, and separating those into different screens is how people end
 * up with neither.
 */
export function AccountScene({
  onSignIn,
  onUpgrade,
}: {
  onSignIn: () => void;
  onUpgrade: () => void;
}) {
  const { user, factors, signOut, enrollTotp, confirmTotp, unenrollFactor, updatePassword } =
    useAuth();
  const { entitlement, subscription, openBillingPortal, refresh } = useBilling();
  const { push } = useToast();

  const [tab, setTab] = useState<"overview" | "security" | "api">("overview");

  if (!user) {
    return (
      <div className="flex h-full min-w-0 flex-col gap-3 p-4">
        <SceneHeader
          index="12"
          kicker="ACCOUNT"
          title="NOT SIGNED IN"
          sub="The console works without an account. Sign in to carry a subscription, a portfolio and API keys."
          status="hold"
          statusLabel="ANONYMOUS"
        />
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <EmptyState
            icon={<NovaShield size={16} />}
            title="NO SESSION"
            body="Everything on the free tier stays available without signing in. Paid capabilities need an account so the entitlement has somewhere to live."
            action={
              <Button className="gap-2" onClick={onSignIn}>
                <NovaShield size={14} />
                SIGN IN OR CREATE ACCOUNT
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const plan = planFor(entitlement.tier);
  const verifiedFactors = factors.filter((factor) => factor.status === "verified");

  return (
    <div className="h-full min-w-0 overflow-y-auto overflow-x-hidden">
      <div className="flex min-w-0 flex-col gap-3 p-4">
        <SceneHeader
          index="12"
          kicker="ACCOUNT & SECURITY"
          title={user.email ?? "ACCOUNT"}
          sub={`${plan.name} plan · ${verifiedFactors.length > 0 ? "two-factor enabled" : "two-factor not enabled"}`}
          status={verifiedFactors.length > 0 ? "go" : "hold"}
          statusLabel={verifiedFactors.length > 0 ? "2FA ON" : "2FA OFF"}
          right={
            <div className="flex items-center gap-2">
              <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
                <TabsList>
                  <TabsTrigger value="overview">PLAN</TabsTrigger>
                  <TabsTrigger value="security">SECURITY</TabsTrigger>
                  <TabsTrigger value="api">API</TabsTrigger>
                </TabsList>
              </Tabs>
              <Button size="sm" variant="outline" onClick={() => void signOut()}>
                SIGN OUT
              </Button>
            </div>
          }
        />

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={SPRING}
          >
            {tab === "overview" ? (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <Panel label="SUBSCRIPTION" corners bodyClassName="p-4">
                  <div className="flex items-baseline justify-between">
                    <p className="display text-[20px] font-[700] tracking-[0.1em] text-foreground">
                      {plan.name}
                    </p>
                    <Badge
                      variant={
                        subscription?.status === "active"
                          ? "go"
                          : subscription?.status === "past_due"
                            ? "no-go"
                            : "outline"
                      }
                    >
                      {subscription?.status?.toUpperCase() ?? "FREE"}
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-[10.5px] text-muted-foreground">
                    {plan.priceLabel} · {plan.cadence}
                  </p>

                  <div className="mt-4">
                    <DataRow label="SEATS" value={entitlement.seats} />
                    <DataRow
                      label="RENEWS"
                      value={
                        subscription?.currentPeriodEnd
                          ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                          : "—"
                      }
                    />
                    <DataRow
                      label="CANCELS AT PERIOD END"
                      value={subscription?.cancelAtPeriodEnd ? "YES" : "NO"}
                      tone={subscription?.cancelAtPeriodEnd ? "hold" : "default"}
                    />
                    <DataRow
                      label="API CREDITS"
                      value={entitlement.verificationQuota.toLocaleString()}
                    />
                  </div>

                  <div className="mt-4 flex gap-2">
                    {subscription ? (
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => void openBillingPortal()}
                      >
                        MANAGE BILLING
                      </Button>
                    ) : (
                      <Button className="flex-1 gap-2" onClick={onUpgrade}>
                        <NovaCredit size={13} />
                        SEE PLANS
                      </Button>
                    )}
                    <Button variant="ghost" onClick={() => void refresh()}>
                      REFRESH
                    </Button>
                  </div>
                </Panel>

                <Panel label="ENTITLEMENTS" bodyClassName="p-4">
                  <Eyebrow className="mb-2">WHAT THIS PLAN UNLOCKS</Eyebrow>
                  <div className="flex flex-wrap gap-1.5">
                    {entitlement.features.map((feature) => (
                      <span
                        key={feature}
                        className="mono-font rounded border border-border px-1.5 py-0.5 text-[8px] text-muted-foreground"
                      >
                        {feature.replace(/_/g, " ").toUpperCase()}
                      </span>
                    ))}
                  </div>

                  <Eyebrow className="mb-2 mt-4">SUPPORT</Eyebrow>
                  <p className="text-[10.5px] leading-relaxed text-muted-foreground">
                    {entitlement.features.includes("priority_support")
                      ? `Priority queue. Email ${CONTACT.support} and reference your account email.`
                      : `Community support. Email ${CONTACT.support}; paid plans get a priority queue.`}
                  </p>
                </Panel>
              </div>
            ) : tab === "security" ? (
              <SecurityTab
                factors={factors}
                enrollTotp={enrollTotp}
                confirmTotp={confirmTotp}
                unenrollFactor={unenrollFactor}
                updatePassword={updatePassword}
                onNotify={push}
              />
            ) : (
              <Gated feature="compliance_api" onUpgrade={onUpgrade} onSignIn={onSignIn}>
                <ApiTab accountId={user.id} onNotify={push} />
              </Gated>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function SecurityTab({
  factors,
  enrollTotp,
  confirmTotp,
  unenrollFactor,
  updatePassword,
  onNotify,
}: {
  factors: ReturnType<typeof useAuth>["factors"];
  enrollTotp: ReturnType<typeof useAuth>["enrollTotp"];
  confirmTotp: ReturnType<typeof useAuth>["confirmTotp"];
  unenrollFactor: ReturnType<typeof useAuth>["unenrollFactor"];
  updatePassword: ReturnType<typeof useAuth>["updatePassword"];
  onNotify: ReturnType<typeof useToast>["push"];
}) {
  const [enrolment, setEnrolment] = useState<{
    factorId: string;
    qrCode: string;
    secret: string;
  } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const beginEnrolment = async () => {
    setBusy(true);
    try {
      setEnrolment(await enrollTotp());
    } catch (error) {
      onNotify({
        title: "ENROLMENT FAILED",
        body: error instanceof Error ? error.message : "Unknown error",
        tone: "no-go",
      });
    } finally {
      setBusy(false);
    }
  };

  const finishEnrolment = async () => {
    if (!enrolment) return;
    setBusy(true);
    try {
      await confirmTotp(enrolment.factorId, code);
      setEnrolment(null);
      setCode("");
      onNotify({ title: "TWO-FACTOR ENABLED", tone: "go" });
    } catch (error) {
      onNotify({
        title: "CODE REJECTED",
        body: error instanceof Error ? error.message : "Try the next code.",
        tone: "no-go",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <Panel label="TWO-FACTOR AUTHENTICATION" corners bodyClassName="p-4">
        {factors.length === 0 && !enrolment && (
          <>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              A password alone is one leak away from an account takeover. Enrol an
              authenticator app and a stolen password stops being enough.
            </p>
            <Button className="mt-4 w-full gap-2" onClick={() => void beginEnrolment()} disabled={busy}>
              <NovaShield size={13} />
              {busy ? "PREPARING…" : "ENABLE TWO-FACTOR"}
            </Button>
          </>
        )}

        {enrolment && (
          <div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Scan this with your authenticator, then enter the six-digit code it shows.
            </p>
            <div className="inset-row mt-3 flex justify-center bg-white p-3">
              <img
                src={enrolment.qrCode}
                alt="Two-factor enrolment QR code"
                className="h-[160px] w-[160px]"
              />
            </div>
            <p className="mono-font selectable mt-2 break-all text-center text-[9px] text-muted-foreground">
              {enrolment.secret}
            </p>
            <div className="mt-3">
              <Label htmlFor="totp-code">CODE</Label>
              <Input
                id="totp-code"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, ""))}
                className="mono-font mt-1.5 text-center text-[16px] tracking-[0.4em]"
                placeholder="000000"
              />
            </div>
            <div className="mt-3 flex gap-2">
              <Button className="flex-1" onClick={() => void finishEnrolment()} disabled={busy}>
                CONFIRM
              </Button>
              <Button variant="outline" onClick={() => setEnrolment(null)}>
                CANCEL
              </Button>
            </div>
          </div>
        )}

        {factors.length > 0 && (
          <div className="space-y-2">
            {factors.map((factor) => (
              <div
                key={factor.id}
                className="inset-row flex items-center gap-2 p-2.5"
              >
                <NovaShield
                  size={13}
                  className={factor.status === "verified" ? "text-go" : "text-hold"}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10.5px] text-foreground">
                    {factor.friendlyName}
                  </p>
                  <p className="mono-font text-[9px] text-muted-foreground">
                    {factor.status.toUpperCase()}
                  </p>
                </div>
                <button
                  onClick={() => void unenrollFactor(factor.id)}
                  className="stencil text-[8px] tracking-[0.18em] text-muted-foreground transition-colors hover:text-no-go"
                >
                  REMOVE
                </button>
              </div>
            ))}
            {!enrolment && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => void beginEnrolment()}
                disabled={busy}
              >
                ADD ANOTHER AUTHENTICATOR
              </Button>
            )}
          </div>
        )}
      </Panel>

      <Panel label="PASSWORD" bodyClassName="p-4">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Passwords are hashed server-side and never stored or logged by this
          application. Twelve characters minimum, with mixed case, a digit and a symbol.
        </p>
        <div className="mt-4">
          <Label htmlFor="new-password">NEW PASSWORD</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1.5"
          />
        </div>
        <Button
          className="mt-3 w-full"
          disabled={busy || password.length === 0}
          onClick={() =>
            void (async () => {
              setBusy(true);
              try {
                await updatePassword(password);
                setPassword("");
                onNotify({ title: "PASSWORD UPDATED", tone: "go" });
              } catch (error) {
                onNotify({
                  title: "COULD NOT UPDATE PASSWORD",
                  body: error instanceof Error ? error.message : "Unknown error",
                  tone: "no-go",
                });
              } finally {
                setBusy(false);
              }
            })()
          }
        >
          UPDATE PASSWORD
        </Button>

        <Eyebrow className="mb-1.5 mt-5">REPORTING</Eyebrow>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Found a vulnerability? Email{" "}
          <a
            href={`mailto:${CONTACT.security}`}
            className="text-foreground underline underline-offset-2"
          >
            {CONTACT.security}
          </a>
          . We ask for coordinated disclosure and reply within {CONTACT.responseTarget}.
        </p>
      </Panel>
    </div>
  );
}

function ApiTab({
  accountId,
  onNotify,
}: {
  accountId: string;
  onNotify: ReturnType<typeof useToast>["push"];
}) {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  /**
   * Three states, not two.
   *
   * `usage` was rendered as `usage?.total ?? 0`, so a failed read and a
   * genuinely idle account both displayed 0. "VERIFICATIONS (30D): 0" then
   * means either "nothing happened" or "we could not reach the database",
   * and the operator cannot tell which — which is the exact shape of
   * fabrication this product refuses everywhere else.
   */
  const [usageState, setUsageState] = useState<"loading" | "ready" | "failed">(
    "loading"
  );
  const [name, setName] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [rows, summary] = await Promise.all([
        listApiKeys(accountId),
        readUsage(accountId),
      ]);
      setKeys(rows);
      setUsage(summary);
      setUsageState("ready");
    } catch (error) {
      setUsageState("failed");
      onNotify({
        title: "COULD NOT READ KEYS",
        body: error instanceof Error ? error.message : "Unknown error",
        tone: "no-go",
      });
    }
  }, [accountId, onNotify]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <Panel label="COMPLIANCE API KEYS" corners bodyClassName="p-4">
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Key name (e.g. settlement-service)"
            className="text-[11px]"
          />
          <Button
            disabled={busy}
            onClick={() =>
              void (async () => {
                setBusy(true);
                try {
                  const { raw } = await createApiKey(accountId, name);
                  setRevealed(raw);
                  setName("");
                  await load();
                } catch (error) {
                  onNotify({
                    title: "KEY CREATION FAILED",
                    body: error instanceof Error ? error.message : "Unknown error",
                    tone: "no-go",
                  });
                } finally {
                  setBusy(false);
                }
              })()
            }
          >
            ISSUE
          </Button>
        </div>

        {revealed && (
          <div className="inset-row mt-3 border-l-2 border-l-hold bg-hold-dim/40 p-3">
            <Eyebrow className="text-hold">SHOWN ONCE — COPY IT NOW</Eyebrow>
            <p className="mono-font selectable mt-1.5 break-all text-[10px] text-foreground">
              {revealed}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(revealed);
                  onNotify({ title: "KEY COPIED", tone: "info" });
                }}
                className="stencil text-[8px] tracking-[0.2em] text-foreground underline underline-offset-2"
              >
                COPY
              </button>
              <button
                onClick={() => setRevealed(null)}
                className="stencil text-[8px] tracking-[0.2em] text-muted-foreground underline underline-offset-2"
              >
                DISMISS
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 space-y-1.5">
          {keys.length === 0 && (
            <p className="text-[10px] text-muted-foreground">
              No keys issued yet. A key is shown once and stored only as a hash.
            </p>
          )}
          {keys.map((key) => (
            <div
              key={key.id}
              className={cn(
                "flex items-center gap-2 border border-border p-2.5",
                key.revokedAt && "opacity-50"
              )}
            >
              <NovaVault size={13} className="shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10.5px] text-foreground">{key.name}</p>
                <p className="mono-font text-[9px] text-muted-foreground">
                  {truncateMiddle(key.prefix, 12, 0)}… ·{" "}
                  {new Date(key.createdAt).toLocaleDateString()}
                </p>
              </div>
              {key.revokedAt ? (
                <Badge variant="no-go" className="text-[8px]">
                  REVOKED
                </Badge>
              ) : (
                <button
                  onClick={() =>
                    void (async () => {
                      await revokeApiKey(key.id);
                      await load();
                      onNotify({ title: "KEY REVOKED", tone: "info" });
                    })()
                  }
                  className="stencil text-[8px] tracking-[0.18em] text-muted-foreground transition-colors hover:text-no-go"
                >
                  REVOKE
                </button>
              )}
            </div>
          ))}
        </div>
      </Panel>

      <Panel label="API USAGE" bodyClassName="p-4">
        {usageState === "failed" ? (
          <p className="text-[11px] leading-relaxed text-no-go">
            Usage could not be read. These figures are unknown, not zero — retry
            before drawing any conclusion from this panel.
          </p>
        ) : usageState === "loading" ? (
          <p className="mono-font animate-pulse text-[10px] tracking-[0.18em] text-faint">
            READING USAGE…
          </p>
        ) : (
          <>
            <DataRow label="VERIFICATIONS (30D)" value={usage?.last30Days ?? 0} />
            <DataRow label="TOTAL RECORDED" value={usage?.total ?? 0} />
            <DataRow label="GO" value={usage?.byVerdict.go ?? 0} tone="go" />
            <DataRow label="HOLD" value={usage?.byVerdict.hold ?? 0} tone="hold" />
            <DataRow label="NO-GO" value={usage?.byVerdict["no-go"] ?? 0} tone="no-go" />
          </>
        )}

        <Eyebrow className="mb-1.5 mt-4">CALLING THE API</Eyebrow>
        <pre className="mono-font selectable overflow-x-auto rounded-md border border-border bg-background p-2.5 text-[9px] leading-relaxed text-muted-foreground">
{`curl -X POST \\
  https://api.noshashi.app/v1/verify \\
  -H "Authorization: Bearer nsh_live_…" \\
  -H "Content-Type: application/json" \\
  -d '{
    "subject": "r…",
    "domain": "DEX-US",
    "amount_xrp": 1000
  }'`}
        </pre>
        <p className="mt-2 flex items-start gap-1.5 text-[9.5px] leading-relaxed text-muted-foreground">
          <NovaBolt size={11} className="mt-0.5 shrink-0 text-hold" />
          Each call draws one prepaid credit and writes a receipt to your audit trail.
        </p>
      </Panel>
    </div>
  );
}
