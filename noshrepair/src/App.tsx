import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IDLE_LIMIT_MS, IDLE_WARNING_MS } from "./client";
import { useStaffSession } from "./session";
import { Errors } from "./screens/Errors";
import { Help } from "./screens/Help";
import { NotStaff } from "./screens/NotStaff";
import { Queue } from "./screens/Queue";
import { SignIn } from "./screens/SignIn";
import { TicketView } from "./screens/TicketView";
import { TwoFactor } from "./screens/TwoFactor";
import { LiveStatus } from "./ui";

type View = { kind: "queue" } | { kind: "ticket"; id: string } | { kind: "errors" } | { kind: "help" };

/** Follow the system's light or dark setting, live. */
function useSystemTheme() {
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => document.documentElement.classList.toggle("dark", !query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
}

/**
 * Sign out after IDLE_LIMIT_MS without input, with a warning IDLE_WARNING_MS
 * before and a button to stay signed in (WCAG 2.2.1, Timing Adjustable).
 */
function useIdleLock(active: boolean, onExpire: () => void) {
  const [warning, setWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const last = useRef(Date.now());

  const touch = useCallback(() => {
    last.current = Date.now();
    setWarning(false);
  }, []);

  useEffect(() => {
    if (!active) return;
    last.current = Date.now();
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    const onInput = () => {
      // While the warning is open, only its button keeps the session.
      setWarning((w) => {
        if (!w) last.current = Date.now();
        return w;
      });
    };
    events.forEach((e) => window.addEventListener(e, onInput, { passive: true }));
    const timer = setInterval(() => {
      const idle = Date.now() - last.current;
      if (idle >= IDLE_LIMIT_MS) {
        setWarning(false);
        onExpire();
      } else if (idle >= IDLE_LIMIT_MS - IDLE_WARNING_MS) {
        setWarning(true);
        setSecondsLeft(Math.ceil((IDLE_LIMIT_MS - idle) / 1000));
      }
    }, 1000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, onInput));
      clearInterval(timer);
    };
  }, [active, onExpire]);

  return { warning, secondsLeft, stay: touch };
}

export default function App() {
  useSystemTheme();
  const { stage, signIn, createAccount, resetPassword, verifyCode, signOut } = useStaffSession();
  const [view, setView] = useState<View>({ kind: "queue" });
  const [notice, setNotice] = useState<string | null>(null);

  const expire = useCallback(() => {
    void signOut();
    setNotice("You were signed out after 15 minutes without activity.");
    setView({ kind: "queue" });
  }, [signOut]);
  const idle = useIdleLock(stage.kind === "ready", expire);

  useEffect(() => {
    const title = stage.kind === "ready" ? { queue: "Queue", ticket: "Ticket", errors: "Recurring errors", help: "Help" }[view.kind] : "Sign in";
    document.title = `${title} · NOSHREPAIR`;
  }, [stage.kind, view.kind]);

  const outside = (body: React.ReactNode) => (
    <div className="min-h-screen bg-background px-4 text-foreground">
      <main id="main">{body}</main>
    </div>
  );

  if (stage.kind === "loading") return outside(<div className="py-12"><LiveStatus>Starting NOSHREPAIR…</LiveStatus></div>);
  if (stage.kind === "signed-out")
    return outside(
      <SignIn
        key={notice ?? "signin"}
        notice={notice}
        onSignIn={async (e, p) => {
          await signIn(e, p);
          setNotice(null);
        }}
        onCreate={createAccount}
        onReset={resetPassword}
      />
    );
  if (stage.kind === "setup" || stage.kind === "challenge")
    return outside(
      <TwoFactor
        setup={stage.kind === "setup" ? { qr: stage.qr, secret: stage.secret } : undefined}
        onVerify={(code) => verifyCode(stage.factorId, code)}
        onCancel={() => void signOut()}
      />
    );
  if (stage.kind === "not-staff") return outside(<NotStaff email={stage.email} onBack={() => void signOut()} />);

  const nav: Array<{ kind: "queue" | "errors" | "help"; label: string }> = [
    { kind: "queue", label: "Queue" },
    { kind: "errors", label: "Recurring errors" },
    { kind: "help", label: "Help" },
  ];
  const current = view.kind === "ticket" ? "queue" : view.kind;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to main content
      </a>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <img src="/app-icon.svg" alt="" className="h-7 w-7" />
          <p className="stencil text-sm tracking-[0.16em]">
            NOSHREPAIR <span className="text-muted-foreground">· NOSHASHI SUPPORT</span>
          </p>
        </div>
        <nav aria-label="NOSHREPAIR">
          <ul className="flex flex-wrap gap-1">
            {nav.map((n) => (
              <li key={n.kind}>
                <button
                  type="button"
                  aria-current={current === n.kind ? "page" : undefined}
                  onClick={() => setView({ kind: n.kind })}
                  className="border border-transparent px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:text-foreground"
                >
                  {n.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            Signed in as <span className="text-foreground">{stage.email}</span>
          </span>
          <Button size="sm" variant="outline" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="flex-1 px-4 py-6 outline-none md:px-8">
        {view.kind === "queue" && <Queue onOpen={(id) => setView({ kind: "ticket", id })} />}
        {view.kind === "ticket" && <TicketView key={view.id} id={view.id} onBack={() => setView({ kind: "queue" })} />}
        {view.kind === "errors" && <Errors onOpenTicket={(id) => setView({ kind: "ticket", id })} />}
        {view.kind === "help" && <Help />}
      </main>
      <footer className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
        Read-only account access needs the customer's permission. Every view and repair is logged where the customer can see it.
      </footer>

      <Dialog open={idle.warning} onOpenChange={(open) => !open && idle.stay()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Still there?</DialogTitle>
            <DialogDescription>
              For security you will be signed out in {Math.floor(idle.secondsLeft / 60)}:{String(idle.secondsLeft % 60).padStart(2, "0")} without activity.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => void signOut()}>
              Sign out now
            </Button>
            <Button autoFocus onClick={idle.stay}>
              Stay signed in
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
