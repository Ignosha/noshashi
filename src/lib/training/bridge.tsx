import { useEffect } from "react";
import type { SceneId } from "@/App";
import { useHandoff } from "@/lib/nav/handoff";
import { trainingGuard } from "./guard";
import { FROM_WORKSTATION, isOpenScreen, type WorkstationEvent } from "./protocol";

type Payload = WorkstationEvent extends infer E ? (E extends unknown ? Omit<E, "source"> : never) : never;

function post(event: Payload): void {
  if (window.parent === window) return;
  window.parent.postMessage({ source: FROM_WORKSTATION, ...event }, window.location.origin);
}

/**
 * The training copy's side of the Academy link (src/lib/training/protocol.ts).
 *
 * Opens the screen a lab step names, with its value handed over exactly as
 * NOSHASHI's own Labs panel does, and tells the Academy which screen is
 * showing and what was read, so the lab can tick off what the trainee did.
 * Rendered only in the training edition.
 */
export function TrainingBridge({ scene, onNavigate }: { scene: SceneId; onNavigate: (scene: string) => void }) {
  const handOff = useHandoff();

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || event.origin !== window.location.origin) return;
      if (!isOpenScreen(event.data)) return;
      const { scene: target, value, as, view } = event.data;
      if (value) handOff({ scene: target as SceneId, value, as, view });
      else onNavigate(target);
    };
    window.addEventListener("message", onMessage);
    post({ type: "ready" });
    return () => window.removeEventListener("message", onMessage);
  }, [handOff, onNavigate]);

  useEffect(() => {
    post({ type: "scene", scene });
  }, [scene]);

  useEffect(
    () =>
      trainingGuard().on((event) =>
        event.kind === "read"
          ? post({ type: "read", command: event.command, values: event.values, paid: event.paid })
          : post({ type: "blocked", command: event.command, value: event.value })
      ),
    []
  );

  return null;
}
