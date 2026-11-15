import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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
    title: "PAYMENT COMPLETE",
    blurb: "Your plan is active. Switch back to NOSHASHI — it picks up the new entitlement automatically when the window regains focus.",
    note: "A receipt is on its way to your email from Stripe.",
    tone: "#2ED684",
  },
  cancelled: {
    title: "CHECKOUT CANCELLED",
    blurb: "Nothing was charged and no plan was started. You can close this tab and carry on — the free Operator tier is unaffected.",
    note: "Changed your mind? Reopen Pricing in the app.",
    tone: "#FFB020",
  },
  billing: {
    title: "BILLING UPDATED",
    blurb: "Any change you made has been saved with Stripe. Switch back to NOSHASHI and it will re-read your subscription.",
    note: "Cancellations take effect at the end of the period you have already paid for.",
    tone: "#F5F5F7",
  },
};

const MARK = `<svg viewBox="0 0 64 64" width="56" height="56" fill="none" aria-hidden="true">
  <path fill="#F5F5F7" fill-rule="evenodd" clip-rule="evenodd" d="M32 1.5c8.4 8.6 13.1 20.6 13.1 32.2V45.6H18.9V33.7C18.9 22.1 23.6 10.1 32 1.5Zm0 13.4-5.1 3v6l5.1 3 5.1-3v-6l-5.1-3Z"/>
  <path fill="#F5F5F7" d="M18.9 30.4v17.4H7.4c-1.2 0-1.8-1.4-1-2.3l12.5-15.1Z"/>
  <path fill="#F5F5F7" d="M45.1 30.4v17.4h11.5c1.2 0 1.8-1.4 1-2.3L45.1 30.4Z"/>
  <path fill="#F5F5F7" d="M22.9 45.6h18.2l-2.7 6.8c-.35 1-1.2 1.6-2.2 1.6h-8.4c-1 0-1.85-.6-2.2-1.6l-2.7-6.8Z"/>
  <path fill="#F5F5F7" d="M32 55.4c2.9 3.2 4.3 5.9 4.3 8.2 0 1-1.1 1.4-1.8.8-1.6-1.4-3.4-1.4-5 0-.7.6-1.8.2-1.8-.8 0-2.3 1.4-5 4.3-8.2Z"/>
</svg>`;

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
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
});
