import { useState } from "react";
import { cn } from "@/lib/utils";
import { AcademyPanel } from "./AcademyPanel";
import { Labs } from "./Labs";
import { useOnline } from "./useOnline";
import { isTauri } from "@/lib/env";
import { InstallHint } from "./InstallHint";

/**
 * NOSHASHI Academy — a separate desktop app for learning NOSHASHI and the
 * XRP Ledger. It shares NOSHASHI's look, course content and ledger readers,
 * but is its own program: no account, no sign-in, no keys, and progress
 * stays on this computer.
 */

type Tab = "course" | "labs";

export default function App() {
  const [tab, setTab] = useState<Tab>("course");
  const [openLab, setOpenLab] = useState<string | null>(null);
  const online = useOnline();
  return (
    <div className="academy-shell ledger-desktop safe-area flex min-h-screen flex-col bg-background text-foreground">
      <a href="#main" className="skip-link rounded bg-brand px-3 py-1.5 text-primary-foreground">
        Skip to the lesson
      </a>
      <header className="academy-header">
        <h1 className="academy-wordmark">
          <img src={`${import.meta.env.BASE_URL}brand/academy-wordmark.svg`} alt="Noshashi Academy" width="234" height="48" />
        </h1>
        <nav aria-label="Academy sections" className="academy-nav">
          {(
            [
              ["course", "Course"],
              ["labs", "Labs"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-current={tab === id ? "page" : undefined}
              onClick={() => {
                setOpenLab(null);
                setTab(id);
              }}
              className={cn(
                "academy-nav-link",
                tab === id && "academy-nav-link-active"
              )}
            >
              {label}
            </button>
          ))}
        </nav>
        <p className="academy-header-note">Self-paced. Evidence-led. <span>Always free.</span></p>
      </header>
      <InstallHint />
      {!online && (
        <p role="status" className="border-b border-hold/40 bg-hold/10 px-5 py-2 text-[12px] text-foreground">
          {isTauri
            ? "You are offline. Lessons, videos, read-aloud, checks, the final check and your certificate all work. Lab readings show what was recorded until you reconnect."
            : "You are offline. Lessons, read-aloud, checks, the final check and your certificate all work. Videos need a connection here (the desktop app has them built in), and lab readings show what was recorded."}
        </p>
      )}
      <main id="main" className="academy-main">
        {tab === "course" ? (
          <AcademyPanel
            onOpenLab={(id) => {
              setOpenLab(id);
              setTab("labs");
            }}
          />
        ) : (
          <Labs openId={openLab} onClose={() => setOpenLab(null)} />
        )}
      </main>
      <footer className="academy-footer">
        <span>Noshashi Academy</span>
        <span>No account or wallet keys. Progress stays on this device.</span>
      </footer>
    </div>
  );
}
