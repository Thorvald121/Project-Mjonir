"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";

export default function TicketDetail() {
  const params = useParams<{ id: string }>();
  const [ticket,setTicket] = useState<any>(null);
  const [comment,setComment] = useState("");
  const [minutes,setMinutes] = useState(15);
  const [notes,setNotes] = useState("");

  async function load() {
    const t = await api<any>(`/tickets/${params.id}`);
    setTicket(t);
  }
  useEffect(() => { load(); },[]);

  async function addComment() {
    await api(`/tickets/${params.id}/comments`, { method:"POST", body: JSON.stringify({ body: comment, isPublic: true }) });
    setComment(""); await load();
  }

  async function addTime() {
    const userId = ticket?.requesterId ?? ticket?.assigneeId ?? null;
    if(!userId) { alert("No user to attach time to (seed a user and assign)."); return; }
    await api(`/tickets/${params.id}/time-entries`, { method:"POST", body: JSON.stringify({ userId, minutes: Number(minutes), notes }) });
    setNotes(""); await load();
  }

  if(!ticket) return <div>Loading…</div>;

  return (
    <div className="grid" style={{maxWidth:900, margin:"0 auto"}}>
      <h2>{ticket.title}</h2>
      <div className="card">
        <p>{ticket.description}</p>
        <div className="row" style={{gap:"1rem"}}>
          <span>Status: <b>{ticket.status}</b></span>
          <span>Priority: <b>{ticket.priority}</b></span>
        </div>
      </div>

      <div className="grid" style={{gridTemplateColumns:"1fr 1fr", gap:"1rem"}}>
        <div className="card">
          <b>Comments</b>
          <div className="grid">
            {ticket.comments.map((c: any) => (
              <div key={c.id} className="card"><div>{c.body}</div><div style={{opacity:.6, fontSize:12}}>{new Date(c.createdAt).toLocaleString()}</div></div>
            ))}
          </div>
          <div className="row" style={{marginTop:".5rem"}}>
            <input placeholder="Add a comment…" value={comment} onChange={e=>setComment(e.target.value)} />
            <button onClick={addComment} disabled={!comment}>Post</button>
          </div>
        </div>
        <div className="card">
          <b>Time Entries</b>
          <div className="grid">
            {ticket.timeEntries.map((te: any) => (
              <div key={te.id} className="card"><div>{te.minutes} min — {te.notes ?? "no notes"}</div><div style={{opacity:.6, fontSize:12}}>{new Date(te.createdAt).toLocaleString()}</div></div>
            ))}
          </div>
          <div className="row" style={{marginTop:".5rem"}}>
            <input type="number" min={1} value={minutes} onChange={e=>setMinutes(Number(e.target.value))} />
            <input placeholder="Notes" value={notes} onChange={e=>setNotes(e.target.value)} />
            <button onClick={addTime}>Add Time</button>
          </div>
        </div>
      </div>
    </div>
  );
}
