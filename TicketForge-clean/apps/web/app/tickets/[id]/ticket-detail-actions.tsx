"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";

export function TicketDetailActions({
  ticketId,
  currentStatus,
  currentPriority,
  currentAssigneeId,
  agents
}: {
  ticketId: string;
  currentStatus: string;
  currentPriority: string;
  currentAssigneeId: string | null;
  agents: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [timeMinutes, setTimeMinutes] = useState("15");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshAfter(task: Promise<unknown>) {
    try {
      setBusy(true);
      setError(null);
      await task;
      setComment("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <article className="card form">
        <h3>Update ticket</h3>
        <div className="formRow">
          <label>Status</label>
          <select defaultValue={currentStatus} onChange={(event) => refreshAfter(api(`/api/tickets/${ticketId}`, { method: "PATCH", body: JSON.stringify({ status: event.target.value }) }))}>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="WAITING_ON_CUSTOMER">Waiting on customer</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>
        <div className="formRow">
          <label>Priority</label>
          <select defaultValue={currentPriority} onChange={(event) => refreshAfter(api(`/api/tickets/${ticketId}`, { method: "PATCH", body: JSON.stringify({ priority: event.target.value }) }))}>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
        </div>
        <div className="formRow">
          <label>Assignee</label>
          <select defaultValue={currentAssigneeId ?? ""} onChange={(event) => refreshAfter(api(`/api/tickets/${ticketId}`, { method: "PATCH", body: JSON.stringify({ assigneeId: event.target.value || null }) }))}>
            <option value="">Unassigned</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>{agent.name}</option>
            ))}
          </select>
        </div>
      </article>

      <article className="card form">
        <h3>Add note</h3>
        <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Write an update, internal note, or reply." />
        <div className="row">
          <button disabled={busy || !comment.trim()} onClick={() => refreshAfter(api("/api/ticket-comments", { method: "POST", body: JSON.stringify({ ticketId, body: comment, isInternal: false }) }))}>Add public reply</button>
          <button disabled={busy || !comment.trim()} onClick={() => refreshAfter(api("/api/ticket-comments", { method: "POST", body: JSON.stringify({ ticketId, body: comment, isInternal: true }) }))}>Add internal note</button>
        </div>
      </article>

      <article className="card form">
        <h3>Log time</h3>
        <input value={timeMinutes} onChange={(event) => setTimeMinutes(event.target.value)} type="number" min="1" />
        <button disabled={busy} onClick={() => refreshAfter(api("/api/ticket-time", { method: "POST", body: JSON.stringify({ ticketId, minutes: Number(timeMinutes) }) }))}>Log minutes</button>
      </article>

      {error ? <div className="pill pillDanger">{error}</div> : null}
    </div>
  );
}
