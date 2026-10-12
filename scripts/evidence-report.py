#!/usr/bin/env python3
"""
NOSHASHI issuer evidence report: one PDF, read live from validated XRP Ledger state.

For an auditor, a treasury team or an issuer's own board: what authority the
issuer has kept over its token, the raw account fields that prove it, and how
much of the XRP order book could actually fill against what it advertises,
all at stated ledger indexes, with the certificate digest anyone can recheck.

    python3 scripts/evidence-report.py --issuer rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B \
        --currency USD --prepared-for "Example Treasury LLC" --out report.pdf

Every figure comes from the public NOSHASHI endpoints, which read the public
XRPL servers:

    /api/authority?issuer=&walk=1   the authority certificate, holder walk included
    /api/issuer-state?issuer=       the AccountRoot and signer list, as returned
    /api/book?currency=&issuer=     quoted against fillable depth, with disclosures

Nothing is estimated or filled in. A section whose source could not be read
says so in the report instead of being left out or guessed. Save the JSON with
--save-json to keep the exact inputs next to the PDF.

Requires: Python 3.9+, reportlab (pip install reportlab). No API key.
"""

import argparse
import datetime as dt
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (KeepTogether, PageBreak, Paragraph, SimpleDocTemplate,
                                Spacer, Table, TableStyle)

SITE = "https://www.noshashi.app"
INK = colors.HexColor("#1d1f1c")
MUTE = colors.HexColor("#5f655c")
RULE = colors.HexColor("#dcd9d0")
GO = colors.HexColor("#2f7a4b")
HOLD = colors.HexColor("#9a6a12")
NOGO = colors.HexColor("#a23b2e")

VERDICT_COPY = {
    "go": ("No unilateral authority found",
           "On the checks run, no single party was found able to freeze, gate or unilaterally sign for this "
           "issuance at this ledger. This describes the authority observed, not the conduct of whoever holds it."),
    "hold": ("Authority retained, constrained",
             "No single party can act alone, but the issuer has kept powers that bear on a holder: a freeze it "
             "has not surrendered, a fee it sets, or a supply too concentrated or too unreadable to call dispersed."),
    "no-go": ("Unilateral authority present",
              "A single party can act on this issuance without anyone's agreement, or the issuance could not be "
              "read well enough to say otherwise. Either way a holder's balance is not solely in the holder's control."),
    "insufficient-data": ("Not established",
                          "A source needed to reach a conclusion could not be read at this ledger. This is a statement "
                          "about the reading, not about the issuer: it is not a clearance and it is not an allegation."),
}


def get(path, params, timeout=90):
    url = f"{SITE}{path}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "noshashi-evidence-report/1"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return {"ok": True, "url": url, "body": json.loads(response.read().decode("utf-8"))}
    except urllib.error.HTTPError as error:
        try:
            body = json.loads(error.read().decode("utf-8"))
        except Exception:
            body = {}
        return {"ok": False, "url": url, "error": body.get("error") or f"HTTP {error.code}"}
    except Exception as error:  # network, timeout, bad JSON
        return {"ok": False, "url": url, "error": str(error)}


def display_currency(code):
    """A 40-hex currency code as its ticker, when it decodes to printable text."""
    code = str(code or "")
    if len(code) == 40 and all(c in "0123456789ABCDEFabcdef" for c in code):
        text = bytes.fromhex(code).rstrip(b"\x00").decode("ascii", "replace")
        if text and all(32 <= ord(c) < 127 for c in text) and text.upper() != "XRP":
            return text
    return code


def domain_text(hex_value):
    """The Domain field decoded, with the raw hex kept beside it."""
    if not hex_value:
        return "none"
    try:
        text = bytes.fromhex(hex_value).decode("ascii")
        if all(32 <= ord(c) < 127 for c in text):
            return f"{text} (hex {hex_value})"
    except ValueError:
        pass
    return f"hex {hex_value} (not printable text)"


def esc(value):
    return (str(value if value is not None else "")
            .replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def num(value, places=2):
    if value is None:
        return "n/a"
    try:
        return f"{float(value):,.{places}f}"
    except (TypeError, ValueError):
        return esc(value)


def pct(value):
    return "n/a" if value is None else f"{float(value) * 100:.1f}%"


def styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("t", parent=base["Title"], fontName="Helvetica-Bold", fontSize=20, leading=24,
                                textColor=INK, alignment=TA_LEFT, spaceAfter=6),
        "h": ParagraphStyle("h", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=12.5, leading=16,
                            textColor=INK, spaceBefore=12, spaceAfter=6),
        "p": ParagraphStyle("p", parent=base["BodyText"], fontName="Helvetica", fontSize=9.5, leading=13.5, textColor=INK),
        "small": ParagraphStyle("s", parent=base["BodyText"], fontName="Helvetica", fontSize=8, leading=11, textColor=MUTE),
        "mono": ParagraphStyle("m", parent=base["BodyText"], fontName="Courier", fontSize=8, leading=10.5, textColor=INK),
        "cell": ParagraphStyle("c", parent=base["BodyText"], fontName="Helvetica", fontSize=8.5, leading=11, textColor=INK),
    }


def table(rows, widths, header=True):
    t = Table(rows, colWidths=widths, repeatRows=1 if header else 0)
    style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, RULE),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    if header:
        style += [("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, 0), 8.5),
                  ("TEXTCOLOR", (0, 0), (-1, 0), MUTE), ("LINEBELOW", (0, 0), (-1, 0), 0.8, INK)]
    t.setStyle(TableStyle(style))
    return t


def footer(prepared_at):
    def draw(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(MUTE)
        canvas.drawString(18 * mm, 10 * mm, f"NOSHASHI issuer evidence report · read {prepared_at} · ledger facts, not a score or a legal finding")
        canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Page {doc.page}")
        canvas.restoreState()
    return draw


def unavailable(s, what, result):
    return Paragraph(f"<b>Not available.</b> {esc(what)} could not be read for this report "
                     f"({esc(result.get('error'))}). Nothing in this section is estimated; re-run the report to "
                     f"include it.", s["p"])


def build(args):
    s = styles()
    prepared_at = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    if args.from_json:
        # Inputs saved earlier with --save-json (or fetched another way): render
        # exactly what was read then, under the time it was read.
        with open(args.from_json, encoding="utf-8") as fh:
            saved = json.load(fh)
        prepared_at = saved.get("prepared_at", prepared_at)
        cert, state, book = saved["authority"], saved["issuer_state"], saved.get("book")
        currency = args.currency or (cert["body"].get("currency") if cert["ok"] else None)
    else:
        print("reading authority certificate (holder walk; this can take up to a minute)…", file=sys.stderr)
        cert = get("/api/authority", {"issuer": args.issuer, "walk": "1"})
        print("reading issuer state…", file=sys.stderr)
        state = get("/api/issuer-state", {"issuer": args.issuer})
        currency = args.currency or (cert["body"].get("currency") if cert["ok"] else None)
        book = None
        if currency:
            print(f"reading XRP/{currency} order book…", file=sys.stderr)
            book = get("/api/book", {"currency": currency, "issuer": args.issuer})

    if args.save_json:
        with open(args.save_json, "w", encoding="utf-8") as fh:
            json.dump({"prepared_at": prepared_at, "authority": cert, "issuer_state": state, "book": book}, fh, indent=2)

    story = []
    story.append(Paragraph("Issuer evidence report", s["title"]))
    label = cert["body"].get("currencyLabel") if cert["ok"] else None
    story.append(Paragraph(f"<font name='Courier'>{esc(args.issuer)}</font>"
                           + (f" · {esc(label)}" if label else (f" · {esc(currency)}" if currency else "")), s["p"]))
    story.append(Spacer(1, 4))
    meta = [["Prepared for", esc(args.prepared_for or "—")],
            ["Prepared", prepared_at],
            ["Certificate ledger", esc(cert["body"].get("ledgerIndex")) if cert["ok"] else "not read"],
            ["Order book ledger", esc(book["body"].get("ledger_index")) if book and book["ok"] else "not read"],
            ["Method", "Read live from validated XRP Ledger state via the public NOSHASHI endpoints"]]
    story.append(table([[Paragraph(f"<b>{a}</b>", s["cell"]), Paragraph(b, s["cell"])] for a, b in meta],
                       [42 * mm, 128 * mm], header=False))

    # ── 1. Authority ─────────────────────────────────────────────────
    story.append(Paragraph("1. Authority the issuer has kept", s["h"]))
    if not cert["ok"]:
        story.append(unavailable(s, "The authority certificate", cert))
    else:
        c = cert["body"]
        tag, text = VERDICT_COPY.get(c.get("verdict"), VERDICT_COPY["insufficient-data"])
        colour = {"go": GO, "hold": HOLD, "no-go": NOGO}.get(c.get("verdict"), MUTE)
        story.append(Paragraph(f"<font color='{colour.hexval()}'><b>{esc(tag.upper())}</b></font>", s["p"]))
        story.append(Paragraph(esc(text), s["p"]))
        story.append(Spacer(1, 6))
        rows = [["Result", "Check", "What the ledger shows"]]
        for check in c.get("checks", []):
            state_ = check.get("state")
            word = ("NO ANSWER" if state_ == "INSUFFICIENT_DATA" else "DOES NOT APPLY" if state_ == "NOT_APPLICABLE"
                    else "CLEAR" if check.get("passed") else "FINDING")
            col = MUTE if state_ else GO if check.get("passed") else (NOGO if check.get("severity") == "block" else HOLD)
            rows.append([Paragraph(f"<font color='{col.hexval()}'><b>{word}</b></font>", s["cell"]),
                         Paragraph(f"<b>{esc(check.get('label'))}</b><br/><font size='7' color='#5f655c'>{esc(check.get('id'))}</font>", s["cell"]),
                         Paragraph(esc(check.get("detail")), s["cell"])])
        story.append(table(rows, [24 * mm, 46 * mm, 100 * mm]))
        story.append(Spacer(1, 6))
        story.append(Paragraph(f"<b>Certificate digest</b> (SHA-256, rules v{esc(c.get('rulesVersion'))}, "
                               f"distribution source: {esc(c.get('source'))})", s["small"]))
        story.append(Paragraph(esc(c.get("digest")), s["mono"]))
        story.append(Paragraph("Anyone can confirm the digest belongs to this exact reading: POST the certificate body to "
                               "https://xiurbiwuwcfowqnpmwki.supabase.co/functions/v1/noshashi-verify/authority/check "
                               "(free, no key), or recompute it from the published canonical form.", s["small"]))

    # ── 2. Raw state ─────────────────────────────────────────────────
    story.append(Paragraph("2. The account fields behind it", s["h"]))
    if not state["ok"]:
        story.append(unavailable(s, "The issuer's account state", state))
    else:
        result = state["body"].get("result", {})
        data = result.get("account_data", {})
        flags = int(data.get("Flags", 0)) & 0xFFFFFFFF
        lists = result.get("signer_lists", data.get("signer_lists")) or []
        bits = [("lsfRequireAuth", 0x00040000), ("lsfDisableMaster", 0x00100000), ("lsfNoFreeze", 0x00200000),
                ("lsfGlobalFreeze", 0x00400000), ("lsfDefaultRipple", 0x00800000), ("lsfAllowTrustLineClawback", 0x80000000)]
        rows = [["Field", "Value at ledger " + esc(result.get("ledger_index", ""))],
                ["Flags", f"{flags} (0x{flags:08X})"]]
        rows += [[name, "set" if flags & bit else "clear"] for name, bit in bits]
        rows += [["RegularKey", esc(data.get("RegularKey", "none"))],
                 ["TransferRate", esc(data.get("TransferRate", "not set (0%)"))],
                 ["Domain", esc(domain_text(data.get("Domain")))],
                 ["Signer list", (f"quorum {lists[0].get('SignerQuorum')} of {len(lists[0].get('SignerEntries', []))}"
                                  if lists else "none")]]
        story.append(table([[Paragraph(a, s["cell"]), Paragraph(str(b), s["mono"])] for a, b in rows],
                           [60 * mm, 110 * mm]))
        story.append(Paragraph(f"Source: {esc(state['url'])}, account_info at the validated ledger, read "
                               f"{esc(state['body'].get('read_at'))}.", s["small"]))

    # ── 3. Depth ─────────────────────────────────────────────────────
    story.append(Paragraph("3. What the order book quotes against what can fill", s["h"]))
    if not currency:
        story.append(Paragraph("No currency was given and the certificate did not name one, so no book was read. "
                               "Re-run with --currency.", s["p"]))
    elif not book["ok"]:
        story.append(unavailable(s, f"The XRP/{currency} order book", book))
    else:
        b = book["body"]
        rows = [["", "Bid side (buying it for XRP)", "Ask side (selling it for XRP)"],
                ["Quoted", num(b["quoted"]["bid"]), num(b["quoted"]["ask"])],
                ["Fillable", num(b["fillable"]["bid"]), num(b["fillable"]["ask"])],
                ["Fillable share", pct(b["fillable_ratio"]["bid"]), pct(b["fillable_ratio"]["ask"])],
                ["Offers read", esc(b["offers_read"]["bids"]), esc(b["offers_read"]["asks"])]]
        story.append(table([[Paragraph(str(x), s["cell"]) for x in r] for r in rows], [40 * mm, 65 * mm, 65 * mm]))
        ref = b.get("reference", {})
        name = b.get("currency_label") or display_currency(b.get("currency"))
        story.append(Paragraph(f"Quantities in {esc(name)}. Reference mid {num(ref.get('mid'), 6)} XRP per "
                               f"{esc(name)} at ledger {esc(b.get('ledger_index'))}"
                               + (" (the raw touch was crossed and was not used)." if ref.get("touch_crossed") else "."), s["small"]))
        story.append(Spacer(1, 4))
        story.append(Paragraph("<b>Disclosures</b>", s["small"]))
        for d in b.get("disclosures", []):
            story.append(Paragraph("· " + esc(d), s["small"]))

    # ── 4. Limits ────────────────────────────────────────────────────
    story.append(KeepTogether([
        Paragraph("4. What this report is and is not", s["h"]),
        Paragraph("It records ledger facts at the ledger indexes stated, read from validated state on public XRPL "
                  "servers. It is not a score, not an audit opinion, not investment advice and not a determination "
                  "that any asset is or is not decentralised, a security, or compliant with any statute. A fact that "
                  "could not be read is reported as not read. It is never reported as a pass. The ledger can change at "
                  "the next ledger close; a later reading is a different reading.", s["p"]),
        Spacer(1, 6),
        Paragraph(f"Every input is reproducible: {esc(SITE)}/certificate/?issuer={esc(args.issuer)}", s["small"]),
    ]))

    doc = SimpleDocTemplate(args.out, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                            topMargin=18 * mm, bottomMargin=18 * mm,
                            title=f"NOSHASHI issuer evidence report {args.issuer}", author="NOSHASHI",
                            subject="XRPL issuer authority and order-book evidence")
    doc.build(story, onFirstPage=footer(prepared_at), onLaterPages=footer(prepared_at))
    missing = [name for name, r in (("authority", cert), ("issuer state", state), ("book", book)) if r is not None and not r["ok"]]
    print(f"wrote {args.out}" + (f" (NOT READ: {', '.join(missing)})" if missing else ""), file=sys.stderr)
    return 1 if missing else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--issuer", required=True, help="the issuing account, r…")
    parser.add_argument("--currency", help="currency for the order book (default: the certificate's primary currency)")
    parser.add_argument("--prepared-for", help="client name printed on the report")
    parser.add_argument("--out", default="noshashi-evidence-report.pdf")
    parser.add_argument("--save-json", help="also write the exact inputs to this JSON file")
    parser.add_argument("--from-json", help="render from inputs saved earlier with --save-json instead of reading live")
    args = parser.parse_args()
    import re
    if not re.fullmatch(r"r[1-9A-HJ-NP-Za-km-z]{24,34}", args.issuer):
        parser.error("--issuer must be an XRPL classic address (r…)")
    sys.exit(build(args))


if __name__ == "__main__":
    main()
