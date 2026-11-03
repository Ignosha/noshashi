/** RFC 4180 input. Values remain strings; no floating-point money. */
export function importPayments(text: string, kind: "json" | "csv") {
  if (new TextEncoder().encode(text).length > 65536)
    throw new Error("Choose a file smaller than 64 KB.");
  if (kind === "json") {
    const parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.rows))
      throw new Error("JSON must contain a rows array.");
    return parsed;
  }
  const table: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (ch === "," || ch === "\n" || ch === "\r")) {
      row.push(value);
      value = "";
      if (ch !== ",") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        if (row.some(Boolean)) table.push(row);
        row = [];
      }
    } else value += ch;
  }
  if (quoted) throw new Error("CSV has an unclosed quote.");
  row.push(value);
  if (row.some(Boolean)) table.push(row);
  const header = table.shift()?.map((x) => x.replace(/^\uFEFF/, "").trim());
  const required = [
    "hash",
    "invoice_id",
    "destination",
    "expected_amount",
    "currency",
  ];
  if (
    !header ||
    required.some((x) => !header.includes(x)) ||
    new Set(header).size !== header.length
  )
    throw new Error(
      "CSV needs unique hash, invoice_id, destination, expected_amount and currency columns.",
    );
  return {
    rows: table.map((r, i) => {
      if (r.length !== header.length)
        throw new Error(`CSV row ${i + 2} has the wrong number of columns.`);
      const p = Object.fromEntries(header.map((k, n) => [k, r[n].trim()]));
      if (p.destination_tag && !/^\d+$/.test(p.destination_tag))
        throw new Error("Destination tags must be whole numbers.");
      return {
        hash: p.hash,
        invoice: {
          invoice_id: p.invoice_id,
          destination: p.destination,
          destination_tag: p.destination_tag ? Number(p.destination_tag) : null,
          expected_amount: p.expected_amount,
          asset:
            p.currency === "XRP"
              ? { kind: "xrp" }
              : {
                  kind: "issued",
                  currency: p.currency,
                  issuer: p.issuer ?? "",
                },
        },
      };
    }),
  };
}
export const TEMPLATE =
  "hash,invoice_id,destination,expected_amount,currency,issuer,destination_tag\r\n";
