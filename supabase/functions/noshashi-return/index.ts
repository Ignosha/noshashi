import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { MARK as EMBLEM } from "../../../api/_lib/brand-mark.js";

/**
 * noshashi-return — the page Stripe sends the browser back to.
 *
 * A desktop app has no website, but Stripe requires a real https URL for
 * success_url, cancel_url and the portal return_url. Rather than parking
 * those on a domain that does not exist yet — which would drop a paying
 * customer on a dead page at the most fragile moment of the funnel —
 * they land here, on infrastructure the project already owns.
 *
 * JWT verification is off because Stripe redirects a browser here with no
 * session. Nothing sensitive is served: the page reads only the path and
 * renders static markup. The session id Stripe appends is deliberately
 * never echoed into the HTML.
 *
 * Swap NOSHASHI_SITE_URL for a real domain whenever one exists; nothing
 * else has to change.
 */

type View = { title: string; blurb: string; note: string; tone: string };

const VIEWS: Record<string, View> = {
  success: {
    title: "CHECKOUT RETURNED",
    blurb: "Return to NOSHASHI to check your current plan. Access changes only after verified billing events are saved.",
    note: "Returning to this page does not confirm payment or activate a plan.",
    tone: "#2ED684",
  },
  cancelled: {
    title: "CHECKOUT CANCELLED",
    blurb: "Checkout was closed. Check your Stripe receipt or signed-in billing portal for payment and subscription status.",
    note: "Changed your mind? Reopen Pricing in the app.",
    tone: "#FFB020",
  },
  billing: {
    title: "BILLING RETURN",
    blurb: "Return to NOSHASHI or the signed-in billing portal to review your current subscription. This page does not confirm a change.",
    note: "The effective date of a subscription change is shown in your billing records.",
    tone: "#F5F5F7",
  },
};

const MARK = EMBLEM.replace('width="26" height="26"', 'width="56" height="56"');

function page(view: View): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="dark">
<title>NOSHASHI &middot; ${view.title}</title>
<style>
  :root{--ground:#000}
  *{box-sizing:border-box}
  html,body{height:100%}
  body{
    margin:0;background:#000;color:#F5F5F7;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Helvetica,Arial,sans-serif;
    display:grid;place-items:center;padding:24px;
    -webkit-font-smoothing:antialiased;
  }
  .frame{
    position:fixed;inset:18px;border:1px solid rgba(245,245,247,.10);
    pointer-events:none;
  }
  .tick{position:fixed;width:14px;height:14px;border-color:rgba(245,245,247,.55);pointer-events:none}
  .tl{top:18px;left:18px;border-top:1px solid;border-left:1px solid}
  .tr{top:18px;right:18px;border-top:1px solid;border-right:1px solid}
  .bl{bottom:18px;left:18px;border-bottom:1px solid;border-left:1px solid}
  .br{bottom:18px;right:18px;border-bottom:1px solid;border-right:1px solid}
  main{max-width:460px;text-align:center;position:relative}
  .status{
    display:inline-flex;align-items:center;gap:8px;
    border:1px solid rgba(245,245,247,.16);padding:5px 11px;margin:22px 0 20px;
    font-size:10px;letter-spacing:.24em;color:#8A8A99;
  }
  .dot{width:6px;height:6px;border-radius:50%;background:${view.tone}}
  h1{
    font-size:26px;line-height:1.2;letter-spacing:.09em;margin:0 0 14px;
    font-weight:800;
  }
  p{font-size:14px;line-height:1.65;color:#B9B9C6;margin:0 0 14px}
  .note{font-size:12px;color:#6E6E7E;margin-top:22px}
  .rule{height:1px;background:rgba(245,245,247,.12);margin:26px 0}
  footer{margin-top:30px;font-size:11px;color:#55555F;letter-spacing:.06em}
  a{color:#B9B9C6}
</style>
</head>
<body>
  <div class="frame"></div>
  <span class="tick tl"></span><span class="tick tr"></span>
  <span class="tick bl"></span><span class="tick br"></span>
  <main>
    ${MARK}
    <div class="status"><span class="dot"></span>NOSHASHI</div>
    <h1>${view.title}</h1>
    <p>${view.blurb}</p>
    <div class="rule"></div>
    <p class="note">${view.note}</p>
    <footer>You can close this tab.</footer>
  </main>
</body>
</html>`;
}

Deno.serve((request: Request) => {
  const path = new URL(request.url).pathname.toLowerCase();

  const view = path.includes("success")
    ? VIEWS.success
    : path.includes("cancel")
      ? VIEWS.cancelled
      : VIEWS.billing;

  return new Response(page(view), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
});
