#!/usr/bin/env python3
"""Render the factual NOSHASHI implementation timeline as a PDF."""
from __future__ import annotations

import os
import sys

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = os.environ.get("NOSHASHI_PDF_FONTS", os.path.join(ROOT, "fonts"))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "NOSHASHI_Implementation_Timeline.pdf")

GROUND = (11 / 255, 15 / 255, 20 / 255)
SURFACE = (17 / 255, 22 / 255, 29 / 255)
INK = (230 / 255, 232 / 255, 235 / 255)
MUTED = (163 / 255, 168 / 255, 179 / 255)
FAINT = (116 / 255, 124 / 255, 139 / 255)
RULE = (42 / 255, 49 / 255, 60 / 255)
BLUE = (58 / 255, 130 / 255, 246 / 255)
TEAL = (0 / 255, 224 / 255, 198 / 255)
GREEN = (53 / 255, 212 / 255, 154 / 255)
AMBER = (245 / 255, 185 / 255, 66 / 255)

PAGE_W, PAGE_H = A4
M = 18 * mm
CONTENT_W = PAGE_W - 2 * M


def register_fonts() -> None:
    for name, file_name in {
        "SG": "SpaceGrotesk-Medium.ttf",
        "SGB": "SpaceGrotesk-Bold.ttf",
        "PM": "PlexMono-Regular.ttf",
        "PMM": "PlexMono-Medium.ttf",
    }.items():
        pdfmetrics.registerFont(TTFont(name, os.path.join(FONT_DIR, file_name)))


def wrap(text: str, font: str, size: float, width: float) -> list[str]:
    lines: list[str] = []
    line = ""
    for word in text.split():
        candidate = f"{line} {word}".strip()
        if line and pdfmetrics.stringWidth(candidate, font, size) > width:
            lines.append(line)
            line = word
        else:
            line = candidate
    if line:
        lines.append(line)
    return lines


def draw_wrapped(c: canvas.Canvas, text: str, x: float, y: float, width: float,
                 font: str = "SG", size: float = 9, color=MUTED, leading: float = 13) -> float:
    c.setFont(font, size)
    c.setFillColorRGB(*color)
    for line in wrap(text, font, size, width):
        c.drawString(x, y, line)
        y -= leading
    return y


def page(c: canvas.Canvas, number: int) -> None:
    c.setFillColorRGB(*GROUND)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setStrokeColorRGB(*RULE)
    c.setLineWidth(0.5)
    c.line(M, 14 * mm, PAGE_W - M, 14 * mm)
    c.setFont("PM", 7)
    c.setFillColorRGB(*FAINT)
    c.drawString(M, 10 * mm, "NOSHASHI · IMPLEMENTATION TIMELINE")
    c.drawRightString(PAGE_W - M, 10 * mm, f"{number:02d}")


def main() -> None:
    register_fonts()
    c = canvas.Canvas(OUT, pagesize=A4)
    c.setTitle("NOSHASHI Implementation Timeline")
    c.setAuthor("NOSHASHI")
    c.setSubject("Factual implementation plan and release status")

    page(c, 1)
    y = PAGE_H - 28 * mm
    c.setFont("PMM", 8)
    c.setFillColorRGB(*TEAL)
    c.drawString(M, y, "PRODUCT / ENGINEERING / DESIGN DIRECTIVE")
    y -= 10 * mm
    c.setFont("SGB", 27)
    c.setFillColorRGB(*INK)
    c.drawString(M, y, "Implementation timeline")
    y -= 10 * mm
    c.setFont("SG", 11)
    c.setFillColorRGB(*MUTED)
    y = draw_wrapped(
        c,
        "A staged plan for transforming the existing Noshashi XRPL application into "
        "institutional intelligence infrastructure while preserving working functionality.",
        M, y, CONTENT_W, size=11, color=INK, leading=17,
    ) - 8 * mm

    c.setFillColorRGB(*SURFACE)
    c.setStrokeColorRGB(*RULE)
    c.roundRect(M, y - 30 * mm, CONTENT_W, 30 * mm, 2 * mm, fill=1, stroke=1)
    c.setFont("PMM", 8)
    c.setFillColorRGB(*FAINT)
    c.drawString(M + 5 * mm, y - 8 * mm, "CURRENT RELEASE")
    c.setFont("SGB", 18)
    c.setFillColorRGB(*BLUE)
    c.drawString(M + 5 * mm, y - 17 * mm, "v0.4.2")
    c.setFont("PM", 8)
    c.setFillColorRGB(*MUTED)
    c.drawString(M + 55 * mm, y - 8 * mm, "WEBSITE")
    c.setFillColorRGB(*GREEN)
    c.drawString(M + 55 * mm, y - 17 * mm, "LIVE · noshashi.app")
    c.setFillColorRGB(*MUTED)
    c.drawString(M + 120 * mm, y - 8 * mm, "DESKTOP")
    c.setFillColorRGB(*GREEN)
    c.drawString(M + 120 * mm, y - 17 * mm, "GITHUB RELEASE")
    y -= 42 * mm

    c.setFont("PMM", 8)
    c.setFillColorRGB(*TEAL)
    c.drawString(M, y, "STATUS KEY")
    y -= 7 * mm
    for label, color, detail in (
        ("IMPLEMENTED", GREEN, "Present in the codebase and validated."),
        ("IN PROGRESS", AMBER, "Partially implemented; remaining work is explicit."),
        ("REQUIRES EXTERNAL ACTION", FAINT, "Needs credentials, deployment, legal, or business approval."),
    ):
        c.setFillColorRGB(*color)
        c.circle(M + 1.2 * mm, y + 1.2 * mm, 1.2 * mm, fill=1, stroke=0)
        c.setFont("PMM", 8)
        c.drawString(M + 6 * mm, y, label)
        c.setFont("SG", 8.5)
        c.setFillColorRGB(*MUTED)
        c.drawString(M + 57 * mm, y, detail)
        y -= 6 * mm

    c.showPage()
    page(c, 2)
    y = PAGE_H - 28 * mm
    c.setFont("SGB", 19)
    c.setFillColorRGB(*INK)
    c.drawString(M, y, "Engineering stages")
    y -= 12 * mm

    stages = [
        ("01", "Command center + evidence workflow", "IMPLEMENTED", GREEN,
         "Mission Control now exposes a structured Decision Record: observed ledger state, deterministic policy, primary condition, verdict, and explicit freshness. Credential read failures remain unavailable evidence instead of being treated as a negative finding.",
         "Published on main in commit f7a1186. The next Tauri tag is required before this change is inside a desktop installer."),
        ("02", "Asset Passport + professional exports", "NEXT", BLUE,
         "Assemble existing identity, controls, liquidity, credentials, provenance, history, adjudication, and evidence modules into one exportable passport. JSON and CSV can reuse existing helpers; PDF must remain a real generated document.",
         "Estimated 2–4 engineering days after Stage 01."),
        ("03", "Monitoring + historical intelligence", "NEXT", BLUE,
         "Extend watch/history/stress modules into explicit previous/current state records, change detection, timelines, and alert abstractions. No provider is claimed until delivery infrastructure exists.",
         "Estimated 3–6 engineering days; persistent workers require backend deployment."),
        ("04", "Versioned policies + workspaces", "IN PROGRESS", AMBER,
         "Add authored policy records, organization bootstrap, role authorization, and audit-log writers while preserving the frozen receipt digest contract. Existing organization schema is committed but production application is still a deployment decision.",
         "Estimated 4–8 engineering days plus Supabase migration and authorization verification."),
        ("05", "API, developer, and public company surfaces", "NEXT", BLUE,
         "Expand only implemented API routes, developer documentation, factual research/trust/legal surfaces, and safe public entity pages. Avoid unverified customers, certifications, partnerships, or regulatory claims.",
         "Estimated 4–8 engineering days; external integrations are separate work."),
        ("06", "Security, release, and production review", "REQUIRED", FAINT,
         "Review Tauri permissions, IPC, CSP, secrets, storage, dependency state, logs, performance, accessibility, and release signing. Build a new installer only after all changed stages pass.",
         "Estimated 2–4 engineering days plus signing credentials and human approvals."),
    ]

    for number, title, status, color, body, note in stages:
        height = 37 * mm
        if y - height < 22 * mm:
            c.showPage()
            page(c, 3)
            y = PAGE_H - 28 * mm
        c.setFillColorRGB(*SURFACE)
        c.setStrokeColorRGB(*RULE)
        c.roundRect(M, y - height, CONTENT_W, height, 2 * mm, fill=1, stroke=1)
        c.setFillColorRGB(*color)
        c.rect(M, y - height, 2 * mm, height, fill=1, stroke=0)
        c.setFont("PMM", 8)
        c.drawString(M + 6 * mm, y - 8 * mm, number)
        c.setFont("SGB", 11.5)
        c.setFillColorRGB(*INK)
        c.drawString(M + 18 * mm, y - 8 * mm, title)
        c.setFont("PMM", 7.5)
        c.setFillColorRGB(*color)
        c.drawRightString(PAGE_W - M - 5 * mm, y - 8 * mm, status)
        draw_wrapped(c, body, M + 6 * mm, y - 16 * mm, CONTENT_W - 12 * mm, size=8.5, leading=11.5)
        draw_wrapped(c, note, M + 6 * mm, y - 29 * mm, CONTENT_W - 12 * mm, font="PM", size=7.2, color=FAINT, leading=9)
        y -= height + 6 * mm

    c.showPage()
    page(c, 4)
    y = PAGE_H - 28 * mm
    c.setFont("SGB", 19)
    c.setFillColorRGB(*INK)
    c.drawString(M, y, "What requires human action")
    y -= 12 * mm
    y = draw_wrapped(
        c,
        "Human action means a decision or access boundary outside source code. These items cannot be honestly completed by adding placeholders.",
        M, y, CONTENT_W, size=10, color=INK, leading=15,
    ) - 5 * mm
    actions = [
        ("PRODUCTION ACCESS", "Apply and verify Supabase migrations, organization bootstrap, RLS, and audit-log writers in the production project."),
        ("SERVICE CREDENTIALS", "Provide approved Stripe, email, Slack, Teams, webhook, monitoring, or identity-provider credentials before those integrations can be connected."),
        ("BUSINESS VERIFICATION", "Confirm issuer, institution, counterparty, partnership, customer, certification, SLA, and regulatory claims with reliable evidence."),
        ("LEGAL REVIEW", "Have qualified counsel review Terms, Privacy, MSA, SLA, DPA, disclaimers, and institutional positioning before launch."),
        ("RELEASE SIGNING", "Create and protect Tauri signing/notarization credentials if signed desktop distribution is required."),
    ]
    for label, body in actions:
        c.setFont("PMM", 8)
        c.setFillColorRGB(*AMBER)
        c.drawString(M, y, label)
        y -= 5 * mm
        y = draw_wrapped(c, body, M, y, CONTENT_W, size=9, color=MUTED, leading=13) - 5 * mm

    c.setFont("PMM", 8)
    c.setFillColorRGB(*TEAL)
    c.drawString(M, y, "VERIFICATION CONTRACT")
    y -= 7 * mm
    y = draw_wrapped(
        c,
        "Each stage is validated with the existing test suite, TypeScript/Vite build, edge-function checks where applicable, site generation, and Rust/Tauri checks where available. Generated website metadata is refreshed only after the corresponding GitHub release is published.",
        M, y, CONTENT_W, size=9, color=MUTED, leading=13,
    )
    y -= 8 * mm
    c.setFont("PM", 7.5)
    c.setFillColorRGB(*FAINT)
    c.drawString(M, y, "Source: repository audit, docs/AUDIT.md, current main branch, and published GitHub release metadata.")
    c.save()
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
