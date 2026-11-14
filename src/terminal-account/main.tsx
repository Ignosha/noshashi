import React from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "@/lib/auth/useAuth";
import { Account } from "./Account";
import "./account.css";
const mount = document.getElementById("terminal-account");
if (mount)
  createRoot(mount).render(
    <React.StrictMode>
      <AuthProvider>
        <Account />
      </AuthProvider>
    </React.StrictMode>,
  );
