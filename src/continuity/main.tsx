import React from "react";
import { createRoot } from "react-dom/client";
import ContinuityScene from "@/components/scenes/ContinuityScene";
import { ErrorBoundary } from "@/components/nova/ErrorBoundary";
import "@/index.css";

const root = document.getElementById("continuity-root");
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <ErrorBoundary scope="Continuity preview">
        <ContinuityScene />
      </ErrorBoundary>
    </React.StrictMode>,
  );
}
