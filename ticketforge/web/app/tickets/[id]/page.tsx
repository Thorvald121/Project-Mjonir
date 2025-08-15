"use client";
import { useEffect, useState, useRef } from "react";
import { api, API_BASE } from "@/lib/api";
import SlaBadge from "@/components/SlaBadge";
import CannedReplyPicker from "@/components/CannedReplyPicker";

type Ticket = {
  id: string; title: string; description: string;
  status: "OPEN"|"IN_PROGRESS"|"RESOLVED"|"CLOSED";
  priority: "LOW"|"MEDIUM"|"HIGH"|"URGENT";
  createdAt: string;
  requester?: { id: string; name?: string|null; email?: string|null } | null;
  assignee?: { id: string; name?: string|null; email?: string|null } | null;
  attachments?: { id:string; filename:string; mime:string; size:number; createdAt:string }[];
  comments?: { id:string; body:string; isPublic:boolean; authorId?:string|null; createdAt:string }[];
  timeEntries?: { id:string; minutes:number; notes?:string|null; createdAt:string }[];
  computedSla?: {
    first: { msRemaining: number | null; breached: boolean };
    resolution: { msRemaining: number | null; breached: boolean };
  };
};

export default function TicketDetail({ params }: { params: { id: string } }) {
  const [t, setT] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  async function load() {
    setLoading(true); setErr(null);
    try { setT(await api(`/tickets/${params.id}`)); }
    catch (e: any) { setErr(e.message || "Failed"); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [params.id]);

  async function addComment(isPublic: boolean) {
    const body = noteRef.current?.value?.trim();
    if (!body) return;
    await api(`/tickets/${params.id}/comments`, { method: "POST", body: JSON.stringify({ body, isPublic }) });
    if (noteRef.current) noteRef.current.value = "";
    await load();
  }

  async function addTime(minutes: number, notes?: string) {
    await api(`/tickets/${params.id}/time-entries`, {
      method: "POST",
      body: JSON.stringify({ minutes, notes }),
    });
    await load();
  }

  async function setAssignee(assigneeId: string | null) {
    await api(`/tickets/${params.id}`, { method: "PATCH", body: JSON.stringify({ assigneeId }) });
    await load();
  }

  async function setStatus(status: Ticket["status"]) {
    await api(`/tickets/${params.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    await load();
  }

  if (loading) return <div className="p-6">Loading…</div>;
  if (err) return <div className="p-6 text-red-600">{err}</div>;
  if (!t) return <div className="p-6">Not found</div>;

  return (
    <div className="grid grid-cols-12 gap-4 p-4">
      {/* LEFT META */}
      <aside className="col-span-3 space-y-3">
        <div className="border rounded p-3">
          <div className="font-semibold">{t.title}</div>
          <div className="text-sm opacity-70">{new Date(t.createdAt).toLocaleString()}</div>
        </div>
        <div className="border rounded p-3 space-y-2">
          <div className="flex gap-2 items-center">
            <span className="px-2 py-0.5 rounded border">{t.status}</span>
            <span className="px-2 py-0.5 rounded border">{t.priority}</span>
          </div>
          {t.computedSla?.first && (
            <SlaBadge msRemaining={t.computedSla.first.msRemaining ?? null} label="First response" />
          )}
          {t.computedSla?.resolution && (
            <SlaBadge msRemaining={t.computedSla.resolution.msRemaining ?? null} label="Resolution" />
          )}
          <div className="text-sm opacity-80">
            <div>Requester: {t.requester?.email || "—"}</div>
            <div>Assignee: {t.assignee?.name || "Unassigned"}</div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStatus("OPEN")} className="px-2 py-1 rounded border">Open</button>
            <button onClick={() => setStatus("IN_PROGRESS")} className="px-2 py-1 rounded border">In Progress</button>
            <button onClick={() => setStatus("RESOLVED")} className="px-2 py-1 rounded border">Resolve</button>
            <button onClick={() => setStatus("CLOSED")} className="px-2 py-1 rounded border">Close</button>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setAssignee(null)} className="px-2 py-1 rounded border">Unassign</button>
          </div>
        </div>
        <div className="border rounded p-3">
          <div className="font-semibold mb-2">Attachments</div>
          {!t.attachments?.length && <div className="opacity-70 text-sm">No attachments</div>}
          {t.attachments?.map(a => (
            <div key={a.id} className="flex items-center justify-between text-sm">
              <a href={`${API_BASE}/files/${a.id}`} target="_blank" rel="noreferrer">{a.filename}</a>
              <span className="opacity-60">{Math.round(a.size/1024)} KB</span>
            </div>
          ))}
        </div>
      </aside>

      {/* CENTER TIMELINE */}
      <main className="col-span-6 space-y-3">
        <div className="border rounded p-3">
          <div className="font-semibold mb-2">Timeline</div>
          <div className="space-y-3">
            {t.comments?.map(c => (
              <div key={c.id} className="p-2 rounded border">
                <div className="flex items-center justify-between text-xs opacity-70">
                  <span>{c.isPublic ? "Public" : "Internal note"}</span>
                  <span>{new Date(c.createdAt).toLocaleString()}</span>
                </div>
                <div className="mt-1 whitespace-pre-wrap">{c.body}</div>
              </div>
            ))}
            {!t.comments?.length && <div className="opacity-70 text-sm">No updates yet.</div>}
          </div>
        </div>

        <div className="border rounded p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Add update</div>
            <CannedReplyPicker onPick={(body) => {
              if (noteRef.current) noteRef.current.value = (noteRef.current.value || "") + (noteRef.current.value ? "\n\n" : "") + body;
            }} />
          </div>
          <textarea ref={noteRef} rows={5} className="w-full border rounded p-2" placeholder="Type your note…"></textarea>
          <div className="flex gap-2">
            <button onClick={() => addComment(true)} className="px-3 py-1 rounded border">Add public reply</button>
            <button onClick={() => addComment(false)} className="px-3 py-1 rounded border">Add internal note</button>
          </div>
        </div>
      </main>

      {/* RIGHT ACTIONS */}
      <aside className="col-span-3 space-y-3">
        <div className="border rounded p-3 space-y-2">
          <div className="font-semibold">Log time</div>
          <TimeQuickAdd onAdd={addTime} />
        </div>
        <div className="border rounded p-3">
          <div className="font-semibold mb-2">Quick actions</div>
          <div className="text-sm opacity-80">Remote session (coming soon)</div>
        </div>
      </aside>
    </div>
  );
}

function TimeQuickAdd({ onAdd }: { onAdd: (mins: number, notes?: string) => void }) {
  const [mins, setMins] = useState(15);
  const [notes, setNotes] = useState("");
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input type="number" value={mins} onChange={(e) => setMins(parseInt(e.target.value || "0", 10))} className="w-20 border rounded p-1" />
        <span className="text-sm opacity-70">minutes</span>
      </div>
      <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full border rounded p-1" placeholder="optional notes" />
      <button onClick={() => onAdd(mins, notes || undefined)} className="px-3 py-1 rounded border">Add time</button>
    </div>
  );
}
