import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { installErrorLog } from "@/lib/support/errorLog";

// Keeps a scrubbed, on-device record of crashes for support tickets.
installErrorLog();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
