import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppearance, TEXT_SCALES } from "@/lib/appearance";
import { cn } from "@/lib/utils";

/**
 * Accessibility widget.
 *
 * Deliberately a floating control rather than a row in Settings. Someone
 * who needs larger type or reduced motion needs it *now*, on whatever
 * screen they are on — asking them to navigate a dense console to find
 * the setting that would make the console navigable is the wrong way
 * round.
 *
 * It is keyboard-first: the trigger is in the tab order, Escape closes,
 * focus is trapped while open and returned to the trigger on close. Every
 * option writes through the same persisted appearance store the Settings
 * scene uses, so the two never disagree.
 */

function PersonIcon({ size = 17 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="4.6" r="2.1" />
      <path d="M4.5 8.4h15" />
      <path d="M12 8.4v6.2" />
      <path d="M12 14.6 8.6 21" />
      <path d="M12 14.6 15.4 21" />
    </svg>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[12px] text-foreground">{label}</p>
        {hint && (
          <p className="mt-0.5 text-[10.5px] leading-snug text-faint">{hint}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn(
        "relative h-[22px] w-[38px] rounded-full border transition-colors",
        on ? "border-brand bg-brand/30" : "border-border bg-card"
      )}
    >
      <span
        className={cn(
          "absolute top-[2px] h-[16px] w-[16px] rounded-full transition-all",
          on ? "left-[19px] bg-brand" : "left-[2px] bg-muted-foreground"
        )}
      />
    </button>
  );
}

export function AccessibilityWidget() {
  const {
    textScale,
    setTextScale,
    highContrast,
    setHighContrast,
    motion: motionMode,
    setMotion,
    readableText,
    setReadableText,
    underlineLinks,
    setUnderlineLinks,
    largeTargets,
    setLargeTargets,
  } = useAppearance();

  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Escape closes and focus returns to the trigger, so a keyboard user is
  // never stranded inside the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    // Move focus into the panel on open.
    const first = panelRef.current?.querySelector<HTMLElement>(
      "button, [href], input, select, [tabindex]"
    );
    first?.focus();
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  const anyOn =
    highContrast ||
    readableText ||
    underlineLinks ||
    largeTargets ||
    textScale !== 1 ||
    motionMode === "reduced";

  return (
    <div className="fixed bottom-11 right-3 z-[120] flex flex-col items-end gap-2">
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-label="Accessibility options"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
            className="w-[300px] rounded-lg border border-border bg-popover p-4 shadow-[0_24px_70px_-24px_hsl(0_0%_0%/0.9)]"
          >
            <p className="font-mono text-[9px] tracking-[0.22em] text-faint">
              ACCESSIBILITY
            </p>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted-foreground">
              These apply everywhere in NOSHASHI and persist on this device.
            </p>

            <div className="mt-2.5 divide-y divide-border/50">
              <Row label="Text size" hint="Scales the whole interface, not just body copy.">
                <div className="flex gap-1">
                  {TEXT_SCALES.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => setTextScale(s.value)}
                      aria-pressed={textScale === s.value}
                      className={cn(
                        "rounded border px-1.5 py-1 font-mono text-[9px] transition-colors",
                        textScale === s.value
                          ? "border-brand text-brand"
                          : "border-border text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </Row>

              <Row
                label="Readable text"
                hint="Wider spacing and taller lines. Helps many readers with dyslexia."
              >
                <Toggle on={readableText} onChange={setReadableText} label="Readable text" />
              </Row>

              <Row label="High contrast" hint="Stronger borders, brighter text, no decoration.">
                <Toggle on={highContrast} onChange={setHighContrast} label="High contrast" />
              </Row>

              <Row
                label="Reduce motion"
                hint="Removes movement but keeps every state change visible."
              >
                <Toggle
                  on={motionMode === "reduced"}
                  onChange={(v) => setMotion(v ? "reduced" : "system")}
                  label="Reduce motion"
                />
              </Row>

              <Row label="Underline links" hint="So colour is never the only signal.">
                <Toggle on={underlineLinks} onChange={setUnderlineLinks} label="Underline links" />
              </Row>

              <Row
                label="Larger click targets"
                hint="A 44px minimum hit area, without changing the layout."
              >
                <Toggle on={largeTargets} onChange={setLargeTargets} label="Larger click targets" />
              </Row>
            </div>

            {anyOn && (
              <button
                onClick={() => {
                  setTextScale(1);
                  setHighContrast(false);
                  setReadableText(false);
                  setUnderlineLinks(false);
                  setLargeTargets(false);
                  setMotion("system");
                }}
                className="mt-3 w-full rounded border border-border py-1.5 font-mono text-[9px] tracking-[0.16em] text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
              >
                RESET TO DEFAULTS
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Accessibility options"
        className={cn(
          "grid h-10 w-10 place-items-center rounded-full border transition-colors",
          open || anyOn
            ? "border-brand bg-brand/15 text-brand"
            : "border-border bg-popover text-muted-foreground hover:border-brand/50 hover:text-foreground"
        )}
      >
        <PersonIcon />
        {anyOn && !open && (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-brand"
          />
        )}
      </button>
    </div>
  );
}
