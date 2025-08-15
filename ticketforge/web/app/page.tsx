"use client";

import { useEffect } from "react";
import { api } from "@/lib/api";

type Me = { id: string; email: string; role: "ADMIN" | "AGENT" | "CLIENT" };

export default function Home() {
  useEffect(() => {
    (async () => {
      try {
        const me = await api<Me>("/auth/me");
        if (me.role === "CLIENT") window.location.href = "/portal";
        else window.location.href = "/tickets";
      } catch {
        window.location.href = "/auth/login";
      }
    })();
  }, []);
  return <div>Loading…</div>;
}
