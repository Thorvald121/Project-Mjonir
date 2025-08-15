"use client";

import { useEffect } from "react";

export default function LogoutPage() {
  useEffect(() => {
    try { localStorage.removeItem("token"); } catch {}
    window.location.href = "/auth/login";
  }, []);
  return <div>Logging out…</div>;
}
