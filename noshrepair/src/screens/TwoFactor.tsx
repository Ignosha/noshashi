import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, PageTitle } from "../ui";

/**
 * The authenticator step. Required on every sign-in; on the first one the
 * employee enrols an app (any TOTP app: 1Password, Authy, Google or
 * Microsoft Authenticator). The secret is also shown as text, so it can be
 * entered without a camera or read by a screen reader (WCAG 1.1.1).
 */
export function TwoFactor({
  setup,
  onVerify,
  onCancel,
}: {
  setup?: { qr: string; secret: string };
  onVerify: (code: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onVerify(code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That code did not work.");
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md py-12">
      <PageTitle eyebrow="STEP 2 OF 2">{setup ? "Set up your authenticator" : "Enter your authenticator code"}</PageTitle>
      {setup && (
        <div className="mb-5 space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>NOSHREPAIR needs a second step on every sign-in. Scan this code with an authenticator app, or type the key below into it.</p>
          <img src={setup.qr} alt="QR code for adding NOSHREPAIR to an authenticator app. The same key is written out below." className="h-44 w-44 bg-white p-2" />
          <p>
            Key:{" "}
            <code className="mono-font select-all break-all text-foreground" aria-label={`Authenticator key: ${setup.secret.split("").join(" ")}`}>
              {setup.secret}
            </code>
          </p>
        </div>
      )}
      <form noValidate onSubmit={submit} className="space-y-4">
        <Alert>{error}</Alert>
        <Field
          label="6-digit code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={7}
          required
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          hint="The code changes every 30 seconds."
        />
        <div className="flex gap-3">
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? "Checking…" : "Verify"}
          </Button>
          <Button type="button" size="lg" variant="outline" onClick={onCancel}>
            Sign out
          </Button>
        </div>
      </form>
    </div>
  );
}
