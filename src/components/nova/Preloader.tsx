import { useEffect, useRef } from "react";
import { NovaLogo } from "./NovaLogo";

/** A brief launch transition. Connectivity is reported by the real status rail. */
export function Preloader({ onDone }: { onDone: () => void }) {
  const done = useRef(false);
  useEffect(() => {
    const finish = () => {
      if (!done.current) {
        done.current = true;
        onDone();
      }
    };
    const timer = window.setTimeout(finish, 220);
    window.addEventListener("keydown", finish);
    window.addEventListener("pointerdown", finish);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", finish);
      window.removeEventListener("pointerdown", finish);
    };
  }, [onDone]);
  return (
    <div
      className="fixed inset-0 z-100 grid place-items-center bg-background"
      role="status"
      aria-label="Opening the Ledger Desk"
    >
      <div className="flex flex-col items-center gap-6">
        <NovaLogo size={48} animated={false} />
        <span className="desk-wordmark">NOSHASHI</span>
        <p className="desk-kicker">Opening the Ledger Desk</p>
      </div>
    </div>
  );
}
