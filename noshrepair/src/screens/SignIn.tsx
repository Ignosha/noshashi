import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, PageTitle } from "../ui";

type Mode = "sign-in" | "create" | "reset";

/**
 * Sign-in for NOSHASHI support staff, including new employees.
 *
 * A new employee can create an account here, but it is only a support
 * account once the owner has invited that email (see noshrepair/README.md)
 * and the email is verified. Until then every NOSHREPAIR screen refuses it.
 */
export function SignIn({
  onSignIn,
  onCreate,
  onReset,
  notice,
}: {
  onSignIn: (email: string, password: string) => Promise<void>;
  onCreate: (email: string, password: string, name: string) => Promise<void>;
  onReset: (email: string) => Promise<void>;
  notice?: string | null;
}) {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(notice ?? null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setInfo(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter your work email address.");
    if (mode !== "reset" && !password) return setError("Enter your password.");
    setBusy(true);
    try {
      if (mode === "sign-in") await onSignIn(email, password);
      if (mode === "create") {
        await onCreate(email, password, name);
        setInfo("Check your email and open the confirmation link. Then come back and sign in; you will set up your authenticator next.");
        setMode("sign-in");
        setPassword("");
      }
      if (mode === "reset") {
        await onReset(email);
        setInfo("If that email has an account, a reset link is on its way.");
        setMode("sign-in");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "sign-in" ? "Sign in to NOSHREPAIR" : mode === "create" ? "Set up your staff account" : "Reset your password";

  return (
    <div className="mx-auto w-full max-w-md py-12">
      <PageTitle eyebrow="NOSHASHI SUPPORT · STAFF ONLY">{title}</PageTitle>
      <form noValidate onSubmit={submit} className="space-y-4" aria-describedby="signin-help">
        <p id="signin-help" className="text-sm leading-relaxed text-muted-foreground">
          {mode === "create"
            ? "Use the work email the NOSHASHI owner invited. Your account becomes a support account once the email is confirmed."
            : "For NOSHASHI support staff. Every session needs your authenticator app as well as your password."}
        </p>
        {info && <Alert tone="info">{info}</Alert>}
        <Alert>{error}</Alert>
        {mode === "create" && <Field label="Your name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />}
        <Field label="Work email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        {mode !== "reset" && (
          <Field
            label="Password"
            type="password"
            autoComplete={mode === "create" ? "new-password" : "current-password"}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint={mode === "create" ? "At least 14 characters, with upper and lower case, a number and a symbol. It is checked against known data breaches." : undefined}
          />
        )}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? "Please wait…" : mode === "sign-in" ? "Sign in" : mode === "create" ? "Create staff account" : "Send reset link"}
        </Button>
      </form>
      <nav aria-label="Other sign-in options" className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {mode !== "sign-in" && (
          <button type="button" className="text-foreground underline underline-offset-4" onClick={() => { setMode("sign-in"); setError(null); }}>
            Back to sign in
          </button>
        )}
        {mode !== "create" && (
          <button type="button" className="text-foreground underline underline-offset-4" onClick={() => { setMode("create"); setError(null); }}>
            New employee? Set up your account
          </button>
        )}
        {mode !== "reset" && (
          <button type="button" className="text-foreground underline underline-offset-4" onClick={() => { setMode("reset"); setError(null); }}>
            Forgot password
          </button>
        )}
      </nav>
    </div>
  );
}
