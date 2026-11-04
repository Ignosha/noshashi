import React from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "@/lib/auth/useAuth";
import { Portal } from "./Portal";
import "./portal.css";
createRoot(document.getElementById("payment-portal")!).render(
  <React.StrictMode>
    <AuthProvider>
      <Portal />
    </AuthProvider>
  </React.StrictMode>,
);
