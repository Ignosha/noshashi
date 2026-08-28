#!/usr/bin/env python3
"""
NOSHASHI — Infrastructure Briefing.

Renders the briefing PDF in the application's own design language: the
brand-board palette, Space Grotesk and IBM Plex Mono, soft-cornered panels
and the section-07 orbital geometry.

Every figure in this document is either read from validated XRPL mainnet
state or measured directly. Nothing is illustrative. Where a capability
does not exist — macro and sentiment feeds — the document says so rather
than filling the slot.

Usage:  python3 docs/build_briefing.py [out.pdf]
Fonts:  expects the four TTFs in FONT_DIR (see below).
"""
from __future__ import annotations

import os
import sys
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

# ── Palette — brand board, section 05 ────────────────────────────────
GROUND = (0x0B / 255, 0x0F / 255, 0x14 / 255)
SURFACE = (0x11 / 255, 0x16 / 255, 0x1D / 255)
ELEVATED = (0x1C / 255, 0x23 / 255, 0x30 / 255)
INK = (0xE6 / 255, 0xE8 / 255, 0xEB / 255)
MUTED = (0xA3 / 255, 0xA8 / 255, 0xB3 / 255)
FAINT = (0x74 / 255, 0x7C / 255, 0x8B / 255)
RULE = (0x2A / 255, 0x31 / 255, 0x3C / 255)
BRAND = (0x3A / 255, 0x82 / 255, 0xF6 / 255)
TELE = (0x00 / 255, 0xE0 / 255, 0xC6 / 255)
GO = (0x35 / 255, 0xD4 / 255, 0x9A / 255)
HOLD = (0xF5 / 255, 0xB9 / 255, 0x42 / 255)
NOGO = (0xFF / 255, 0x5F / 255, 0x6D / 255)

PAGE_W, PAGE_H = A4
M = 18 * mm                      # margin
COL = PAGE_W - 2 * M

HERE = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = os.environ.get("NOSHASHI_PDF_FONTS", os.path.join(HERE, "fonts"))
MARK = os.environ.get("NOSHASHI_PDF_MARK", os.path.join(FONT_DIR, "mark.png"))

DISPLAY, DISPLAY_B, MONO, MONO_M = "SG", "SGB", "PM", "PMM"


def register_fonts() -> None:
    faces = {
        DISPLAY: "SpaceGrotesk-Medium.ttf",
        DISPLAY_B: "SpaceGrotesk-Bold.ttf",
        MONO: "PlexMono-Regular.ttf",
        MONO_M: "PlexMono-Medium.ttf",
    }
    for name, filename in faces.items():
        path = os.path.join(FONT_DIR, filename)
        if not os.path.exists(path):
            raise SystemExit(
                f"missing font: {path}\n"
                "Set NOSHASHI_PDF_FONTS to the directory holding the four TTFs."
            )
        pdfmetrics.registerFont(TTFont(name, path))


class Sheet:
    """A page canvas that knows the house style."""

    def __init__(self, path: str):
        self.c = canvas.Canvas(path, pagesize=A4)
        # Compress page content streams. The document is text-heavy, so
        # this is a large win for a file that has to travel over the wire.
        self.c.setPageCompression(1)
        self.c.setTitle("NOSHASHI — Infrastructure Briefing")
        self.c.setAuthor("NOSHASHI Labs")
        self.c.setSubject("How NOSHASHI works, what it reads, and where it is going")
        self.page = 0
        self.y = 0.0

    # ── page furniture ───────────────────────────────────────────────
    def ground(self) -> None:
        self.c.setFillColorRGB(*GROUND)
        self.c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)

    def orbital(self, cx: float, cy: float, scale: float = 1.0, alpha: float = 0.30) -> None:
        """Section-07 concentric orbits, used as a page watermark."""
        self.c.saveState()
        self.c.setStrokeColorRGB(*BRAND)
        self.c.setLineWidth(0.4)
        self.c.setStrokeAlpha(alpha)
        for rx, ry in ((22, 30), (38, 50), (53, 68), (66, 84)):
            self.c.ellipse(
                cx - rx * scale, cy - ry * scale,
                cx + rx * scale, cy + ry * scale,
                stroke=1, fill=0,
            )
        self.c.setFillColorRGB(*BRAND)
        self.c.setFillAlpha(alpha + 0.25)
        self.c.circle(cx, cy, 2.6 * scale, stroke=0, fill=1)
        for dx, dy in ((0, 50), (0, -50), (-38, 0), (38, 0)):
            self.c.circle(cx + dx * scale, cy + dy * scale, 1.5 * scale, stroke=0, fill=1)
        self.c.restoreState()

    def dot_grid(self, x: float, y: float, w: float, h: float, gap: float = 9.0) -> None:
        self.c.saveState()
        self.c.setFillColorRGB(*INK)
        self.c.setFillAlpha(0.10)
        gy = y
        while gy < y + h:
            gx = x
            while gx < x + w:
                self.c.circle(gx, gy, 0.5, stroke=0, fill=1)
                gx += gap
            gy += gap
        self.c.restoreState()

    def start(self, kicker: str | None = None, title: str | None = None) -> None:
        self.page += 1
        self.c.showPage() if self.page > 1 else None
        self.ground()
        self.orbital(PAGE_W - 6 * mm, PAGE_H - 24 * mm, 0.9, 0.22)
        self.y = PAGE_H - M
        if kicker:
            self.text(kicker, MONO, 7.5, FAINT, tracking=1.6)
            self.y -= 5 * mm
        if title:
            self.text(title, DISPLAY_B, 19, INK)
            self.y -= 3 * mm
            self.hairline()
            self.y -= 6 * mm

    def footer(self) -> None:
        self.c.setFont(MONO, 7)
        self.c.setFillColorRGB(*FAINT)
        self.c.drawString(M, 11 * mm, "NOSHASHI · MARKET INTELLIGENCE, REIMAGINED")
        self.c.drawRightString(PAGE_W - M, 11 * mm, f"{self.page:02d}")
        self.c.setStrokeColorRGB(*RULE)
        self.c.setLineWidth(0.4)
        self.c.line(M, 14 * mm, PAGE_W - M, 14 * mm)

    # ── primitives ───────────────────────────────────────────────────
    def tracked(self, x: float, y: float, s_: str, font: str, size: float,
                colour, tracking: float = 0.0, right: float | None = None) -> None:
        """Draw text with letter-spacing.

        reportlab's Canvas has no setCharSpace; it lives on the text object,
        so tracked type has to go through beginText. `right` right-aligns to
        that x, accounting for the extra width the tracking adds.
        """
        self.c.setFillColorRGB(*colour)
        if right is not None:
            w = pdfmetrics.stringWidth(s_, font, size) + tracking * max(0, len(s_) - 1)
            x = right - w
        t = self.c.beginText(x, y)
        t.setFont(font, size)
        t.setCharSpace(tracking)
        t.setFillColorRGB(*colour)
        t.textOut(s_)
        # Tc is part of the PDF text state and persists after drawText, so a
        # tracked heading would silently space out every string drawn after
        # it — and para() measures with stringWidth, which knows nothing
        # about it, so the copy overflows its column. Reset before closing.
        t.setCharSpace(0)
        self.c.drawText(t)

    def text(self, s: str, font: str, size: float, colour, tracking: float = 0.0,
             x: float | None = None) -> None:
        self.tracked(x if x is not None else M, self.y, s, font, size, colour, tracking)
        self.y -= size * 1.25

    def para(self, s: str, size: float = 9.4, colour=MUTED, width: float | None = None,
             leading: float = 1.55, x: float | None = None) -> None:
        width = width or COL
        x = M if x is None else x
        self.c.setFont(DISPLAY, size)
        self.c.setFillColorRGB(*colour)
        words, line = s.split(), ""
        for w in words:
            probe = f"{line} {w}".strip()
            if pdfmetrics.stringWidth(probe, DISPLAY, size) <= width:
                line = probe
            else:
                self.c.drawString(x, self.y, line)
                self.y -= size * leading
                line = w
        if line:
            self.c.drawString(x, self.y, line)
            self.y -= size * leading

    def hairline(self, alpha: float = 1.0) -> None:
        self.c.saveState()
        self.c.setStrokeColorRGB(*RULE)
        self.c.setStrokeAlpha(alpha)
        self.c.setLineWidth(0.5)
        self.c.line(M, self.y, PAGE_W - M, self.y)
        self.c.restoreState()
        self.y -= 4 * mm

    def panel(self, height: float, label: str | None = None, accent=None,
              x: float | None = None, width: float | None = None) -> float:
        """Soft-cornered surface. Returns the y of its content top."""
        x = M if x is None else x
        width = width or COL
        top = self.y
        self.c.setFillColorRGB(*SURFACE)
        self.c.setStrokeColorRGB(*RULE)
        self.c.setLineWidth(0.5)
        self.c.roundRect(x, top - height, width, height, 2.4 * mm, stroke=1, fill=1)
        if accent:
            self.c.setFillColorRGB(*accent)
            self.c.roundRect(x, top - height, 1.6, height, 0.8, stroke=0, fill=1)
        inner = top - 6 * mm
        if label:
            self.tracked(x + 5 * mm, top - 5.5 * mm, label, MONO_M, 7, FAINT, 1.3)
            inner = top - 11 * mm
        self.y = top - height - 4 * mm
        return inner

    def kv_row(self, y: float, k: str, v: str, x: float, width: float,
               vcolour=INK, kcolour=FAINT) -> None:
        self.c.setFont(MONO, 7.6)
        self.c.setFillColorRGB(*kcolour)
        self.c.drawString(x, y, k)
        self.c.setFont(MONO_M, 8.4)
        self.c.setFillColorRGB(*vcolour)
        self.c.drawRightString(x + width, y, v)

    def stat(self, x: float, y: float, w: float, label: str, value: str,
             colour=INK) -> None:
        self.c.setFillColorRGB(*SURFACE)
        self.c.setStrokeColorRGB(*RULE)
        self.c.setLineWidth(0.5)
        self.c.roundRect(x, y - 17 * mm, w, 17 * mm, 2 * mm, stroke=1, fill=1)
        self.tracked(x + 4 * mm, y - 6 * mm, label, MONO, 6.6, FAINT, 1.2)
        self.c.setFont(DISPLAY_B, 15)
        self.c.setFillColorRGB(*colour)
        self.c.drawString(x + 4 * mm, y - 13.5 * mm, value)

    def save(self) -> None:
        self.footer()
        self.c.save()


# ── Content ─────────────────────────────────────────────────────────
def cover(s: Sheet) -> None:
    s.page = 1
    s.ground()
    s.orbital(PAGE_W * 0.78, PAGE_H * 0.30, 2.6, 0.30)
    s.dot_grid(M, 26 * mm, 34 * mm, 12 * mm)

    if os.path.exists(MARK):
        s.c.drawImage(ImageReader(MARK), M, PAGE_H - 78 * mm,
                      width=34 * mm, height=34 * mm, mask=None)

    s.y = PAGE_H - 96 * mm
    s.tracked(M, s.y, "NOSHASHI", DISPLAY_B, 42, INK, 6)

    s.y -= 11 * mm
    s.tracked(M, s.y, "MARKET INTELLIGENCE, REIMAGINED.", DISPLAY, 12, MUTED, 2.2)

    s.y -= 9 * mm
    s.c.setStrokeColorRGB(*BRAND)
    s.c.setLineWidth(1.2)
    s.c.line(M, s.y, M + 26 * mm, s.y)

    s.y -= 9 * mm
    s.tracked(M, s.y, "ANALYZE   ·   DISCOVER   ·   NAVIGATE", MONO, 9, TELE, 3)

    s.y -= 20 * mm
    s.para(
        "A zero-trust intelligence workstation for the XRP Ledger. It answers two "
        "questions about the same position, in the same second, from the same "
        "validated ledger state: am I allowed to move this, and could I actually "
        "get out of it?",
        size=11, colour=INK, width=COL * 0.74, leading=1.6,
    )

    s.y = 34 * mm
    s.tracked(M, s.y, "INFRASTRUCTURE BRIEFING   ·   XRPL MAINNET   ·   NO TESTNET PATH EXISTS",
              MONO, 7.4, FAINT, 1.4)
    s.footer()


def thesis(s: Sheet) -> None:
    s.start("01 · THE THESIS", "An asset is two facts, not one")
    s.para(
        "An issued balance on the XRP Ledger is only an asset if two things are true "
        "at once. The issuer cannot immobilise it — a compliance fact, sitting in "
        "account flags. And there is somewhere to sell it — a market fact, sitting in "
        "the DEX and the AMM pools."
    )
    s.y -= 3 * mm
    s.para(
        "Either one alone is a half-answer. A position with clean freeze rights and no "
        "order book is untradeable. A position with deep liquidity behind an issuer who "
        "can freeze it at will is not owned. Institutions carry both risks and currently "
        "measure neither, because the tooling is split between compliance vendors who "
        "never read the book and market terminals that never read the flags."
    )
    s.y -= 6 * mm

    top = s.panel(30 * mm, "THE JOIN", accent=BRAND)
    s.c.setFont(DISPLAY_B, 11)
    s.c.setFillColorRGB(*INK)
    s.c.drawString(M + 5 * mm, top - 1 * mm, "NOSHASHI reads both over one socket, in the same second.")
    yy = top - 8 * mm
    for line in (
        "CAN THIS ISSUER FREEZE ME?          account flags · lsfGlobalFreeze, lsfNoFreeze",
        "HOW MUCH OF MY BOOK IS IN IT?       Herfindahl-Hirschman Index",
        "HOW DEEP IS THE EXIT?               book_offers · amm_info",
    ):
        s.c.setFont(MONO, 7.8)
        s.c.setFillColorRGB(*MUTED)
        s.c.drawString(M + 5 * mm, yy, line)
        yy -= 4.6 * mm

    s.y -= 2 * mm
    s.para(
        "No other tool on this chain reports the conjunction. That is the product.",
        size=10, colour=TELE,
    )
    s.footer()


def pipeline(s: Sheet) -> None:
    s.start("02 · HOW IT WORKS", "Adjudication before signature")
    s.para(
        "Compliance on XRPL today is a report written after the fact, so the first "
        "signal that a transaction was ineligible is that it failed. NOSHASHI runs the "
        "check before a transaction exists. Nothing here touches the ledger: the gate "
        "is built entirely from read operations, which is precisely why it can run "
        "before anything is signed."
    )
    s.y -= 5 * mm

    steps = [
        ("01 · DESCRIBE", "Name the settlement",
         "Destination, amount, and the permissioned domain it is headed into. "
         "No signature, no broadcast, no fee at risk."),
        ("02 · ADJUDICATE", "Evaluate the rule set",
         "Credentials, reserve, ceiling and governance, in a fixed order. "
         "Deterministic — identical inputs always produce an identical verdict."),
        ("03 · RECEIPT", "Hash the verdict",
         "A canonical SHA-256 digest over the evaluation. Provable that the check "
         "ran; private about what was checked."),
    ]
    for kicker, title, body in steps:
        top = s.panel(28 * mm, kicker, accent=BRAND)
        s.c.setFont(DISPLAY_B, 11.5)
        s.c.setFillColorRGB(*INK)
        s.c.drawString(M + 5 * mm, top - 1 * mm, title)
        save_y = s.y
        s.y = top - 8 * mm
        s.para(body, size=8.8, colour=MUTED, width=COL - 12 * mm, x=M + 5 * mm)
        s.y = save_y

    s.y -= 2 * mm
    s.para(
        "The verdict is GO, HOLD or NO-GO, returned with the exact rule that decided "
        "it. A blocking rule fails to NO-GO; an advisory rule fails to HOLD.",
        size=9.4, colour=INK,
    )
    s.y -= 4 * mm
    for label, colour, meaning in (
        ("GO", GO, "Every configured rule passed."),
        ("HOLD", HOLD, "An advisory rule failed. A human decides."),
        ("NO-GO", NOGO, "A blocking rule failed. Settlement is refused."),
    ):
        s.c.setFillColorRGB(*colour)
        s.c.circle(M + 1.4 * mm, s.y + 1.1 * mm, 1.3, stroke=0, fill=1)
        s.c.setFont(MONO_M, 8.4)
        s.c.drawString(M + 5 * mm, s.y, label)
        s.c.setFont(DISPLAY, 9)
        s.c.setFillColorRGB(*MUTED)
        s.c.drawString(M + 22 * mm, s.y, meaning)
        s.y -= 5.4 * mm
    s.footer()


def sources(s: Sheet) -> None:
    s.start("03 · WHAT IT READS", "Data, and its provenance")
    s.para(
        "Every reading is traceable to a validated ledger and a named command. Where a "
        "module has no source in the build it is reported as NOT CONFIGURED rather than "
        "populated with a plausible number. This is load-bearing, not a caveat: NOSHASHI "
        "is sold on the claim that it does not fabricate, so an interface displaying a "
        "sentiment score it never measured would falsify the product on its first screen."
    )
    s.y -= 5 * mm

    rows = [
        ("LEDGER STATE", "wss://xrplcluster.com (+ s1/s2 failover)", "LIVE", GO),
        ("ACCOUNT & FLAGS", "account_info · account_lines", "LIVE", GO),
        ("CREDENTIALS", "XLS-70 objects · account_objects", "LIVE", GO),
        ("MARKET DATA", "XRPL DEX · book_offers", "LIVE", GO),
        ("LIQUIDITY", "XLS-30 AMM · amm_info", "LIVE", GO),
        ("ON-CHAIN SUPPLY", "gateway_balances", "LIVE", GO),
        ("IDENTITY", "Supabase — accounts only", "LIVE", GO),
        ("MACRO", "no source in the build", "NOT CONFIGURED", FAINT),
        ("SENTIMENT", "no source in the build", "NOT CONFIGURED", FAINT),
    ]
    top = s.panel(len(rows) * 6.4 * mm + 12 * mm, "MODULE · SOURCE · STATUS")
    yy = top - 1 * mm
    for label, src, status, colour in rows:
        s.c.setFont(MONO_M, 7.8)
        s.c.setFillColorRGB(*INK)
        s.c.drawString(M + 5 * mm, yy, label)
        s.c.setFont(MONO, 7.4)
        s.c.setFillColorRGB(*MUTED)
        s.c.drawString(M + 46 * mm, yy, src)
        s.c.setFont(MONO_M, 7.2)
        s.c.setFillColorRGB(*colour)
        s.c.drawRightString(PAGE_W - M - 5 * mm, yy, status)
        yy -= 6.4 * mm

    s.y -= 1 * mm
    s.para(
        "Macro and sentiment require external feeds NOSHASHI does not ship. They appear "
        "in the interface with a place for the operator to add their own key, and are "
        "never rendered as live.",
        size=8.8, colour=FAINT,
    )
    s.footer()


def exit_liquidity(s: Sheet) -> None:
    s.start("04 · THE FLAGSHIP", "Exit liquidity")
    s.para(
        "Freeze rights say whether an issuer may immobilise a balance. The order book "
        "says whether anybody would buy it if they didn't. Joining them produces a risk "
        "primitive nothing else on this chain reports — and the join is only possible "
        "because amm_info returns pool depth and asset2_frozen in the same response."
    )
    s.y -= 5 * mm

    for verdict, colour, meaning in (
        ("CLEAR", GO, "Liquid enough to exit, and nobody can stop you."),
        ("CONSTRAINED", HOLD, "An exit exists but it costs something, or somebody else controls it."),
        ("TRAPPED", NOGO, "No exit at a price the ledger can evidence."),
    ):
        s.c.setFont(MONO_M, 8.6)
        s.c.setFillColorRGB(*colour)
        s.c.drawString(M, s.y, verdict)
        s.c.setFont(DISPLAY, 9)
        s.c.setFillColorRGB(*MUTED)
        s.c.drawString(M + 30 * mm, s.y, meaning)
        s.y -= 5.6 * mm

    s.y -= 4 * mm
    s.text("MEASURING DEPTH HONESTLY", MONO_M, 8, TELE, tracking=1.4)
    s.y -= 2 * mm
    s.para(
        "Naive depth is a fiction. Summing every resting offer counts bids at a "
        "thousandth of the market as though they were an exit. Two corrections were "
        "necessary, both found by probing mainnet rather than by reading code:"
    )
    s.y -= 3 * mm
    s.para(
        "One — the touch is routinely poisoned. GateHub USD/XRP was observed with a best "
        "bid of 19.90 against a real market of 0.68: a single stale offer at 29x, setting "
        "the mid for everything downstream. The reference is now the tightest uncrossed "
        "pair, and a crossed book is disclosed rather than smoothed away.",
        size=8.8,
    )
    s.y -= 2 * mm
    s.para(
        "Two — only depth within 10% of mid is reachable. Everything beyond it is a wish.",
        size=8.8,
    )
    s.y -= 5 * mm

    top = s.panel(34 * mm, "MEASURED · GATEHUB USD/XRP · XRPL MAINNET", accent=TELE)
    yy = top - 1 * mm
    s.c.setFont(MONO, 7)
    s.c.setFillColorRGB(*FAINT)
    s.c.drawString(M + 78 * mm, yy, "NAIVE")
    s.c.drawString(M + 116 * mm, yy, "CORRECTED")
    yy -= 6 * mm
    for label, before, after, colour in (
        ("SPREAD", "-18,675 bps", "20 bps", GO),
        ("FULL-EXIT SLIPPAGE", "9,340 bps", "10 bps", GO),
        ("USABLE BID DEPTH", "12,692,991 USD", "13,894 USD", HOLD),
    ):
        s.c.setFont(MONO_M, 7.8)
        s.c.setFillColorRGB(*INK)
        s.c.drawString(M + 5 * mm, yy, label)
        s.c.setFont(MONO, 7.8)
        s.c.setFillColorRGB(*NOGO)
        s.c.drawString(M + 78 * mm, yy, before)
        s.c.setFillColorRGB(*colour)
        s.c.drawString(M + 116 * mm, yy, after)
        yy -= 6.4 * mm

    s.y -= 1 * mm
    s.para(
        "The book advertised 12.7 million USD of depth. 13,894 is reachable — a 913x "
        "overstatement. For a product whose entire claim is whether you could actually "
        "get out, that is the difference between a position marked liquid and a position "
        "nobody would pay for.",
        size=9, colour=INK,
    )
    s.footer()


def capabilities(s: Sheet) -> None:
    s.start("05 · CAPABILITIES", "What ships today")
    s.para(
        "Everything below reads validated mainnet state. Nothing is estimated, "
        "simulated or backfilled."
    )
    s.y -= 5 * mm

    groups = [
        ("COMPLIANCE", BRAND, [
            "Adjudication gate — GO / HOLD / NO-GO against XLS-80 domains",
            "Canonical SHA-256 receipt over every verdict",
            "XLS-70 credential registry with selective disclosure",
            "Issuer freeze rights — lsfGlobalFreeze, lsfNoFreeze, lsfRequireAuth",
            "Travel Rule (FATF R.16) scoping against a configurable threshold",
            "Counterparty concentration by Herfindahl-Hirschman Index",
            "Issuer drift monitor with native alerts on a flag transition",
            "Persistent adjudication ledger — 10,000 verdicts, on device",
            "Editable rule set — the operator states their own thresholds",
            "Signed audit export — chain-of-custody over the exact bytes",
            "Offline adjudication, stamped with ledger index and state age",
        ]),
        ("MARKET INTELLIGENCE", TELE, [
            "Order book depth — real bids and asks via book_offers",
            "AMM pool state — liquidity, trading fee and frozen status",
            "Issuer obligations — real circulating supply per currency",
            "Exit liquidity — freeze risk x concentration x realisable depth",
        ]),
        ("PLATFORM", MUTED, [
            "macOS menu-bar HUD with a live ticker",
            "On-device compliance agent — any model, local defaults",
            "Binary integrity verification, free on every tier",
            "Accounts, 2FA and OTP, subscription billing, entitlement gating",
        ]),
    ]
    for title, colour, items in groups:
        s.tracked(M, s.y, title, MONO_M, 7.6, colour, 1.4)
        s.y -= 6 * mm
        for item in items:
            s.c.setFillColorRGB(*colour)
            s.c.rect(M + 0.6 * mm, s.y + 1 * mm, 1.4, 1.4, stroke=0, fill=1)
            s.c.setFont(DISPLAY, 8.8)
            s.c.setFillColorRGB(*MUTED)
            s.c.drawString(M + 5 * mm, s.y, item)
            s.y -= 5 * mm
        s.y -= 3 * mm
    s.footer()


def initiatives(s: Sheet) -> None:
    s.start("06 · GOALS & INITIATIVES", "Where this is going")

    s.text("THE GOAL", MONO_M, 8, TELE, tracking=1.4)
    s.y -= 2 * mm
    s.para(
        "To make complex markets easier to understand through data, intelligence and "
        "design — and to be the trusted intelligence layer for the next financial "
        "frontier. Concretely for XRPL: that no institution has to choose between "
        "knowing whether a settlement is allowed and knowing whether it is exitable.",
        colour=INK,
    )
    s.y -= 6 * mm

    s.text("COMMERCIAL INITIATIVE", MONO_M, 8, TELE, tracking=1.4)
    s.y -= 2 * mm
    s.para(
        "The entire console is free forever. Paid tiers begin where a desk needs "
        "something an individual does not.",
        size=8.8,
    )
    s.y -= 4 * mm

    w = (COL - 8 * mm) / 3
    y0 = s.y
    for i, (name, price, cadence, who, colour) in enumerate([
        ("OPERATOR", "Free", "forever", "Individuals and single desks", MUTED),
        ("DESK", "$749", "per seat / month", "Trading desks and funds", BRAND),
        ("INSTITUTION", "$4,000", "per month", "Regulated venues and custodians", TELE),
    ]):
        x = M + i * (w + 4 * mm)
        s.c.setFillColorRGB(*SURFACE)
        s.c.setStrokeColorRGB(*RULE)
        s.c.setLineWidth(0.5)
        s.c.roundRect(x, y0 - 30 * mm, w, 30 * mm, 2 * mm, stroke=1, fill=1)
        s.c.setFillColorRGB(*colour)
        s.c.roundRect(x, y0 - 30 * mm, w, 1.4, 0.7, stroke=0, fill=1)
        s.tracked(x + 4 * mm, y0 - 7 * mm, name, MONO_M, 7.6, colour, 1.2)
        s.c.setFont(DISPLAY_B, 17)
        s.c.setFillColorRGB(*INK)
        s.c.drawString(x + 4 * mm, y0 - 16 * mm, price)
        s.c.setFont(MONO, 6.6)
        s.c.setFillColorRGB(*FAINT)
        s.c.drawString(x + 4 * mm, y0 - 20 * mm, cadence)
        # Wrap rather than clip — the old 30-char slice cut "custodians"
        # mid-word, which looks like a rendering fault rather than a choice.
        save_y = s.y
        s.y = y0 - 25.5 * mm
        s.para(who, size=7.4, colour=MUTED, width=w - 8 * mm, x=x + 4 * mm, leading=1.35)
        s.y = save_y
    s.y = y0 - 42 * mm

    s.text("IN FLIGHT", MONO_M, 8, TELE, tracking=1.4)
    s.y -= 2 * mm
    for item, note in [
        ("Zero-knowledge predicate proofs",
         "Prove one fact — accredited, over 18, not sanctioned — without disclosing the payload behind it."),
        ("Proof-of-check anchoring",
         "Put the receipt digest on-ledger so a third party can verify a check happened without seeing what was checked."),
        ("Regulator read-only seats",
         "An examiner's own view of the receipt lineage, without a copy of the data leaving the institution."),
        ("Compliance API and webhooks",
         "One call between a venue's checkout and a violation."),
    ]:
        s.c.setFont(DISPLAY_B, 9.2)
        s.c.setFillColorRGB(*INK)
        s.c.drawString(M, s.y, item)
        s.y -= 4.6 * mm
        s.para(note, size=8.4, colour=FAINT, x=M)
        s.y -= 2 * mm
    s.footer()


def posture(s: Sheet) -> None:
    s.start("07 · POSTURE", "What NOSHASHI is not")
    s.para(
        "Stated plainly, because an interface that implies otherwise is a liability.",
    )
    s.y -= 5 * mm

    for title, body in [
        ("Not custody",
         "It cannot hold, sign or move an asset. There is no signing path in the build."),
        ("Not advice",
         "A GO verdict means the configured rules passed. It is not a representation "
         "that a transaction is lawful in any jurisdiction and it discharges no "
         "obligation owed to a regulator."),
        ("Not a price oracle",
         "It reports the book as the ledger reports it. It does not forecast."),
        ("Not a trading terminal",
         "There is no order entry."),
        ("No testnet",
         "No testnet path exists in the build."),
    ]:
        s.c.setFont(DISPLAY_B, 10)
        s.c.setFillColorRGB(*INK)
        s.c.drawString(M, s.y, title)
        s.y -= 5 * mm
        s.para(body, size=8.8, colour=MUTED)
        s.y -= 3.5 * mm

    s.y -= 2 * mm
    s.text("SECURITY POSTURE", MONO_M, 8, TELE, tracking=1.4)
    s.y -= 3 * mm
    w = (COL - 8 * mm) / 3
    y0 = s.y
    for i, (k, v) in enumerate([
        ("MAINNET ONLY", "No testnet path in the build."),
        ("ZERO EGRESS", "The agent runs on your machine."),
        ("NO CUSTODY", "It cannot hold or move an asset."),
        ("OS KEYCHAIN", "Secrets held by the system."),
        ("ROW-LEVEL SECURITY", "Every table scoped to its owner."),
        ("NO CARD DATA", "Payments handled by Stripe."),
    ]):
        col, row = i % 3, i // 3
        x = M + col * (w + 4 * mm)
        yy = y0 - row * 18 * mm
        s.c.setFillColorRGB(*SURFACE)
        s.c.setStrokeColorRGB(*RULE)
        s.c.setLineWidth(0.5)
        s.c.roundRect(x, yy - 15 * mm, w, 15 * mm, 2 * mm, stroke=1, fill=1)
        s.tracked(x + 3.5 * mm, yy - 5.5 * mm, k, MONO_M, 6.6, GO, 1)
        s.c.setFont(DISPLAY, 7.4)
        s.c.setFillColorRGB(*MUTED)
        s.c.drawString(x + 3.5 * mm, yy - 11 * mm, v)
    s.y = y0 - 40 * mm

    s.hairline()
    s.para(
        "Nothing produced by this software is legal, regulatory, tax or investment "
        "advice. Determinations carrying legal consequence must be reviewed by "
        "qualified counsel and the responsible compliance officer. NOSHASHI Labs is not "
        "a bank, broker-dealer, money services business, money transmitter, qualified "
        "custodian or registered investment adviser.",
        size=7.6, colour=FAINT,
    )
    s.footer()


def main() -> None:
    out = sys.argv[1] if len(sys.argv) > 1 else "NOSHASHI_Briefing.pdf"
    register_fonts()
    s = Sheet(out)
    cover(s)
    thesis(s)
    pipeline(s)
    sources(s)
    exit_liquidity(s)
    capabilities(s)
    initiatives(s)
    posture(s)
    s.save()
    print(f"wrote {out} — {s.page} pages")


if __name__ == "__main__":
    main()
