import { useState } from "react";
import { createRoot } from "react-dom/client";
import "../../src/index.css";
import {
  SecurityDesk,
  ControlLab,
} from "../../src/components/scenes/SecurityDesk";
import { CredentialsScene } from "../../src/components/scenes/CredentialsScene";
import { EvidenceTrail } from "../../src/components/scenes/SecurityTrail";
import {
  DependencyExposureTab,
  RecoveryReadinessTab,
  TreasuryScenarioTab,
  LedgerIntegrityTab,
} from "../../src/components/scenes/EnterpriseSecurity";
import { ThreatSharingPanel } from "../../src/components/scenes/ThreatSharing";
import { SecurityScene } from "../../src/components/scenes/SecurityScene";
import { AuthProvider } from "../../src/lib/auth/useAuth";
import { BillingProvider } from "../../src/lib/billing/useEntitlements";
import { ToastProvider } from "../../src/lib/toast";
import { unfundedAccount } from "../../src/lib/xrpl/client";
import type { XrplState } from "../../src/lib/xrpl/useXRPL";
const address = "rLdhU5DKrpztzVPnQmtzAbHfiHR8LPYtaX";
function Preview() {
  const [view, setView] = useState("desk");
  const [failure, setFailure] = useState(false);
  const data = {
    account: { ...unfundedAccount(address), unfunded: false },
    credentials: [
      {
        subject: address,
        issuer: "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
        credentialType: "KYC",
        accepted: true,
        revoked: false,
      },
    ],
    loadingAccount: false,
    accountError: null,
    credentialError: failure
      ? "Credential objects unavailable: retry the ledger read."
      : null,
    refreshAccount: async () => setFailure(false),
  } as unknown as XrplState;
  return (
    <ToastProvider>
      <main id="review">
        <p className="mono-font border-b border-border pb-3 text-xs">
          LOCAL REVIEW · RECORDED LEDGER FIXTURE · NETWORK AND BILLING SIMULATED
        </p>
        <nav aria-label="Component review">
          <button onClick={() => setView("desk")}>Overview</button>
          <button onClick={() => setView("dependencies")}>
            Software exposure
          </button>
          <button onClick={() => setView("readiness")}>
            Response notebook
          </button>
          <button onClick={() => setView("contingency")}>
            Treasury scenarios
          </button>
          <button onClick={() => setView("integrity")}>Node comparison</button>
          <button onClick={() => setView("sharing")}>Reviewed sharing</button>
          <button onClick={() => setView("scene")}>
            Integrated security center
          </button>
          <button onClick={() => setView("control")}>Signing map</button>
          <button onClick={() => setView("drift")}>Control changes</button>
          <button onClick={() => setView("credentials")}>
            Credential registry
          </button>
          <button
            onClick={() => {
              setFailure(true);
              setView("credentials");
            }}
          >
            Credential read failure
          </button>
          <button onClick={() => setView("trail")}>Incident graph</button>
        </nav>
        {view === "dependencies" ? (
          <DependencyExposureTab />
        ) : view === "readiness" ? (
          <RecoveryReadinessTab />
        ) : view === "contingency" ? (
          <TreasuryScenarioTab />
        ) : view === "integrity" ? (
          <LedgerIntegrityTab />
        ) : view === "sharing" ? (
          <ThreatSharingPanel
            organization={null}
            entitled={false}
            staff={false}
            onUpgrade={() => {}}
            onSignIn={() => {}}
          />
        ) : view === "scene" ? (
          <AuthProvider>
            <BillingProvider>
              <div style={{ height: 1000 }}>
                <SecurityScene onUpgrade={() => {}} onSignIn={() => {}} />
              </div>
            </BillingProvider>
          </AuthProvider>
        ) : view === "desk" ? (
          <SecurityDesk
            onOpen={(id) =>
              setView(
                [
                  "drift",
                  "dependencies",
                  "readiness",
                  "contingency",
                  "integrity",
                  "sharing",
                ].includes(id)
                  ? id
                  : "control",
              )
            }
          />
        ) : view === "credentials" ? (
          <div className="credential-frame">
            <CredentialsScene data={data} />
          </div>
        ) : view === "trail" ? (
          <EvidenceTrail
            trace={{
              root: address,
              sinceLedger: 1,
              depthLimit: 2,
              minXrp: 1,
              dust: { count: 0, xrp: 0 },
              vanity: [],
              sanctionsChecked: false,
              nodes: [
                {
                  address,
                  depth: 0,
                  status: "source",
                  receivedXrp: 0,
                  balanceXrp: 2,
                  domain: null,
                  sanction: null,
                  read: 1,
                  truncated: false,
                },
                {
                  address: "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
                  depth: 1,
                  status: "custodial",
                  receivedXrp: 1,
                  balanceXrp: null,
                  domain: null,
                  sanction: null,
                  read: 0,
                  truncated: true,
                },
              ],
              flows: [
                {
                  from: address,
                  to: "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
                  kind: "payment",
                  amount: { currency: "XRP", issuer: null, value: 1 },
                  ledger: 1,
                  at: null,
                  hash: "A".repeat(64),
                  destinationTag: 12,
                },
              ],
            }}
          />
        ) : (
          <ControlLab key={view} initial={address} drift={view === "drift"} />
        )}
      </main>
    </ToastProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
