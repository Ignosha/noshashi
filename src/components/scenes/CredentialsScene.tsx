import { PatternMark } from "@/components/nova/brand/BrandPattern";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SceneHeader } from "./SceneHeader";
import { Panel, DataRow, Eyebrow } from "@/components/nova/Panel";
import { EmptyState } from "@/components/nova/EmptyState";
import { NovaCredit, NovaEye, NovaShield, NovaVault } from "@/components/nova/NovaIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { shortAddress } from "@/lib/xrpl/client";
import { rippleTimeToDate, truncateMiddle } from "@/lib/format";
import { DOMAIN_REGISTRY, heldCredentialTypes } from "@/lib/policy";
import { useToast } from "@/lib/toast";
import type { XrplState } from "@/lib/xrpl/useXRPL";
import type { CredentialRecord } from "@/lib/xrpl/types";
import { cn } from "@/lib/utils";
import { SPRING, staggerChild, staggerParent } from "@/lib/motion";

type CredentialState = "accepted" | "pending" | "revoked" | "expired";

function credentialState(credential: CredentialRecord): CredentialState {
  if (credential.revoked) return "revoked";
  if (
    credential.expiration &&
    rippleTimeToDate(credential.expiration).getTime() < Date.now()
  ) {
    return "expired";
  }
  return credential.accepted ? "accepted" : "pending";
}

const stateBadge: Record<CredentialState, "go" | "hold" | "no-go"> = {
  accepted: "go",
  pending: "hold",
  revoked: "no-go",
  expired: "no-go",
};

/**
 * CredentialsScene — the XLS-70 registry.
 *
 * Shows what the wallet actually holds on-ledger, which domains those
 * credentials unlock, and what is still missing. An empty registry is
 * a legitimate mainnet answer, so it is explained rather than hidden.
 */
export function CredentialsScene({ data }: { data: XrplState }) {
  const { credentials, account, loadingAccount, accountError, refreshAccount } = data;
  const { push } = useToast();

  const [view, setView] = useState<"grid" | "table">("grid");
  const [selected, setSelected] = useState<CredentialRecord | null>(null);
  const [disclosureOpen, setDisclosureOpen] = useState(false);

  const held = useMemo(() => heldCredentialTypes(credentials), [credentials]);

  /** Which domains this wallet could enter with what it holds today. */
  const unlocked = useMemo(
    () =>
      DOMAIN_REGISTRY.map((domain) => ({
        domain,
        met: domain.requirements.filter((requirement) => held.has(requirement)).length,
      })),
    [held]
  );

  const accepted = credentials.filter(
    (credential) => credentialState(credential) === "accepted"
  ).length;

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <SceneHeader
        index="03"
        kicker="XLS-70 · ON-CHAIN ATTESTATION"
        title="CREDENTIAL REGISTRY"
        sub={
          account
            ? `Credential objects held by ${shortAddress(account.address)} on XRPL mainnet.`
            : "Load a wallet to read its credential objects."
        }
        status={accepted > 0 ? "go" : credentials.length > 0 ? "hold" : "no-go"}
        statusLabel={
          loadingAccount
            ? "READING"
            : `${accepted}/${credentials.length || 0} ACTIVE`
        }
        right={
          <div className="flex items-center gap-2">
            <Tabs value={view} onValueChange={(value) => setView(value as "grid" | "table")}>
              <TabsList>
                <TabsTrigger value="grid">GRID</TabsTrigger>
                <TabsTrigger value="table">TABLE</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void refreshAccount()}
              disabled={loadingAccount}
            >
              {loadingAccount ? "SYNCING…" : "RESYNC"}
            </Button>
          </div>
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-5 gap-3">
        <div className="col-span-3 flex min-h-0 flex-col gap-3">
          <Panel
            label="HELD CREDENTIALS"
            corners
            className="min-h-0 flex-1"
            bodyClassName="min-h-0 overflow-y-auto p-3"
            right={
              <span className="mono-font text-[9px] tabular-nums text-muted-foreground">
                {credentials.length} OBJECT{credentials.length === 1 ? "" : "S"}
              </span>
            }
          >
            <PatternMark element="dots" size={260} opacity={0.06} className="-right-16 -top-16" />

            {accountError ? (
              <EmptyState
                icon={<NovaShield size={16} />}
                title="ACCOUNT UNREADABLE"
                body={accountError}
                action={
                  <Button size="sm" variant="outline" onClick={() => void refreshAccount()}>
                    RETRY
                  </Button>
                }
              />
            ) : credentials.length === 0 ? (
              <EmptyState
                icon={<NovaCredit size={16} />}
                title="NO CREDENTIALS ON THIS ACCOUNT"
                body="This wallet holds no XLS-70 credential objects on mainnet yet. Credentials appear here the moment an issuer creates one and the subject accepts it."
                action={
                  <Button size="sm" variant="outline" onClick={() => setDisclosureOpen(true)}>
                    HOW ISSUANCE WORKS
                  </Button>
                }
              />
            ) : view === "grid" ? (
              <motion.div
                className="grid grid-cols-1 gap-3 lg:grid-cols-2"
                variants={staggerParent(0.05)}
                initial="hidden"
                animate="show"
              >
                {credentials.map((credential) => (
                  <CredentialCard
                    key={`${credential.issuer}-${credential.credentialType}`}
                    credential={credential}
                    onOpen={() => setSelected(credential)}
                  />
                ))}
              </motion.div>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border">
                    {["TYPE", "ISSUER", "SUBJECT", "STATE"].map((heading) => (
                      <th
                        key={heading}
                        className="stencil pb-2 text-[8px] font-medium tracking-[0.2em] text-muted-foreground"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {credentials.map((credential) => {
                    const state = credentialState(credential);
                    return (
                      <tr
                        key={`${credential.issuer}-${credential.credentialType}`}
                        onClick={() => setSelected(credential)}
                        className="cursor-pointer border-b border-border/30 transition-colors hover:bg-secondary/40"
                      >
                        <td className="mono-font py-2 text-[10px] text-foreground">
                          {credential.credentialType}
                        </td>
                        <td className="mono-font py-2 text-[10px] text-muted-foreground">
                          {shortAddress(credential.issuer)}
                        </td>
                        <td className="mono-font py-2 text-[10px] text-muted-foreground">
                          {shortAddress(credential.subject)}
                        </td>
                        <td className="py-2">
                          <Badge variant={stateBadge[state]}>{state.toUpperCase()}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Panel>

          <Panel
            label="SELECTIVE DISCLOSURE"
            className="shrink-0"
            right={
              <span className="stencil text-[8px] tracking-[0.2em] text-muted-foreground">
                ZERO-KNOWLEDGE
              </span>
            }
          >
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border">
                <NovaEye size={15} className="text-muted-foreground" />
              </div>
              <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted-foreground">
                Prove a single predicate — “accredited”, “over 18”, “not sanctioned” —
                without disclosing the credential payload behind it.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => setDisclosureOpen(true)}
              >
                BUILD PROOF
              </Button>
            </div>
          </Panel>
        </div>

        {/* Right — coverage against the domain registry */}
        <div className="col-span-2 flex min-h-0 flex-col gap-3">
          <Panel
            label="DOMAIN UNLOCKS"
            className="min-h-0 flex-1"
            bodyClassName="overflow-y-auto p-3"
          >
            <Eyebrow className="mb-2">
              WHAT THESE CREDENTIALS OPEN
            </Eyebrow>
            <div className="space-y-2">
              {unlocked.map(({ domain, met }) => {
                const complete = met === domain.requirements.length;
                return (
                  <div
                    key={domain.id}
                    className="inset-row p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="mono-font truncate text-[10px] text-foreground">
                        {domain.name}
                      </span>
                      <Badge variant={complete ? "go" : met > 0 ? "hold" : "no-go"}>
                        {met}/{domain.requirements.length}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {domain.requirements.map((requirement) => (
                        <span
                          key={requirement}
                          className={cn(
                            "mono-font border px-1.5 py-0.5 text-[8px]",
                            held.has(requirement)
                              ? "border-go/40 text-go"
                              : "border-border text-muted-foreground"
                          )}
                        >
                          {requirement}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel label="REGISTRY FACTS" className="shrink-0">
            <DataRow label="SUBJECT" value={account ? shortAddress(account.address) : "—"} />
            <DataRow label="OBJECTS" value={credentials.length} />
            <DataRow label="ACCEPTED" value={accepted} tone={accepted > 0 ? "go" : "muted"} />
            <DataRow
              label="REVOKED"
              value={credentials.filter((credential) => credential.revoked).length}
              tone="muted"
            />
            <DataRow label="OWNER RESERVE" value={`${account?.ownerCount ?? 0} OBJ`} />
          </Panel>
        </div>
      </div>

      <CredentialDialog
        credential={selected}
        onClose={() => setSelected(null)}
        onCopy={(value) => {
          void navigator.clipboard.writeText(value);
          push({ title: "COPIED TO CLIPBOARD", tone: "info" });
        }}
      />

      <Dialog open={disclosureOpen} onOpenChange={setDisclosureOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>SELECTIVE DISCLOSURE</DialogTitle>
            <DialogDescription>
              How a credential becomes a proof without becoming a disclosure.
            </DialogDescription>
          </DialogHeader>
          <ol className="mt-4 space-y-3">
            {[
              {
                step: "01",
                title: "Issuer creates the credential",
                body: "A regulated issuer submits CredentialCreate naming your account as subject and a credential type such as KYC_LEVEL_1.",
              },
              {
                step: "02",
                title: "You accept it",
                body: "CredentialAccept links the object to your account. Until you accept, it does not count toward any domain.",
              },
              {
                step: "03",
                title: "You prove one predicate",
                body: "The wallet generates a zero-knowledge proof for a single statement. The verifier learns the answer and nothing else.",
              },
              {
                step: "04",
                title: "The receipt is auditable",
                body: "Each verification writes a hashed receipt, so a regulator can confirm the check happened without seeing the payload.",
              },
            ].map((item) => (
              <li key={item.step} className="flex gap-3">
                <span className="display shrink-0 text-[13px] font-[700] text-muted-foreground/40">
                  {item.step}
                </span>
                <div>
                  <p className="text-[11px] font-medium text-foreground">{item.title}</p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setDisclosureOpen(false)}>
              CLOSE
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CredentialCard({
  credential,
  onOpen,
}: {
  credential: CredentialRecord;
  onOpen: () => void;
}) {
  const state = credentialState(credential);

  return (
    <motion.button
      variants={staggerChild}
      whileHover={{ y: -2 }}
      transition={SPRING}
      onClick={onOpen}
      className="hud-corner group relative border border-border bg-card/60 p-3 text-left transition-colors hover:border-foreground/35"
    >
      <div className="flex items-center justify-between">
        <NovaCredit
          size={16}
          className="text-muted-foreground transition-colors group-hover:text-foreground"
        />
        <Badge variant={stateBadge[state]}>{state.toUpperCase()}</Badge>
      </div>

      <p className="mono-font mt-3 truncate text-[11px] text-foreground">
        {credential.credentialType}
      </p>
      <p className="mono-font mt-1 truncate text-[9px] text-muted-foreground">
        ISS {shortAddress(credential.issuer)}
      </p>

      <div className="mt-3 flex items-center justify-between border-t border-border pt-2">
        <span className="stencil text-[8px] tracking-[0.18em] text-muted-foreground">
          {credential.uri ? "URI ATTACHED" : "NO URI"}
        </span>
        <span
          className={cn(
            "stencil text-[8px] tracking-[0.18em]",
            state === "accepted" ? "text-go" : "text-muted-foreground"
          )}
        >
          {state === "accepted" ? "VALID" : "INACTIVE"}
        </span>
      </div>
    </motion.button>
  );
}

function CredentialDialog({
  credential,
  onClose,
  onCopy,
}: {
  credential: CredentialRecord | null;
  onClose: () => void;
  onCopy: (value: string) => void;
}) {
  return (
    <Dialog open={Boolean(credential)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <AnimatePresence>
          {credential && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={SPRING}
            >
              <DialogHeader>
                <DialogTitle>{credential.credentialType}</DialogTitle>
                <DialogDescription>
                  XLS-70 credential object as recorded on the validated ledger.
                </DialogDescription>
              </DialogHeader>

              <div className="mt-4">
                <DataRow
                  label="ISSUER"
                  value={
                    <span className="selectable">
                      {truncateMiddle(credential.issuer, 10, 8)}
                    </span>
                  }
                />
                <DataRow
                  label="SUBJECT"
                  value={
                    <span className="selectable">
                      {truncateMiddle(credential.subject, 10, 8)}
                    </span>
                  }
                />
                <DataRow
                  label="STATE"
                  value={credentialState(credential).toUpperCase()}
                  tone={credential.revoked ? "no-go" : credential.accepted ? "go" : "hold"}
                />
                <DataRow
                  label="EXPIRES"
                  value={
                    credential.expiration
                      ? rippleTimeToDate(credential.expiration).toLocaleString()
                      : "NEVER"
                  }
                />
                {credential.uri && (
                  <DataRow
                    label="URI"
                    value={<span className="selectable">{credential.uri}</span>}
                  />
                )}
              </div>

              <DialogFooter>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onCopy(credential.issuer)}
                >
                  COPY ISSUER
                </Button>
                <Button size="sm" onClick={onClose}>
                  <NovaVault size={13} />
                  DONE
                </Button>
              </DialogFooter>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
