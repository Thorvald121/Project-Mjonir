"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, apiUpload, API_BASE } from "@/lib/api";

type Me = { id: string; email: string; role: "ADMIN" | "AGENT" | "CLIENT" };

export default function PortalTicketDetail() {
  const { id } = useParams<{ id: string }>();
  const [me, setMe] = useState<Me | null>(null);
  const [ticket, setTicket] = useState<any>(null);
  const [comment, setComment] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  async function load() {
    const t = await api<any>(`/portal/tickets/${id}`);
    setTicket(t);
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const user = await api<Me>("/auth/me");
        setMe(user);
        if (user.role !== "CLIENT") { window.location.href = "/tickets"; return; }
        await load();
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      } finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function addComment() {
    try {
      setErr(null);
      await api(`/portal/tickets/${id}/comments`, { method: "POST", body: JSON.stringify({ body: comment }) });
      setComment("");
      await load();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }

  async function uploadAttachment() {
    if (!file) return;
    try {
      setUploading(true); setErr(null);
      const form = new FormData();
      form.append("file", file);
      await apiUpload(`/attachments/tickets/${id}`, form);
      setFile(null);
      await load();
    } catch (e: any) {
      setErr(`Upload failed: ${e?.message ?? String(e)}`);
    } finally { setUploading(false); }
  }

  if (loading) return <div>Loading…</div>;
  if (!me || !ticket) return <div>Not found</div>;

  const attachments = ticket.attachments ?? [];

  return (
    <div className="grid" style={{ maxWidth: 900, margin: "0 auto" }}>
      <h2>{ticket.title}</h2>
      {err && <div className="card" style={{ borderColor:"#3a1f2b", background:"#1a0e14", color:"#ff7694" }}>{err}</div>}

      <div className="card">
        <div style={{ marginBottom: ".5rem" }}>{ticket.description}</div>
        <div className="row" style={{ gap: "1rem", flexWrap: "wrap" }}>
          <span>Status: <b>{ticket.status}</b></span>
          <span>Priority: <b>{ticket.priority}</b></span>
          <span>Assignee: <b>{ticket.assignee?.name || ticket.assignee?.email || "—"}</b></span>
        </div>
      </div>

      <div className="card">
        <b>Attachments</b>
        <div className="grid" style={{ marginTop: ".5rem" }}>
          {attachments.length === 0 ? (
            <div style={{ opacity: .7 }}>No attachments yet.</div>
          ) : attachments.map((a: any) => (
            <div key={a.id} className="row" style={{ justifyContent: "space-between" }}>
              <a href={`${API_BASE}/files/${a.id}`} target="_blank" rel="noreferrer">{a.filename}</a>
              <span style={{ opacity: .7, fontSize: 12 }}>
                {(a.size/1024).toFixed(1)} KB • {new Date(a.createdAt).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: ".5rem" }}>
          <input type="file" onChange={(e)=>setFile(e.target.files?.[0] || null)} />
          <button onClick={uploadAttachment} disabled={!file || uploading}>{uploading ? "Uploading…" : "Upload"}</button>
        </div>
      </div>

      <div className="card">
        <b>Conversation</b>
        <div className="grid" style={{ marginTop: ".5rem" }}>
          {ticket.comments.length === 0 ? (
            <div style={{ opacity: .7 }}>No comments yet.</div>
          ) : ticket.comments.map((c: any) => (
            <div key={c.id} className="card">
              <div>{c.body}</div>
              <div style={{ opacity: .6, fontSize: 12 }}>{new Date(c.createdAt).toLocaleString()}</div>
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: ".5rem" }}>
          <input placeholder="Write a reply…" value={comment} onChange={(e)=>setComment(e.target.value)} />
          <button onClick={addComment} disabled={!comment.trim()}>Send</button>
        </div>
      </div>
    </div>
  );
}
