import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { handle } from "./handler.ts";
import { billingAction } from "./billing.ts";

Deno.serve(async (request) => {
  const url = Deno.env.get("SUPABASE_URL"),
    service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !service || !anon)
    return new Response(
      JSON.stringify({ error: "Private account service is not configured." }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      },
    );
  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return handle(request, {
    admin,
    user: async (token) => {
      const client = createClient(url, anon, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user) return null;
      const { data: aal, error: aalError } =
        await client.auth.mfa.getAuthenticatorAssuranceLevel(token);
      if (aalError || !aal) return null;
      return {
        id: data.user.id,
        mfaRequired: aal.nextLevel === "aal2" && aal.currentLevel !== "aal2",
      };
    },
    billing: (action, id, cadence) => billingAction(admin, action, id, cadence),
  });
});
