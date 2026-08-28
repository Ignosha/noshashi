import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "./utils";
import { SPRING } from "./motion";
import type { Status } from "./xrpl/types";

export type ToastTone = Status | "info";

export type Toast = {
  id: number;
  title: string;
  body?: string;
  tone: ToastTone;
  /** Milliseconds before auto-dismiss; 0 pins the toast open. */
  ttl: number;
};

type ToastInput = Omit<Toast, "id" | "tone" | "ttl"> &
  Partial<Pick<Toast, "tone" | "ttl">>;

const ToastContext = createContext<{
  push: (toast: ToastInput) => number;
  dismiss: (id: number) => void;
} | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      const id = nextId++;
      const toast: Toast = {
        id,
        title: input.title,
        body: input.body,
        tone: input.tone ?? "info",
        ttl: input.ttl ?? 4200,
      };
      // Keep the stack shallow — the newest four are the useful ones.
      setToasts((prev) => [toast, ...prev].slice(0, 4));
      if (toast.ttl > 0) {
        window.setTimeout(() => dismiss(id), toast.ttl);
      }
      return id;
    },
    [dismiss]
  );

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>");
  return context;
}

const toneAccent: Record<ToastTone, string> = {
  go: "bg-go",
  hold: "bg-hold",
  "no-go": "bg-no-go",
  info: "bg-foreground",
};

const toneText: Record<ToastTone, string> = {
  go: "text-go",
  hold: "text-hold",
  "no-go": "text-no-go",
  info: "text-foreground",
};

function Toaster({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="pointer-events-none fixed bottom-9 right-4 z-[80] flex w-[300px] flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, x: 24, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 24, scale: 0.96 }}
            transition={SPRING}
            className="pointer-events-auto relative flex gap-3 border border-border bg-popover/95 p-3 backdrop-blur"
          >
            <span className={cn("w-0.5 shrink-0", toneAccent[toast.tone])} />
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "stencil text-[10px] tracking-[0.2em]",
                  toneText[toast.tone]
                )}
              >
                {toast.title}
              </p>
              {toast.body && (
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  {toast.body}
                </p>
              )}
            </div>
            <button
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="h-4 w-4 shrink-0 text-muted-foreground transition-colors hover:text-foreground"
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
