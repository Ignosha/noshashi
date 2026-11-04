import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

// Called only AFTER Stripe signature verification. Customer IDs follow the
// Stripe charge object graph; external message text never grants access.
export async function reviewBillingRisk(
  db: ReturnType<SupabaseClient["schema"]>,
  event: {
    id: string;
    type: string;
    data: { object: Record<string, unknown> };
  },
  loadCharge: (id: string) => Promise<Record<string, unknown>>,
) {
  if (
    ![
      "charge.dispute.created",
      "charge.refunded",
      "radar.early_fraud_warning.created",
    ].includes(event.type)
  )
    return false;
  const object = event.data.object;
  const charge =
    event.type === "charge.refunded"
      ? object
      : typeof object.charge === "object" && object.charge !== null
        ? (object.charge as Record<string, unknown>)
        : await loadCharge(String(object.charge ?? ""));
  const customer =
    typeof charge.customer === "string"
      ? charge.customer
      : (charge.customer as { id?: string } | null)?.id;
  if (!customer) return true; // A charge without a customer cannot fund a portal subscription.
  const { error } = await db
    .from("payment_review_billing_holds")
    .upsert(
      { event_id: event.id, stripe_customer_id: customer, reason: event.type },
      { onConflict: "event_id", ignoreDuplicates: true },
    );
  if (error) throw new Error("Could not persist billing review hold.");
  return true;
}
