import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";

/**
 * Authentication.
 *
 * Passwords are never handled by this application beyond passing them
 * straight to Supabase Auth, which hashes them with bcrypt server-side.
 * Second factors are real TOTP enrolments and real email one-time codes
 * — nothing here is a hand-rolled crypto primitive, deliberately.
 */

export type MfaFactor = {
  id: string;
  friendlyName: string;
  status: "verified" | "unverified";
};

export type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** True once a second factor exists and has been satisfied this session. */
  mfaSatisfied: boolean;
  mfaRequired: boolean;
  factors: MfaFactor[];
};

type AuthApi = AuthState & {
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ mfaRequired: boolean }>;
  signInWithOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, token: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  enrollTotp: () => Promise<{ factorId: string; qrCode: string; secret: string }>;
  confirmTotp: (factorId: string, code: string) => Promise<void>;
  challengeTotp: (factorId: string, code: string) => Promise<void>;
  unenrollFactor: (factorId: string) => Promise<void>;
  refreshFactors: () => Promise<void>;
};

const AuthContext = createContext<AuthApi | null>(null);

/** Minimum we will accept before Supabase ever sees the password. */
export function passwordProblems(password: string): string[] {
  const problems: string[] = [];
  if (password.length < 12) problems.push("At least 12 characters");
  if (!/[a-z]/.test(password)) problems.push("A lowercase letter");
  if (!/[A-Z]/.test(password)) problems.push("An uppercase letter");
  if (!/[0-9]/.test(password)) problems.push("A digit");
  if (!/[^A-Za-z0-9]/.test(password)) problems.push("A symbol");
  return problems;
}

/** Rough strength score, 0–4, for the meter next to the field. */
export function passwordScore(password: string): number {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1;
  return Math.min(4, score);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [factors, setFactors] = useState<MfaFactor[]>([]);
  const [mfaSatisfied, setMfaSatisfied] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);

  const readAssuranceLevel = useCallback(async () => {
    const { data } = await supabase().auth.mfa.getAuthenticatorAssuranceLevel();
    if (!data) return;
    // aal2 means a second factor was actually presented this session.
    setMfaSatisfied(data.currentLevel === "aal2");
    setMfaRequired(data.nextLevel === "aal2" && data.currentLevel !== "aal2");
  }, []);

  const refreshFactors = useCallback(async () => {
    const { data } = await supabase().auth.mfa.listFactors();
    const totp = (data?.totp ?? []).map((factor) => ({
      id: factor.id,
      friendlyName: factor.friendly_name ?? "Authenticator",
      status: factor.status as "verified" | "unverified",
    }));
    setFactors(totp);
    await readAssuranceLevel();
  }, [readAssuranceLevel]);

  useEffect(() => {
    let active = true;

    void supabase()
      .auth.getSession()
      .then(async ({ data }) => {
        if (!active) return;
        setSession(data.session);
        if (data.session) await refreshFactors();
        setLoading(false);
      });

    const { data: subscription } = supabase().auth.onAuthStateChange(
      (_event, next) => {
        setSession(next);
        if (next) {
          void refreshFactors();
        } else {
          setFactors([]);
          setMfaSatisfied(false);
          setMfaRequired(false);
        }
      }
    );

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [refreshFactors]);

  const signUp = useCallback(
    async (email: string, password: string, displayName?: string) => {
      const problems = passwordProblems(password);
      if (problems.length > 0) {
        throw new Error(`Password needs: ${problems.join(", ").toLowerCase()}.`);
      }
      const { error } = await supabase().auth.signUp({
        email,
        password,
        options: { data: displayName ? { display_name: displayName } : undefined },
      });
      if (error) throw new Error(error.message);
    },
    []
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase().auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
      const { data } = await supabase().auth.mfa.getAuthenticatorAssuranceLevel();
      const needsSecondFactor =
        data?.nextLevel === "aal2" && data?.currentLevel !== "aal2";
      setMfaRequired(Boolean(needsSecondFactor));
      return { mfaRequired: Boolean(needsSecondFactor) };
    },
    []
  );

  const signInWithOtp = useCallback(async (email: string) => {
    const { error } = await supabase().auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    if (error) throw new Error(error.message);
  }, []);

  const verifyOtp = useCallback(async (email: string, token: string) => {
    const { error } = await supabase().auth.verifyOtp({
      email,
      token: token.trim(),
      type: "email",
    });
    if (error) throw new Error(error.message);
  }, []);

  const signOut = useCallback(async () => {
    await supabase().auth.signOut();
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase().auth.resetPasswordForEmail(email);
    if (error) throw new Error(error.message);
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const problems = passwordProblems(password);
    if (problems.length > 0) {
      throw new Error(`Password needs: ${problems.join(", ").toLowerCase()}.`);
    }
    const { error } = await supabase().auth.updateUser({ password });
    if (error) throw new Error(error.message);
  }, []);

  const enrollTotp = useCallback(async () => {
    const { data, error } = await supabase().auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `NOSHASHI ${new Date().toISOString().slice(0, 10)}`,
    });
    if (error) throw new Error(error.message);
    return {
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    };
  }, []);

  const confirmTotp = useCallback(
    async (factorId: string, code: string) => {
      const { data: challenge, error: challengeError } =
        await supabase().auth.mfa.challenge({ factorId });
      if (challengeError) throw new Error(challengeError.message);

      const { error } = await supabase().auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (error) throw new Error(error.message);
      await refreshFactors();
    },
    [refreshFactors]
  );

  const challengeTotp = useCallback(
    async (factorId: string, code: string) => {
      const { data: challenge, error: challengeError } =
        await supabase().auth.mfa.challenge({ factorId });
      if (challengeError) throw new Error(challengeError.message);

      const { error } = await supabase().auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (error) throw new Error(error.message);
      setMfaRequired(false);
      await refreshFactors();
    },
    [refreshFactors]
  );

  const unenrollFactor = useCallback(
    async (factorId: string) => {
      const { error } = await supabase().auth.mfa.unenroll({ factorId });
      if (error) throw new Error(error.message);
      await refreshFactors();
    },
    [refreshFactors]
  );

  const value = useMemo<AuthApi>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      factors,
      mfaSatisfied,
      mfaRequired,
      signUp,
      signIn,
      signInWithOtp,
      verifyOtp,
      signOut,
      resetPassword,
      updatePassword,
      enrollTotp,
      confirmTotp,
      challengeTotp,
      unenrollFactor,
      refreshFactors,
    }),
    [
      session,
      loading,
      factors,
      mfaSatisfied,
      mfaRequired,
      signUp,
      signIn,
      signInWithOtp,
      verifyOtp,
      signOut,
      resetPassword,
      updatePassword,
      enrollTotp,
      confirmTotp,
      challengeTotp,
      unenrollFactor,
      refreshFactors,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}
