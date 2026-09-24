import { useState } from "react";
import { Button } from "@/components/ui/button";
import { investigateIssuer, investigationPrompt } from "@/lib/agent/investigate";
import { useHandoff } from "@/lib/nav/handoff";
import type { SceneId } from "@/App";

/**
 * One-click issuer investigation from any screen that names an issuer:
 * reads the issuer's authority certificate and obligations from validated
 * state, then opens the agent with every finding as one question.
 */
export function InvestigateIssuerButton({ issuer, from, className }: { issuer: string; from: SceneId; className?: string }) {
  const handOff = useHandoff();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      handOff({ scene: "agent", from, value: investigationPrompt(await investigateIssuer(issuer)), as: "issuer investigation" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The issuer could not be read.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className={className}>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void run()}>
        {busy ? "INVESTIGATING…" : "INVESTIGATE ISSUER"}
      </Button>
      {error && <span className="mt-1 block text-[10px] text-no-go">{error}</span>}
    </span>
  );
}
