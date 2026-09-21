import { PatternMark } from "@/components/nova/brand/BrandPattern";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { NovaLogo } from "@/components/nova/NovaLogo";
import { Panel, Eyebrow } from "@/components/nova/Panel";
import { NovaBolt, NovaEye, NovaShield, NovaVault } from "@/components/nova/NovaIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth, passwordProblems, passwordScore } from "@/lib/auth/useAuth";
import { useToast } from "@/lib/toast";
import { BRAND, CONTACT, copyrightLine } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { SPRING } from "@/lib/motion";

type Mode = "signin" | "signup" | "otp" | "reset" | "mfa";

const MODE_COPY: Record<Mode, { title: string; blurb: string }> = {
  signin: {
    title: "SIGN IN",
    blurb: "Access your subscription, portfolios and API keys.",
  },
  signup: {
    title: "CREATE ACCOUNT",
    blurb: "The console stays free. An account is only needed for paid capabilities.",
  },
  otp: {
    title: "ONE-TIME CODE",
    blurb: "We emailed a six-digit code. It expires shortly.",
  },
  reset: {
    title: "RESET PASSWORD",
    blurb: "We will email a link to set a new password.",
  },
  mfa: {
    title: "SECOND FACTOR",
    blurb: "Enter the current code from your authenticator app.",
  },
};

const STRENGTH_LABEL = ["Too weak", "Weak", "Fair", "Strong", "Very strong"];
const STRENGTH_TONE = [
  "bg-no-go",
  "bg-no-go",
  "bg-hold",
  "bg-go",
  "bg-go",
];

/**
 * AuthScene — sign in, sign up, email one-time codes, password reset and
 * the TOTP challenge.
 *
 * No credential is ever stored or transformed here: the password goes
 * straight to Supabase Auth, which hashes it server-side, and the second
 * factor is a real RFC 6238 TOTP verification. The only local logic is
 * refusing weak passwords before they leave the field.
 */
export function AuthScene({
  onAuthenticated,
  onDismiss,
}: {
  onAuthenticated: () => void;
  onDismiss: () => void;
}) {
  const {
    signIn,
    signUp,
    signInWithOtp,
    verifyOtp,
    resetPassword,
    challengeTotp,
    factors,
    user,
    mfaRequired,
  } = useAuth();
  const { push } = useToast();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  // A signed-in session that still owes a second factor lands on the challenge.
  useEffect(() => {
    if (mfaRequired) setMode("mfa");
  }, [mfaRequired]);

  useEffect(() => {
    if (user && !mfaRequired) onAuthenticated();
  }, [user, mfaRequired, onAuthenticated]);

  const problems = useMemo(() => passwordProblems(password), [password]);
  const score = useMemo(() => passwordScore(password), [password]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Something went wrong.";
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;

    if (mode === "signin") {
      void run(async () => {
        const { mfaRequired: needsSecond } = await signIn(email.trim(), password);
        if (needsSecond) {
          setMode("mfa");
          setNotice("Password accepted. Enter your authenticator code.");
          return;
        }
        push({ title: "SIGNED IN", tone: "go" });
      });
      return;
    }

    if (mode === "signup") {
      void run(async () => {
        await signUp(email.trim(), password, displayName.trim() || undefined);
        setNotice(
          "Account created. Check your email for a confirmation link, then sign in."
        );
        setMode("signin");
        setPassword("");
      });
      return;
    }

    if (mode === "otp") {
      void run(async () => {
        await verifyOtp(email.trim(), code);
        push({ title: "SIGNED IN", tone: "go" });
      });
      return;
    }

    if (mode === "reset") {
      void run(async () => {
        await resetPassword(email.trim());
        setNotice("If that address has an account, a reset link is on its way.");
      });
      return;
    }

    if (mode === "mfa") {
      void run(async () => {
        const factor = factors.find((entry) => entry.status === "verified");
        if (!factor) throw new Error("No verified authenticator is enrolled.");
        await challengeTotp(factor.id, code);
        push({ title: "SECOND FACTOR ACCEPTED", tone: "go" });
      });
      return;
    }
  };

  const copy = MODE_COPY[mode];

  return (
    <div className="scanlines relative flex h-full w-full items-center justify-center overflow-y-auto overflow-x-hidden bg-background p-6 text-foreground">
      <PatternMark element="orbital" size={460} opacity={0.06} className="-right-32 -top-24" />

      <div className="relative w-full max-w-[420px]">
        <div className="mb-6 flex flex-col items-center text-center">
          <NovaLogo size={44} className="text-foreground" />
          <h1 className="display mt-4 text-[22px] font-[800] tracking-[0.1em] text-foreground">
            {BRAND.name}
          </h1>
          <p className="stencil mt-1.5 text-[8px] tracking-[0.3em] text-muted-foreground">
            {BRAND.tagline.toUpperCase()}
          </p>
        </div>

        <Panel corners bodyClassName="p-5">
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={SPRING}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="display text-[15px] font-[700] tracking-[0.1em] text-foreground">
                    {copy.title}
                  </h2>
                  <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted-foreground">
                    {copy.blurb}
                  </p>
                </div>
                {mode === "mfa" && (
                  <Badge variant="go" className="shrink-0 text-[8px]">
                    2FA
                  </Badge>
                )}
              </div>

              <form onSubmit={submit} className="mt-5 space-y-3.5" noValidate>
                {mode !== "mfa" && (
                  <div>
                    <Label htmlFor="auth-email">EMAIL</Label>
                    <Input
                      id="auth-email"
                      ref={emailRef}
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="mt-1.5"
                      placeholder="you@institution.com"
                    />
                  </div>
                )}

                {mode === "signup" && (
                  <div>
                    <Label htmlFor="auth-name">NAME (OPTIONAL)</Label>
                    <Input
                      id="auth-name"
                      autoComplete="name"
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                )}

                {(mode === "signin" || mode === "signup") && (
                  <div>
                    <Label htmlFor="auth-password">PASSWORD</Label>
                    <Input
                      id="auth-password"
                      type="password"
                      autoComplete={
                        mode === "signup" ? "new-password" : "current-password"
                      }
                      required
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="mt-1.5"
                      aria-describedby={mode === "signup" ? "password-help" : undefined}
                    />

                    {mode === "signup" && password.length > 0 && (
                      <div id="password-help" className="mt-2">
                        <div className="flex gap-1" aria-hidden="true">
                          {[0, 1, 2, 3].map((index) => (
                            <span
                              key={index}
                              className={cn(
                                "h-0.5 flex-1 transition-colors",
                                index < score ? STRENGTH_TONE[score] : "bg-secondary"
                              )}
                            />
                          ))}
                        </div>
                        <p className="mt-1.5 text-[9.5px] text-muted-foreground">
                          <span className="text-foreground">{STRENGTH_LABEL[score]}</span>
                          {problems.length > 0 && ` · needs ${problems.join(", ").toLowerCase()}`}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {(mode === "otp" || mode === "mfa") && (
                  <div>
                    <Label htmlFor="auth-code">
                      {mode === "otp" ? "EMAILED CODE" : "AUTHENTICATOR CODE"}
                    </Label>
                    <Input
                      id="auth-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                      maxLength={8}
                      value={code}
                      onChange={(event) =>
                        setCode(event.target.value.replace(/[^0-9]/g, ""))
                      }
                      className="mono-font mt-1.5 text-center text-[18px] tracking-[0.5em]"
                      placeholder="000000"
                    />
                  </div>
                )}

                {error && (
                  <p
                    role="alert"
                    className="border border-no-go/40 bg-no-go-dim px-2.5 py-2 text-[10.5px] leading-relaxed text-no-go"
                  >
                    {error}
                  </p>
                )}
                {notice && (
                  <p
                    role="status"
                    className="border border-go/40 bg-go-dim px-2.5 py-2 text-[10.5px] leading-relaxed text-go"
                  >
                    {notice}
                  </p>
                )}

                <Button type="submit" className="w-full" disabled={busy}>
                  {busy
                    ? "WORKING…"
                    : mode === "signin"
                      ? "SIGN IN"
                      : mode === "signup"
                        ? "CREATE ACCOUNT"
                        : mode === "otp"
                          ? "VERIFY CODE"
                          : mode === "reset"
                            ? "SEND RESET LINK"
                            : "VERIFY"}
                </Button>
              </form>

              {/* Alternate routes */}
              <div className="mt-4 space-y-2 border-t border-border pt-4">
                {mode === "signin" && (
                  <>
                    <button
                      onClick={() =>
                        void run(async () => {
                          if (!email.trim()) throw new Error("Enter your email first.");
                          await signInWithOtp(email.trim());
                          setMode("otp");
                          setNotice("Code sent. It is valid for a few minutes.");
                        })
                      }
                      className="flex w-full items-center gap-2 text-[10.5px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <NovaBolt size={11} />
                      Email me a one-time code instead
                    </button>
                    <button
                      onClick={() => setMode("reset")}
                      className="flex w-full items-center gap-2 text-[10.5px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <NovaVault size={11} />
                      Forgot password
                    </button>
                    <button
                      onClick={() => setMode("signup")}
                      className="flex w-full items-center gap-2 text-[10.5px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <NovaShield size={11} />
                      Create an account
                    </button>
                  </>
                )}

                {mode !== "signin" && (
                  <button
                    onClick={() => {
                      setMode("signin");
                      setError(null);
                      setNotice(null);
                      setCode("");
                    }}
                    className="flex w-full items-center gap-2 text-[10.5px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <NovaEye size={11} />
                    Back to sign in
                  </button>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </Panel>

        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={onDismiss}
            className="stencil text-[8px] tracking-[0.22em] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            ← CONTINUE WITHOUT AN ACCOUNT
          </button>
          <a
            href={`mailto:${CONTACT.support}`}
            className="stencil text-[8px] tracking-[0.22em] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            NEED HELP
          </a>
        </div>

        <Eyebrow className="mt-6 text-center">
          {copyrightLine()} · PASSWORDS HASHED SERVER-SIDE · TOTP 2FA SUPPORTED
        </Eyebrow>
      </div>
    </div>
  );
}
