"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Me = { id: string; email: string; role: "ADMIN" | "AGENT" | "CLIENT" };
type Ticket = { id: string; title: string; status: string; priority: string; createdAt: string };

export default function PortalHome() {
  const [me, setMe] = useState<Me | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"LOW"|"MEDIUM"|"HIGH"|"URGENT">("MEDIUM");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const user = await api<Me>("/auth/me");
        setMe(user);
        if (user.role !== "CLIENT") {
          // Agents/Admins shouldn't use the Client Portal
          window.location.href = "/tickets";
          return;
        }
        const list = await api<Ticket[]>("/portal/tickets");
        setTickets(list);
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function create() {
    try {
      setBusy(true);
      setErr(null);
      if (!title.trim() || !description.trim()) throw new Error("Please fill in both title and description.");
      const t = await api<Ticket>("/portal/tickets", {
        method: "POST",
        body: JSON.stringify({ title, description, priority }),
      });
      setTickets([t, ...tickets]);
      setTitle(""); setDescription(""); setPriority("MEDIUM");
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div>Loading…</div>;
  if (!me) return <div>Loading…</div>;
  if (me.role !== "CLIENT") return <div>Redirecting…</div>;

  return (
    <div className="grid" style={{ maxWidth: 900, margin: "0 auto" }}>
      <h2>Client Portal</h2>

      {err && <div className="card" style={{ borderColor:"#3a1f2b", background:"#1a0e14", color:"#ff7694" }}>{err}</div>}

      <div className="card grid">
        <b>Create a Ticket</b>
        <input placeholder="Title" value={title} onChange={(e)=>setTitle(e.target.value)} />
        <textarea placeholder="Describe the issue…" rows={4} value={description} onChange={(e)=>setDescription(e.target.value)} />
        <div className="row" style={{ gap: ".5rem" }}>
          <label>Priority</label>
          <select value={priority} onChange={(e)=>setPriority(e.target.value as any)}>
            <option value="LOW">LOW</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
            <option value="URGENT">URGENT</option>
          </select>
          <button onClick={create} disabled={busy}>{busy ? "Creating…" : "Create Ticket"}</button>
        </div>
      </div>

      <div className="grid" style={{ gap: "0.75rem" }}>
        <b>My Tickets</b>
        {tickets.length === 0 ? (
          <div className="card" style={{ opacity: .7 }}>No tickets yet.</div>
        ) : tickets.map(t => (
          <a key={t.id} href={`/portal/tickets/${t.id}`} className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <b>{t.title}</b>
                <div style={{ opacity: .7, fontSize: 12 }}>{new Date(t.createdAt).toLocaleString()}</div>
              </div>
              <div className="row" style={{ gap: ".5rem" }}>
                <span>{t.priority}</span>
                <span>{t.status}</span>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
