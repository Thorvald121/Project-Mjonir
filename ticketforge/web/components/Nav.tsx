"use client";

import Link from "next/link";
import { useEffect, useState, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";

type Me = { id: string; email: string; role: "ADMIN" | "AGENT" | "CLIENT" };

export default function Nav() {
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  // prevent concurrent /auth/me calls and re-requests on same path
  const fetchingRef = useRef(false);
  const lastPathRef = useRef<string | null>(null);

  const refresh = useCallback(async (force = false) => {
    // Don’t ping auth when viewing /auth/* routes
    if (pathname.startsWith("/auth")) {
      setMe(null);
      setLoading(false);
      return;
    }

    // If there’s no token, we’re effectively logged out
    let token: string | null = null;
    try { token = localStorage.getItem("token"); } catch {}
    if (!token) {
      setMe(null);
      setLoading(false);
      return;
    }

    // Only fetch once per path unless forced (e.g., after login/logout)
    if (!force && lastPathRef.current === pathname) {
      setLoading(false);
      return;
    }
    if (fetchingRef.current) return;

    fetchingRef.current = true;
    try {
      setLoading(true);
      const user = await api<Me>("/auth/me");
      setMe(user);
      lastPathRef.current = pathname;
    } catch {
      setMe(null);
      lastPathRef.current = pathname;
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  }, [pathname]);

  // Fetch once per route change
  useEffect(() => { void refresh(); }, [refresh]);

  // Explicitly refresh when login/logout broadcasts the event
  useEffect(() => {
    const handler = () => refresh(true);
    window.addEventListener("ticketforge-auth", handler);
    return () => window.removeEventListener("ticketforge-auth", handler);
  }, [refresh]);

  // Minimal loading header to avoid flicker
  if (loading) {
    return (
      <div className="row" style={{ gap: "1rem" }}>
        <Link href="/">TicketForge</Link>
      </div>
    );
  }

  // Logged out or on /auth/*
  if (!me) {
    return (
      <div className="row" style={{ gap: "1rem" }}>
        <Link href="/">TicketForge</Link>
        <Link href="/portal">Client Portal</Link>
      </div>
    );
  }

  if (me.role === "CLIENT") {
    return (
      <div className="row" style={{ gap: "1rem" }}>
        <Link href="/">TicketForge</Link>
        <Link href="/portal">Client Portal</Link>
      </div>
    );
  }

  // ADMIN / AGENT
  return (
    <div className="row" style={{ gap: "1rem" }}>
      <Link href="/">TicketForge</Link>
      <Link href="/tickets">Tickets</Link>
      {me.role === "ADMIN" && <Link href="/invoices">Invoices</Link>}
      {me.role === "ADMIN" && <Link href="/settings">Settings</Link>}
    </div>
  );
}
