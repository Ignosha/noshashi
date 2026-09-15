const PRO_PRICE_ID = "price_1U6U1eGSxPXLjUKIGnORqp43";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return res.status(503).json({ error: "Checkout is not configured yet." });
  }

  const origin = process.env.PUBLIC_SITE_URL || `https://${req.headers.host}`;
  const form = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": PRO_PRICE_ID,
    "line_items[0][quantity]": "1",
    success_url: `${origin}/billing/success/?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/billing/cancelled/`,
    billing_address_collection: "auto",
    "allow_promotion_codes": "true",
  });

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });

  const session = await response.json();
  if (!response.ok || !session.url) {
    return res.status(502).json({ error: "Stripe could not create checkout." });
  }

  return res.redirect(303, session.url);
}
