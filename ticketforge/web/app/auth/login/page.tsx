"use client";

import { useState } from "react";
import { api } from "@/lib/api";

type Me = { id: string; email: string; role: "ADMIN" | "AGENT" | "CLIENT" };

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setBusy(true);
      setErr(null);

      // Login
      const resp = await api<{ token: string; user: any }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      // Save token
      localStorage.setItem("token", resp.token);
      try { window.dispatchEvent(new Event("ticketforge-auth")); } catch {}

      // Fetch role and redirect accordingly
      const me = await api<Me>("/auth/me");
      if (me.role === "CLIENT") {
        window.location.href = "/portal";
      } else {
        window.location.href = "/tickets";
      }
    } catch (e: any) {
      setErr(e?.message ?? "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid" style={{ maxWidth: 420, margin: "3rem auto" }}>
      <h2>Login</h2>
      {err && <div className="card" style={{ borderColor:"#3a1f2b", background:"#1a0e14", color:"#ff7694" }}>{err}</div>}
      <form onSubmit={onSubmit} className="grid">
        <input
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e)=>setEmail(e.target.value)}
          autoFocus
        />
        <input
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e)=>setPassword(e.target.value)}
        />
        <button type="submit" disabled={busy || !email || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
