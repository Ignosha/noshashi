import { motion } from "framer-motion";
import type { BeatScene } from "@/lib/tutorials";

/**
 * The drawings behind each tutorial beat.
 *
 * Diagrams, not illustrations. Each one shows the actual mechanism being
 * described — the rule list that really runs, the flag that really decides,
 * the shape of a real order book. Where a figure appears it is the measured
 * one, because a diagram with a rounded-off number teaches the wrong lesson
 * in a product whose whole argument is that the numbers matter.
 *
 * Everything is inline SVG on `currentColor` and the token palette, so the
 * stage costs nothing to load and themes for free.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 320 180" className="h-full w-full" aria-hidden>
      {children}
    </svg>
  );
}

/* ── The gate ─────────────────────────────────────────────────────── */

function GateDescribe() {
  return (
    <Frame>
      {[
        { y: 44, label: "DESTINATION", w: 128 },
        { y: 78, label: "AMOUNT", w: 88 },
        { y: 112, label: "DOMAIN", w: 108 },
      ].map((row, i) => (
        <motion.g
          key={row.label}
          initial={{ opacity: 0, x: -14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15 + i * 0.28, duration: 0.5, ease: EASE }}
        >
          <rect
            x="42"
            y={row.y}
            width={row.w}
            height="22"
            rx="4"
            fill="hsl(var(--popover))"
            stroke="hsl(var(--border))"
          />
          <text x="52" y={row.y + 15} fontSize="8" fill="hsl(var(--muted-foreground))" fontFamily="monospace">
            {row.label}
          </text>
        </motion.g>
      ))}
      <motion.text
        x="42" y="152" fontSize="8" fontFamily="monospace" fill="hsl(var(--faint))"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}
      >
        NOTHING SIGNED · NOTHING BROADCAST
      </motion.text>
    </Frame>
  );
}

const RULES = [
  "ACCOUNT_ACTIVATED",
  "CREDENTIAL_KYC_LEVEL_1",
  "CREDENTIAL_SANCTIONS",
  "RESERVE_SOLVENCY",
  "SPENDABLE_BALANCE",
  "TRANSFER_CEILING",
  "DOMAIN_GOVERNANCE",
  "DOMAIN_ATTESTATION",
];
/* Two blocking failures — the same shape the live gate returns on the
   default wallet, so the diagram matches what the app actually shows. */
const PASSED = [true, false, false, true, true, true, true, true];

function GateAdjudicate() {
  return (
    <Frame>
      {RULES.map((r, i) => (
        <motion.g
          key={r}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 + i * 0.34, duration: 0.24 }}
        >
          <rect
            x="26" y={16 + i * 19} width="6" height="6"
            fill={PASSED[i] ? "hsl(var(--status-go))" : "hsl(var(--status-no-go))"}
          />
          <text x="40" y={22 + i * 19} fontSize="8.5" fontFamily="monospace"
                fill="hsl(var(--muted-foreground))">{r}</text>
          <text x="294" y={22 + i * 19} fontSize="8" fontFamily="monospace" textAnchor="end"
                fill={PASSED[i] ? "hsl(var(--status-go))" : "hsl(var(--status-no-go))"}>
            {PASSED[i] ? "PASS" : "BLOCK"}
          </text>
        </motion.g>
      ))}
    </Frame>
  );
}

function GateReceipt() {
  return (
    <Frame>
      <motion.text
        x="160" y="58" textAnchor="middle" fontSize="30" fontWeight="700"
        fill="hsl(var(--status-no-go))"
        initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: EASE }}
      >
        NO-GO
      </motion.text>
      <motion.text
        x="160" y="78" textAnchor="middle" fontSize="8.5" fill="hsl(var(--muted-foreground))"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
      >
        A blocking rule failed. Settlement is refused.
      </motion.text>
      <motion.rect
        x="30" y="96" width="260" height="46" rx="5"
        fill="hsl(var(--popover))" stroke="hsl(var(--border))"
        initial={{ opacity: 0, y: 104 }} animate={{ opacity: 1, y: 96 }}
        transition={{ delay: 0.8, duration: 0.45, ease: EASE }}
      />
      <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}>
        <text x="42" y="112" fontSize="7" fontFamily="monospace" fill="hsl(var(--faint))">
          CRYPTOGRAPHIC RECEIPT
        </text>
        <text x="42" y="128" fontSize="8" fontFamily="monospace" fill="hsl(var(--foreground))">
          5D3AFBC4E3A8D003FF0EA2A3…C532
        </text>
      </motion.g>
    </Frame>
  );
}

/* ── Freeze rights ────────────────────────────────────────────────── */

function Wallet({ frozen, dim }: { frozen?: boolean; dim?: boolean }) {
  return (
    <>
      <rect x="90" y="52" width="140" height="76" rx="6"
            fill="hsl(var(--popover))" stroke="hsl(var(--border))" />
      <text x="104" y="74" fontSize="7.5" fontFamily="monospace" fill="hsl(var(--faint))">
        YOUR BALANCE
      </text>
      <text x="104" y="98" fontSize="19" fontWeight="600" fontFamily="monospace"
            fill={dim ? "hsl(var(--faint))" : "hsl(var(--foreground))"}>
        412,602.49
      </text>
      <text x="104" y="114" fontSize="7.5" fontFamily="monospace"
            fill={frozen ? "hsl(var(--status-no-go))" : "hsl(var(--faint))"}>
        {frozen ? "FROZEN — CANNOT MOVE" : "USD · ISSUED"}
      </text>
    </>
  );
}

function FreezeHolding() {
  return (
    <Frame>
      <motion.g initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}>
        <Wallet />
      </motion.g>
      <motion.text
        x="160" y="150" textAnchor="middle" fontSize="8" fontFamily="monospace" fill="hsl(var(--faint))"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
      >
        AN IOU FROM AN ISSUER — NOT CASH
      </motion.text>
    </Frame>
  );
}

function FreezeFlag() {
  return (
    <Frame>
      <Wallet />
      <motion.g
        initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.3, duration: 0.5, ease: EASE }}
      >
        <rect x="238" y="66" width="58" height="48" rx="5"
              fill="hsl(var(--popover))" stroke="hsl(var(--status-hold))" />
        <text x="267" y="84" textAnchor="middle" fontSize="7" fontFamily="monospace" fill="hsl(var(--status-hold))">
          ISSUER
        </text>
        <motion.circle
          cx="267" cy="100" r="7" fill="hsl(var(--status-hold))"
          animate={{ opacity: [1, 0.35, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.g>
      <motion.path
        d="M238 90 L232 90" stroke="hsl(var(--status-hold))" strokeWidth="1.4"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.8, duration: 0.4 }}
      />
    </Frame>
  );
}

function FreezeFrozen() {
  return (
    <Frame>
      <Wallet frozen dim />
      <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <line key={i} x1={92 + i * 24} y1="52" x2={92 + i * 24 - 18} y2="128"
                stroke="hsl(var(--status-no-go))" strokeWidth="0.8" strokeOpacity="0.35" />
        ))}
      </motion.g>
      <motion.text
        x="160" y="150" textAnchor="middle" fontSize="8" fontFamily="monospace"
        fill="hsl(var(--status-no-go))"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
      >
        STILL VISIBLE · NO LONGER YOURS TO MOVE
      </motion.text>
    </Frame>
  );
}

function FreezeNoFreeze() {
  return (
    <Frame>
      <Wallet />
      <motion.g initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4, duration: 0.5, ease: EASE }}>
        <rect x="238" y="66" width="58" height="48" rx="5"
              fill="hsl(var(--popover))" stroke="hsl(var(--status-go))" />
        <text x="267" y="84" textAnchor="middle" fontSize="7" fontFamily="monospace" fill="hsl(var(--status-go))">
          ISSUER
        </text>
        <path d="M259 100 l5 5 10 -11" stroke="hsl(var(--status-go))" strokeWidth="2"
              fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </motion.g>
      <motion.text
        x="160" y="150" textAnchor="middle" fontSize="8" fontFamily="monospace"
        fill="hsl(var(--status-go))"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}
      >
        lsfNoFreeze SET · CAN NEVER BE UNDONE
      </motion.text>
    </Frame>
  );
}

/* ── Order book depth ─────────────────────────────────────────────── */

/* A plausible shape: a tall outlier, a dense cluster near the market, and a
   long tail of lowball bids. Only the cluster is reachable. */
const BARS = [
  { h: 56, x: 30, junk: false, outlier: true },
  ...Array.from({ length: 9 }, (_, i) => ({ h: 22 + i * 3, x: 58 + i * 15, junk: false, outlier: false })),
  ...Array.from({ length: 8 }, (_, i) => ({ h: 64 - i * 6, x: 196 + i * 15, junk: true, outlier: false })),
];

function BookBars({ mode }: { mode: "naive" | "outlier" | "banded" }) {
  return (
    <Frame>
      <line x1="24" y1="132" x2="300" y2="132" stroke="hsl(var(--border))" />
      {BARS.map((b, i) => {
        const isDim =
          (mode === "banded" && (b.junk || b.outlier)) ||
          (mode === "outlier" && !b.outlier);
        const colour = b.outlier
          ? "hsl(var(--status-no-go))"
          : b.junk
            ? "hsl(var(--faint))"
            : "hsl(var(--brand))";
        return (
          <motion.rect
            key={i}
            x={b.x}
            width="11"
            rx="1.5"
            fill={colour}
            initial={{ height: 0, y: 132 }}
            animate={{
              height: b.h,
              y: 132 - b.h,
              opacity: isDim ? 0.18 : 1,
            }}
            transition={{ delay: 0.05 + i * 0.035, duration: 0.4, ease: EASE }}
          />
        );
      })}
      {mode === "banded" && (
        <motion.rect
          x="52" y="34" width="146" height="98" rx="4" fill="none"
          stroke="hsl(var(--telemetry))" strokeWidth="1" strokeDasharray="4 3"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
        />
      )}
      {mode === "outlier" && (
        <motion.text
          x="36" y="66" fontSize="8" fontFamily="monospace" fill="hsl(var(--status-no-go))"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
        >
          29×
        </motion.text>
      )}
      <text x="24" y="150" fontSize="7.5" fontFamily="monospace" fill="hsl(var(--faint))">
        {mode === "banded" ? "WITHIN 10% OF MID" : "RESTING BIDS"}
      </text>
    </Frame>
  );
}

/* ── The public check ─────────────────────────────────────────────── */

function CheckPaste() {
  return (
    <Frame>
      <motion.rect
        x="46" y="70" width="228" height="30" rx="5"
        fill="hsl(var(--popover))" stroke="hsl(var(--brand))"
        initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: EASE }}
      />
      <motion.text
        x="60" y="90" fontSize="10" fontFamily="monospace" fill="hsl(var(--foreground))"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
      >
        rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B
      </motion.text>
      <motion.rect
        x="60" y="78" width="1.4" height="14" fill="hsl(var(--brand))"
        animate={{ opacity: [1, 0, 1] }} transition={{ duration: 1.1, repeat: Infinity }}
      />
    </Frame>
  );
}

const FACTS = [
  ["CAN FREEZE YOU", "YES", "hsl(var(--status-hold))"],
  ["TRANSFER FEE", "15 bps", "hsl(var(--status-hold))"],
  ["CLAIMS DOMAIN", "bitstamp.net", "hsl(var(--muted-foreground))"],
  ["ISSUES", "8 currencies", "hsl(var(--muted-foreground))"],
  ["RECENT ACTIVITY", "60 tx", "hsl(var(--muted-foreground))"],
] as const;

function CheckRead() {
  return (
    <Frame>
      {FACTS.map(([k, v, c], i) => (
        <motion.g
          key={k}
          initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15 + i * 0.4, duration: 0.4, ease: EASE }}
        >
          <text x="30" y={38 + i * 24} fontSize="8" fontFamily="monospace" fill="hsl(var(--faint))">{k}</text>
          <text x="292" y={38 + i * 24} fontSize="9" fontFamily="monospace" textAnchor="end" fill={c}>{v}</text>
          <line x1="30" y1={44 + i * 24} x2="292" y2={44 + i * 24} stroke="hsl(var(--border))" strokeOpacity="0.5" />
        </motion.g>
      ))}
    </Frame>
  );
}

function CheckVerdict() {
  return (
    <Frame>
      <motion.text
        x="160" y="66" textAnchor="middle" fontSize="15" fontWeight="700"
        fill="hsl(var(--status-hold))"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.45 }}
      >
        THINGS TO KNOW FIRST
      </motion.text>
      <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
        <rect x="40" y="86" width="240" height="52" rx="5"
              fill="hsl(var(--popover))" stroke="hsl(var(--border))" />
        <text x="54" y="106" fontSize="8" fontFamily="monospace" fill="hsl(var(--faint))">
          NO REPUTATION SCORE
        </text>
        <text x="54" y="124" fontSize="8.5" fill="hsl(var(--muted-foreground))">
          Published facts. Never a recommendation.
        </text>
      </motion.g>
    </Frame>
  );
}

const SCENES: Record<BeatScene, () => JSX.Element> = {
  "gate-describe": GateDescribe,
  "gate-adjudicate": GateAdjudicate,
  "gate-receipt": GateReceipt,
  "freeze-holding": FreezeHolding,
  "freeze-flag": FreezeFlag,
  "freeze-frozen": FreezeFrozen,
  "freeze-nofreeze": FreezeNoFreeze,
  "book-naive": () => <BookBars mode="naive" />,
  "book-outlier": () => <BookBars mode="outlier" />,
  "book-banded": () => <BookBars mode="banded" />,
  "check-paste": CheckPaste,
  "check-read": CheckRead,
  "check-verdict": CheckVerdict,
};

export function TutorialStage({ scene }: { scene: BeatScene }) {
  const Scene = SCENES[scene];
  return <Scene />;
}
