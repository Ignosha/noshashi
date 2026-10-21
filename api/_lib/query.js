// Query parameters read with the WHATWG URL parser.
//
// Vercel's Node runtime fills req.query lazily through the legacy
// url.parse(), which logs DEP0169 on every cold start. Reading req.url
// ourselves avoids it. A plain req.query object (as tests pass) is still
// honoured; the runtime's lazy getter is never touched.
export function queryOf(req) {
  if (req.__q) return req.__q;
  const own = Object.getOwnPropertyDescriptor(req, "query");
  const out = own && "value" in own && own.value && typeof own.value === "object" ? { ...own.value } : {};
  try {
    const url = new URL(req.url || "/", "http://localhost");
    for (const [k, v] of url.searchParams) if (!(k in out)) out[k] = v;
    out.__path = url.pathname;
  } catch {}
  Object.defineProperty(req, "__q", { value: out, enumerable: false });
  return out;
}
