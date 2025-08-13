"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Ticket = {
  id: string; title: string; status: string; priority: string; createdAt: string;
  client?: { name: string | null }
};

export default function TicketsPage(){
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [title,setTitle] = useState("");
  const [description,setDescription] = useState("");
  const [orgId,setOrgId] = useState<string>("");
  const [ai,setAi] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const list = await api<Ticket[]>("/tickets");
      setTickets(list);
      const orgs = await api<any[]>("/orgs");
      if (orgs[0]?.id) setOrgId(orgs[0].id);
    })();
  },[]);

  async function create() {
    const t = await api<any>("/tickets", { method:"POST", body: JSON.stringify({ title, description, organizationId: orgId }) });
    setTickets([t, ...tickets]);
    setTitle(""); setDescription("");
  }
  async function suggest() {
    const data = await api<any>("/ai/suggest", { method:"POST", body: JSON.stringify({ title, description }) });
    setAi(data);
  }

  return (
  <div className="grid" style={{maxWidth:1000, margin:"0 auto"}}>
    <h2>Tickets</h2>
    <div className="card grid">
      <div className="grid" style={{gridTemplateColumns:"1fr 1fr", gap:"1rem"}}>
        <div className="grid">
          <input placeholder="Title" value={title} onChange={e=>setTitle(e.target.value)} />
          <textarea placeholder="Description" value={description} onChange={e=>setDescription(e.target.value)} rows={5} />
          <div className="row">
            <button onClick={create} disabled={!title || !orgId}>Create Ticket</button>
            <button onClick={suggest} disabled={!title && !description}>AI Suggest</button>
          </div>
        </div>
        <div className="card">
          <b>AI Suggestion</b>
          <pre style={{whiteSpace:"pre-wrap"}}>{ai ? JSON.stringify(ai, null, 2) : "—"}</pre>
        </div>
      </div>
    </div>

    <div className="grid">
      {tickets.map(t => (
        <a key={t.id} href={`/tickets/${t.id}`} className="card">
          <div className="row" style={{justifyContent:"space-between"}}>
            <div>
              <b>{t.title}</b>
              <div style={{opacity:.7, fontSize:12}}>{new Date(t.createdAt).toLocaleString()}</div>
            </div>
            <div className="row" style={{gap:".5rem"}}>
              <span>{t.priority}</span>
              <span>{t.status}</span>
              <span>{t.client?.name ?? ""}</span>
            </div>
          </div>
        </a>
      ))}
    </div>
  </div>);
}
