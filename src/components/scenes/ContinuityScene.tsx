import { useEffect, useRef } from "react";
import { mountDesk } from "@/continuity/desk.js";
import "@/continuity/review.css";
import { saveTextFile } from "@/lib/export";

export default function ContinuityScene() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    mountDesk(element, (name, body) => saveTextFile(name, body, "application/json"));
    return () => element.replaceChildren();
  }, []);
  return <div className="continuity-review" ref={root} />;
}
