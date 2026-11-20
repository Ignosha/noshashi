import { useEffect, useRef, useState } from "react";
import { mountDesk } from "@/continuity/desk.js";
import "@/continuity/review.css";
import { saveTextFile } from "@/lib/export";
import { ContinuityAccess } from "./ContinuityAccess";
import { Button } from "@/components/ui/button";

function IssuerReview() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    mountDesk(element, (name, body) => saveTextFile(name, body, "application/json"));
    return () => element.replaceChildren();
  }, []);
  return <div className="continuity-review" ref={root} />;
}

export default function ContinuityScene() {
  const [tool, setTool] = useState("issuer");
  return <div className="h-full flex flex-col">
    <nav aria-label="Continuity workspaces" className="flex flex-wrap gap-2 border-b p-3">
      <Button variant={tool === "issuer" ? "default" : "outline"} aria-pressed={tool === "issuer"} onClick={() => setTool("issuer")}>Issuer review sample</Button>
      <Button variant={tool === "access" ? "default" : "outline"} aria-pressed={tool === "access"} onClick={() => setTool("access")}>Access forecast & rule impact</Button>
    </nav>
    <div className="min-h-0 flex-1">
      <div hidden={tool !== "issuer"} className="h-full"><IssuerReview /></div>
      <div hidden={tool !== "access"} className="h-full"><ContinuityAccess /></div>
    </div>
  </div>;
}
