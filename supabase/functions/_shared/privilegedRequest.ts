import { boundedText, PayloadError } from "./httpLimits.ts";

/** Shared controls for policy activation and exception decisions.
 * No actor, role, assurance level or trace identifier comes from request data.
 */
export class PrivilegedRequestError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}
type Auth = {
  getUser: (token: string) => Promise<{
    data: { user: { id: string } | null };
    error: unknown;
  }>;
  mfa: {
    getAuthenticatorAssuranceLevel: (token: string) => Promise<{
      data: { currentLevel: string | null; nextLevel: string | null } | null;
      error: unknown;
    }>;
  };
};

/** Validate the server session first, then require enrolled MFA to be satisfied.
 * Auth outages and indeterminate assurance never authorize a privileged write.
 */
export async function privilegedIdentity(
  auth: Auth,
  request: Request,
): Promise<string> {
  const token = request.headers.get("Authorization")?.match(/^Bearer (\S+)$/i)
    ?.[1];
  if (!token) {
    throw new PrivilegedRequestError(
      401,
      "NOT_AUTHENTICATED",
      "Sign in again before changing a policy or exception.",
    );
  }
  const { data, error } = await auth.getUser(token);
  if (error || !data.user) {
    throw new PrivilegedRequestError(
      401,
      "NOT_AUTHENTICATED",
      "Sign in again before changing a policy or exception.",
    );
  }
  const { data: assurance, error: assuranceError } = await auth.mfa
    .getAuthenticatorAssuranceLevel(token);
  if (
    assuranceError || !assurance ||
    !["aal1", "aal2"].includes(assurance.currentLevel ?? "") ||
    !["aal1", "aal2"].includes(assurance.nextLevel ?? "")
  ) {
    throw new PrivilegedRequestError(
      503,
      "AUTHORIZATION_UNAVAILABLE",
      "Session assurance could not be verified. Nothing was changed.",
    );
  }
  if (assurance.nextLevel === "aal2" && assurance.currentLevel !== "aal2") {
    throw new PrivilegedRequestError(
      403,
      "MFA_REQUIRED",
      "Complete your second-factor check before changing a policy or exception.",
    );
  }
  return data.user.id;
}

/** Count actual UTF-8 bytes, never trust Content-Length. Authenticate before use. */
export async function privilegedObject(
  request: Request,
  limit = 32768,
): Promise<Record<string, unknown>> {
  try {
    const result = JSON.parse(await boundedText(request, limit));
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      throw new Error();
    }
    return result;
  } catch (error) {
    if (error instanceof PayloadError) {
      throw new PrivilegedRequestError(
        error.status,
        error.code,
        error.message + " Nothing was changed.",
      );
    }
    throw new PrivilegedRequestError(
      400,
      "BAD_REQUEST",
      "Provide a valid JSON object. Nothing was changed.",
    );
  }
}

/** Bound each Auth/database call; do not retry privileged mutations here. */
export function privilegedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const signal = init?.signal ??
    (input instanceof Request ? input.signal : null);
  return fetch(input, {
    ...init,
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
  });
}
