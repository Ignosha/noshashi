import { supabase, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase/client";
import { FUNCTIONS_URL } from "@/lib/supabase/project";
export async function terminalApi<T>(
  path: string,
  signal: AbortSignal,
  method = "GET",
  body?: unknown,
  key?: string,
): Promise<T> {
  const { data } = await supabase().auth.getSession();
  const session = data.session;
  if (!session) throw new Error("Sign in to continue.");
  const response = await fetch(`${FUNCTIONS_URL}/noshashi-terminal/${path}`, {
    method,
    signal,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: SUPABASE_PUBLISHABLE_KEY,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const value = await response.json();
  const current = await supabase().auth.getSession();
  if (signal.aborted || current.data.session?.user.id !== session.user.id)
    throw new Error("Account or workspace changed. Load again.");
  if (!response.ok)
    throw new Error(value.error ?? "Private service unavailable.");
  return value;
}
