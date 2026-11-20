import { useState } from "react";
import { ContinuityAccess } from "./ContinuityAccess";
import { ContinuityIssuer } from "./ContinuityIssuer";
import { ContinuityRecords } from "./ContinuityRecords";
import "./continuity.css";

const workspaces = [
  { id: "change", label: "Change rehearsal" },
  { id: "issuer", label: "Issuer offboarding" },
  { id: "bridge", label: "Bridge records" },
  { id: "lending", label: "Lending exposure" },
] as const;

export default function ContinuityScene() {
  const [tool, setTool] = useState<string>("change");
  return (
    <div className="ct-app">
      <header className="ct-masthead">
        <div>
          <h1>NOSHASHI Continuity</h1>
          <p>Review changes, exceptions and follow-up work</p>
        </div>
        <span className="text-xs text-muted-foreground">
          Development preview
        </span>
      </header>
      <div className="ct-shell">
        <nav className="ct-nav" aria-label="Continuity workspaces">
          {workspaces.map((workspace) => (
            <button
              key={workspace.id}
              aria-current={tool === workspace.id ? "page" : undefined}
              onClick={() => setTool(workspace.id)}
            >
              {workspace.label}
            </button>
          ))}
        </nav>
        <div className="ct-main">
          <div hidden={tool !== "change"}>
            <ContinuityAccess />
          </div>
          <div hidden={tool !== "issuer"}>
            <ContinuityIssuer />
          </div>
          <div hidden={tool !== "bridge"}>
            <ContinuityRecords mode="bridge" />
          </div>
          <div hidden={tool !== "lending"}>
            <ContinuityRecords mode="lending" />
          </div>
        </div>
      </div>
    </div>
  );
}
