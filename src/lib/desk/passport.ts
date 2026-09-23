import { digestOf } from "@/lib/policy";
import {
  type AuthoritySurface,
  readAuthoritySurface,
  AUTHORITY_RULES_VERSION,
} from "@/lib/desk/authority";
import {
  readIssuance,
  issuanceFindings,
} from "@/lib/desk/issuance";
import { signContent } from "@/lib/desk/ledger";
import { saveTextFile, saveBinaryFile } from "@/lib/export";

/* -----------------------------------------------------------------
   ASSET PASSPORT — a signed, portable record of an asset’s posture.
   ----------------------------------------------------------------- */

export type PassportSection =
  | "summary"
  | "authority"
  | "concentration"
  | "issuer_posture"
  | "domain"
  | "checks"
  | "history"
  | "export";

export type AssetPassport = {
  version: 1;
  generatedAt: string;
  asset: {
    issuer: string;
    currency: string;
    domain?: string;
  };
  authority: {
    verdict: "go" | "hold" | "no-go" | "insufficient-data";
    checks: {
      id: string;
      label: string;
      severity: "block" | "warn";
      passed: boolean;
      detail: string;
    }[];
    digest: string;
    ledgerIndex: number;
    source: "ledger" | "indexer" | "none";
    rulesVersion: number;
  };
  issuance: {
    canFreeze: boolean;
    globalFreeze: boolean;
    requiresAuth: boolean;
    ledgerIndex: number;
    readAt: string;
    currencies: {
      currency: string;
      outstanding: number;
      observedHeld: number;
      holders: number;
      activeHolders: number;
      hhi: number;
      topHolderPct: number;
      topFivePct: number;
      frozenSeen: number;
      authorizedSeen: number;
      coverage: number;
    }[];
  };
  findings: {
    id: string;
    severity: "critical" | "warn" | "info" | "ok";
    title: string;
    detail: string;
    action?: string;
  }[];
  receipt: {
    bodyDigest: string;
    signedDigest: string;
    algorithm: "SHA-256";
  };
  presenter: {
    name: string;
    contact: string;
    jurisdiction: string;
  };
  caveats: {
    readonly: boolean;
    caveat: string;
  }[];
};

export type PassportOptions = {
  issuer: string;
  currency?: string;
  walkSupply?: boolean;
  sections?: PassportSection[];
  presenter?: Partial<AssetPassport["presenter"]>;
  caveats?: Partial<AssetPassport["caveats"]>[];
  fileName?: string;
};

const DEFAULT_PRESENTER: AssetPassport["presenter"] = {
  name: "NOSHASHI / Ignoshashi",
  contact: "security@noshashi.app",
  jurisdiction: "Not a financial, legal or investment finding",
};

function buildAuthorityChecks(
  surface: AuthoritySurface
): AssetPassport["authority"]["checks"] {
  const checks: AssetPassport["authority"]["checks"] = [];
  const posture = surface.posture;
  const control = surface.control;

  if (!posture || surface.unreadable.some((u) => u.startsWith("posture:"))) {
    checks.push({
      id: "POSTURE_READABLE",
      label: "Issuer posture readable",
      severity: "block",
      passed: false,
      detail:
        surface.unreadable.find((u) => u.startsWith("posture:")) ??
        "Posture could not be read at this ledger.",
    });
  }

  if (posture) {
    checks.push({
      id: "NO_GLOBAL_FREEZE",
      label: "No global freeze in effect",
      severity: "block",
      passed: !posture.globalFreeze,
      detail: posture.globalFreeze ? "lsfGlobalFreeze is set." : "lsfGlobalFreeze is clear.",
    });
    checks.push({
      id: "NO_REQUIRE_AUTH",
      label: "Holding is open",
      severity: "warn",
      passed: !posture.requireAuth,
      detail: posture.requireAuth ? "lsfRequireAuth is set." : "Holding does not require issuer permission.",
    });
    checks.push({
      id: "NO_TRANSFER_FEE",
      label: "No issuer transfer fee",
      severity: "warn",
      passed: posture.transferRateBps === 0,
      detail:
        posture.transferRateBps > 0
          ? `Issuer charges ${(posture.transferRateBps / 100).toFixed(2)}%.`
          : "No issuer transfer fee.",
    });
  }

  if (control) {
    const unilateral = control.signers.present
      ? control.signers.minimumSigners <= 1
      : !!(control.regularKey || control.masterKeyEnabled);
    checks.push({
      id: "CONTROLLED_BY_ONE",
      label: "No single signer controls issuer",
      severity: "block",
      passed: !unilateral,
      detail: unilateral
        ? "A single key or signer can act for this issuer."
        : "Quorum required to act for this issuer.",
    });
  }

  const issuance = surface.issuance;
  if (issuance && issuance.currencies.length > 0) {
    const c = issuance.currencies[0];
    checks.push({
      id: "SUPPLY_NOT_CONCENTRATED",
      label: "Supply not concentrated",
      severity: "warn",
      passed: !(c.hhi >= 2500),
      detail:
        c.hhi >= 2500
          ? `HHI ${Math.round(c.hhi)} over ${c.holders} holders.`
          : `HHI ${Math.round(c.hhi)} over ${c.holders} holders — below 2 500.`,
    });
  }

  return checks;
}

function buildVerdict(
  checks: AssetPassport["authority"]["checks"],
  unreadable: string[]
): AssetPassport["authority"]["verdict"] {
  if (checks.some((c) => c.severity === "block" && !c.passed)) return "no-go";
  if (unreadable.length > 0) return "insufficient-data";
  if (checks.some((c) => !c.passed)) return "hold";
  return "go";
}

export async function buildPassport(options: PassportOptions): Promise<AssetPassport> {
  const [surface, issuance] = await Promise.all([
    readAuthoritySurface(options.issuer, {
      walkSupply: options.walkSupply ?? true,
    }),
    readIssuance(options.issuer),
  ]);

  const currency = options.currency ?? issuance.currencies[0]?.currency ?? "";
  const checks = buildAuthorityChecks(surface);
  const verdict = buildVerdict(checks, surface.unreadable);

  const canonicalBody = {
    version: 1 as const,
    generatedAt: new Date().toISOString(),
    asset: {
      issuer: options.issuer,
      currency,
      domain: issuance.domain,
    },
    authority: {
      verdict,
      checks,
      ledgerIndex: surface.ledgerIndex,
      source: (surface.issuance?.source ?? "none") as "ledger" | "indexer" | "none",
      rulesVersion: AUTHORITY_RULES_VERSION,
    },
    issuance: {
      canFreeze: issuance.canFreeze,
      globalFreeze: issuance.globalFreeze,
      requiresAuth: issuance.requiresAuth,
      ledgerIndex: issuance.ledgerIndex,
      readAt: issuance.readAt,
      currencies: issuance.currencies.map((c) => ({
        currency: c.currency,
        outstanding: c.outstanding,
        observedHeld: c.observedHeld,
        holders: c.holders,
        activeHolders: c.activeHolders,
        hhi: c.hhi,
        topHolderPct: c.topHolderPct,
        topFivePct: c.topFivePct,
        frozenSeen: c.frozenSeen,
        authorizedSeen: c.authorizedSeen,
        coverage: c.coverage,
      })),
    },
    findings: issuanceFindings(issuance).map((f) => ({
      id: f.id,
      severity: f.severity,
      title: f.title,
      detail: f.detail,
      action: f.action,
    })),
    presenter: { ...DEFAULT_PRESENTER, ...options.presenter },
    caveats: [
      { readonly: true, caveat: "This passport is a finding, not a legal conclusion." },
      { readonly: true, caveat: "The digest binds the body below — any change invalidates it." },
    ],
  };

  const bodyDigest = await digestOf({
    kind: "passport-body",
    subject: JSON.stringify(canonicalBody),
    scope: { currency, ledgerIndex: issuance.ledgerIndex },
    checks: [],
    evaluatedAt: canonicalBody.generatedAt,
  });

  const signedDigest = await signContent(
    JSON.stringify(canonicalBody, null, 2)
  );

  const passport: AssetPassport = {
    ...canonicalBody,
    authority: {
      ...canonicalBody.authority,
      digest: bodyDigest,
    },
    receipt: {
      bodyDigest,
      signedDigest,
      algorithm: "SHA-256",
    },
  };

  return passport;
}

export function passportToJson(passport: AssetPassport): string {
  return JSON.stringify(passport, null, 2);
}

export function passportToCsv(passport: AssetPassport): string {
  const rows: string[] = ["section,key,value"];

  const add = (section: string, obj: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        add(`${section}.${k}`, v as Record<string, unknown>);
        continue;
      }
      const val = Array.isArray(v) ? v.join("; ") : v === null || v === undefined ? "" : String(v);
      rows.push([section, k, `"${val.replace(/"/g, '""')}"`].join(","));
    }
  };

  add("asset", passport.asset as Record<string, unknown>);
  add("authority", {
    ...passport.authority,
    checks: passport.authority.checks.map((c) => c.id).join(";"),
  } as Record<string, unknown>);
  add("receipt", {
    bodyDigest: passport.receipt.bodyDigest,
    signedDigest: passport.receipt.signedDigest,
    algorithm: passport.receipt.algorithm,
  } as Record<string, unknown>);
  add("presenter", passport.presenter as Record<string, unknown>);

  return rows.join("\n");
}

function escapePdfText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function pdfString(text: string): string {
  const escaped = escapePdfText(text);
  return `(${escaped})`;
}

export function passportToPdf(passport: AssetPassport): Uint8Array {
  const objects: string[] = [];
  const push = (obj: string) => objects.push(obj);

  push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj");
  push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj");

  const contentLines: string[] = [];
  contentLines.push("BT");
  contentLines.push("/F1 14 Tf");
  contentLines.push("72 740 Td");
  contentLines.push(`(${escapePdfText("Asset Passport")}) Tj`);
  contentLines.push("0 -20 Td");
  contentLines.push("/F1 10 Tf");

  const addLine = (label: string, value: string) => {
    contentLines.push("0 -14 Td");
    contentLines.push(`(${escapePdfText(label)} ) Tj`);
    contentLines.push("0 -12 Td");
    contentLines.push(`(${escapePdfText(value)}) Tj`);
  };

  addLine("Issuer", passport.asset.issuer);
  addLine("Currency", passport.asset.currency || "—");
  if (passport.asset.domain) addLine("Domain", passport.asset.domain);

  contentLines.push("0 -20 Td");
  contentLines.push(`(${escapePdfText(`Verdict: ${passport.authority.verdict.toUpperCase()}`)}) Tj`);
  contentLines.push("0 -12 Td");
  contentLines.push(`(${escapePdfText(`Rules version: ${passport.authority.rulesVersion}`)}) Tj`);
  contentLines.push(`(${escapePdfText(`Ledger index: ${passport.authority.ledgerIndex}`)}) Tj`);
  contentLines.push(`(${escapePdfText(`Source: ${passport.authority.source}`)}) Tj`);

  contentLines.push("0 -20 Td");
  contentLines.push(`(${escapePdfText("Receipt")}) Tj`);
  contentLines.push("0 -12 Td");
  contentLines.push(`(${escapePdfText(`Body digest: ${passport.receipt.bodyDigest}`)}) Tj`);
  contentLines.push("0 -12 Td");
  contentLines.push(`(${escapePdfText(`Signed digest: ${passport.receipt.signedDigest}`)}) Tj`);

  contentLines.push("0 -20 Td");
  contentLines.push(`(${escapePdfText(`Presenter: ${passport.presenter.name}`)}) Tj`);
  contentLines.push("0 -12 Td");
  contentLines.push(`(${escapePdfText(`Contact: ${passport.presenter.contact}`)}) Tj`);
  contentLines.push("0 -12 Td");
  contentLines.push(`(${escapePdfText(`Jurisdiction: ${passport.presenter.jurisdiction}`)}) Tj`);

  contentLines.push("0 -20 Td");
  contentLines.push(`(${escapePdfText(`Generated: ${passport.generatedAt}`)}) Tj`);

  contentLines.push("ET");

  const contentStream = contentLines.join("\n");
  const contentStreamBytes = new TextEncoder().encode(contentStream);

  push("3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj");
  push(`4 0 obj\n<< /Length ${contentStreamBytes.length} >>\nstream\n${contentStream}\nendstream\nendobj`);
  push("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj");

  const header = "%PDF-1.4\n";
  const body = objects.join("\n");
  const bodyBytes = new TextEncoder().encode(body);

  const offsets: number[] = [0];
  for (let i = 1; i <= 5; i++) {
    const marker = `${i} 0 obj`;
    const markerBytes = new TextEncoder().encode(marker);
    const idx = bodyBytes.indexOf(markerBytes);
    offsets.push(idx >= 0 ? header.length + idx : 0);
  }

  const xrefLines: string[] = [];
  xrefLines.push("xref");
  xrefLines.push("0 6");
  xrefLines.push("0000000000 65535 f ");
  for (let i = 1; i <= 5; i++) {
    xrefLines.push(`${String(offsets[i]).padStart(10, "0")} 00000 n `);
  }

  const xrefOffset = header.length + bodyBytes.length;
  const trailerLines = [
    "trailer",
    "<< /Size 6 /Root 1 0 R >>",
    "startxref",
    String(xrefOffset),
    "%%EOF",
  ];

  const pdf = [
    header,
    body,
    ...xrefLines,
    ...trailerLines,
  ].join("\n");

  return new TextEncoder().encode(pdf);
}

export async function exportPassport(
  passport: AssetPassport,
  fileName?: string
): Promise<{ json: string; csv: string; pdf: Uint8Array; saved: { json: string; csv: string; pdf: string } }> {
  const json = passportToJson(passport);
  const csv = passportToCsv(passport);
  const pdf = passportToPdf(passport);
  const base = fileName ?? `passport-${passport.asset.currency ?? passport.asset.issuer.slice(0, 8)}`;
  const stamp = passport.generatedAt.slice(0, 10);

  const savedJson = await saveTextFile(`${base}-${stamp}.json`, json, "application/json");
  const savedCsv = await saveTextFile(`${base}-${stamp}.csv`, csv, "text/csv");
  const savedPdf = await saveBinaryFile(`${base}-${stamp}.pdf`, pdf);

  return {
    json,
    csv,
    pdf,
    saved: { json: savedJson, csv: savedCsv, pdf: savedPdf },
  };
}
