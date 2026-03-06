"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";

type Contact = { id: string; name: string; email: string };
type Agent = { id: string; name: string; email: string };

export function TicketCreateForm({ contacts, agents }: { contacts: Contact[]; agents: Agent[] }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    try {
      setSubmitting(true);
      setError(null);
      const payload = Object.fromEntries(formData.entries());
      const ticket = await api<{ id: string }>("/api/tickets", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      router.push(`/tickets/${ticket.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create ticket");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form action={onSubmit} className="card form">
      <div className="formRow">
        <label htmlFor="title">Title</label>
        <input id="title" name="title" required placeholder="VPN access still failing for new hire" />
      </div>
      <div className="formRow">
        <label htmlFor="description">Description</label>
        <textarea id="description" name="description" required placeholder="Include symptoms, affected users, and what changed." />
      </div>
      <div className="grid2">
        <div className="formRow">
          <label htmlFor="priority">Priority</label>
          <select id="priority" name="priority" defaultValue="MEDIUM">
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
        </div>
        <div className="formRow">
          <label htmlFor="assigneeId">Assignee</label>
          <select id="assigneeId" name="assigneeId" defaultValue="">
            <option value="">Unassigned</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>{agent.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="formRow">
        <label htmlFor="contactId">Requester contact</label>
        <select id="contactId" name="contactId" defaultValue="">
          <option value="">Internal requester</option>
          {contacts.map((contact) => (
            <option key={contact.id} value={contact.id}>{contact.name} — {contact.email}</option>
          ))}
        </select>
      </div>
      {error ? <div className="pill pillDanger">{error}</div> : null}
      <button type="submit" disabled={submitting}>{submitting ? "Creating..." : "Create ticket"}</button>
    </form>
  );
}
