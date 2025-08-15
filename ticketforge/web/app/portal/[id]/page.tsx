"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";

export default function PortalTicket() {
  const params = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<any>(null);
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    const t = await api<any>(`/portal/tickets/${params.id}`);
    setTicket(t);
  }
  useEffect(() => { (async () => { try { await load(); } catch (e:any) { setErr(e?.message ?? String(e)); } })(); }, []);

  async function post() {
    try {
      setErr(null);
      await api(`/portal/tickets/${params.id}/comments`, { method:"POST", body: JSON.stringify({ body }) });
      setBody(""); await load();
    } catch (e:any) { setErr(e?.message ?? String(e)); }
  }

  if (!ticket) return <div>Loading…</div>;

  return (
    <div className="grid" style={{maxWidth:900, margin:"0 auto"}}>
      <h2>{ticket.title}</h2>
      {err && <div className="card" style={{ borderColor:"#3a1f2b", background:"#1a0e14", color:"#ff7694" }}>{err}</div>}
      <div className="card"><div style={{opacity:.9}}>{ticket.description}</div></div>

      <div className="card">
        <b>Public Comments</b>
        <div className="grid">
          {ticket.comments.map((c: any) => (
            <div key={c.id} className="card">
              <div>{c.body}</div>
              <div style={{opacity:.6, fontSize:12}}>{new Date(c.createdAt).toLocaleString()}</div>
            </div>
          ))}
        </div>
        <div className="row" style={{marginTop:".5rem"}}>
          <input placeholder="Write a reply…" value={body} onChange={e=>setBody(e.target.value)} />
          <button onClick={post} disabled={!body}>Post</button>
        </div>
      </div>
    </div>
  );
}
