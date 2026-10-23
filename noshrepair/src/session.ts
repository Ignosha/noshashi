import { useCallback, useEffect, useRef, useState } from "react";
import { COOLDOWN_MS, MAX_ATTEMPTS, repairClient } from "./client";
import { isRepairStaff } from "./api";
import { passwordProblems } from "@/lib/auth/useAuth";
import { breachedMessage, isUnscreenedRefusal, screenPassword, UNAVAILABLE_MESSAGE } from "@/lib/auth/screening";
import { supabaseErrorMessage } from "@/lib/supabase/errors";

/**
 * Who is using NOSHREPAIR, and how far they are through signing in.
 *
 *   signed-out → (password) → two-factor setup (first time) or two-factor
 *   → staff check → ready
 *
 * Two-factor is not optional: the database refuses every NOSHREPAIR read
 * and action unless the session is at aal2, so an employee without an
 * authenticator is sent to set one up before anything else. An account
 * that is not on the support team is signed out with an explanation.
 */

export type Stage =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "setup"; qr: string; secret: string; factorId: string }
  | { kind: "challenge"; factorId: string }
  | { kind: "not-staff"; email: string }
  | { kind: "ready"; email: string };

const auth = () => repairClient().auth;

export function useStaffSession() {
  const [stage, setStage] = useState<Stage>({ kind: "loading" });
  const attempts = useRef<{ count: number; until: number }>({ count: 0, until: 0 });

  /** Decide the stage from the current session. */
  const resolve = useCallback(async () => {
    const { data: sessionData } = await auth().getSession();
    const session = sessionData.session;
    if (!session) return setStage({ kind: "signed-out" });
    const email = session.user.email ?? "";
    const { data: aal } = await auth().mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== "aal2") {
      const { data: factors } = await auth().mfa.listFactors();
      const totp = factors?.totp?.find((f) => f.status === "verified");
      if (totp) {
        await auth().mfa.challenge({ factorId: totp.id });
        return setStage({ kind: "challenge", factorId: totp.id });
      }
      // First sign-in: enrol an authenticator before anything else.
      for (const stale of factors?.all?.filter((f) => f.status !== "verified") ?? []) {
        await auth().mfa.unenroll({ factorId: stale.id }).catch(() => undefined);
      }
      const { data: enrolled, error } = await auth().mfa.enroll({ factorType: "totp", friendlyName: `NOSHREPAIR ${new Date().toISOString().slice(0, 10)}` });
      if (error || !enrolled) throw new Error(supabaseErrorMessage(error));
      return setStage({ kind: "setup", qr: enrolled.totp.qr_code, secret: enrolled.totp.secret, factorId: enrolled.id });
    }
    if (!(await isRepairStaff())) {
      await auth().signOut();
      return setStage({ kind: "not-staff", email });
    }
    setStage({ kind: "ready", email });
  }, []);

  useEffect(() => {
    void resolve().catch(() => setStage({ kind: "signed-out" }));
  }, [resolve]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const now = Date.now();
      if (attempts.current.until > now) {
        const seconds = Math.ceil((attempts.current.until - now) / 1000);
        throw new Error(`Too many attempts. Wait ${seconds} seconds and try again.`);
      }
      let { error } = await auth().signInWithPassword({ email: email.trim(), password });
      if (error && isUnscreenedRefusal(error.message)) {
        const screened = await screenPassword(email.trim(), password);
        if (!screened.ok) {
          throw new Error(screened.code === "PASSWORD_BREACHED" ? `${breachedMessage(screened.count)} Use "Forgot password".` : UNAVAILABLE_MESSAGE);
        }
        ({ error } = await auth().signInWithPassword({ email: email.trim(), password }));
      }
      if (error) {
        attempts.current.count += 1;
        if (attempts.current.count >= MAX_ATTEMPTS) {
          attempts.current = { count: 0, until: Date.now() + COOLDOWN_MS };
        }
        // One message for every failure, so a wrong email and a wrong
        // password cannot be told apart.
        throw new Error("That email and password did not match a NOSHASHI account.");
      }
      attempts.current = { count: 0, until: 0 };
      await resolve();
    },
    [resolve]
  );

  /** A new employee creates their account. It works only once the owner has invited the email. */
  const createAccount = useCallback(async (email: string, password: string, name: string) => {
    const problems = passwordProblems(password);
    if (problems.length) throw new Error(`The password needs: ${problems.join(", ").toLowerCase()}.`);
    if (password.length < 14) throw new Error("Staff passwords need at least 14 characters.");
    const before = await screenPassword(email.trim(), password);
    if (!before.ok) throw new Error(before.code === "PASSWORD_BREACHED" ? breachedMessage(before.count) : UNAVAILABLE_MESSAGE);
    const { error } = await auth().signUp({
      email: email.trim(),
      password,
      options: { data: name.trim() ? { display_name: name.trim() } : undefined, emailRedirectTo: "https://www.noshashi.app/auth/confirmed/" },
    });
    if (error) throw new Error(supabaseErrorMessage(error));
    await screenPassword(email.trim(), password);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await auth().resetPasswordForEmail(email.trim(), { redirectTo: "https://www.noshashi.app/auth/confirmed/" });
    if (error) throw new Error(supabaseErrorMessage(error));
  }, []);

  const verifyCode = useCallback(
    async (factorId: string, code: string) => {
      const clean = code.replace(/\s+/g, "");
      if (!/^\d{6}$/.test(clean)) throw new Error("Enter the 6-digit code from your authenticator app.");
      const { data: challenge, error: challengeError } = await auth().mfa.challenge({ factorId });
      if (challengeError || !challenge) throw new Error(supabaseErrorMessage(challengeError));
      const { error } = await auth().mfa.verify({ factorId, challengeId: challenge.id, code: clean });
      if (error) throw new Error("That code did not match. Codes change every 30 seconds; use the current one.");
      await resolve();
    },
    [resolve]
  );

  const signOut = useCallback(async (reason?: string) => {
    await auth().signOut().catch(() => undefined);
    try {
      window.sessionStorage.clear();
    } catch {
      // Nothing stored.
    }
    setStage({ kind: "signed-out" });
    return reason;
  }, []);

  return { stage, signIn, createAccount, resetPassword, verifyCode, signOut };
}
