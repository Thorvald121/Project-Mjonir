"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function HeaderAuth() {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    try { setAuthed(!!localStorage.getItem("token")); } catch { setAuthed(false); }
  }, []);

  function logout() {
    try { localStorage.removeItem("token"); } catch {}
    // tell the app nav to refresh
    try { window.dispatchEvent(new Event("ticketforge-auth")); } catch {}
    setTimeout(() => { window.location.href = "/auth/login"; }, 50);
  }

  if (!authed) return <Link href="/auth/login">Login</Link>;
  return <button onClick={logout}>Logout</button>;
}
