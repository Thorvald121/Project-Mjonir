import { notFound, redirect } from "next/navigation";
import { prisma } from "@ticketforge/db";
import { Shell } from "@/components/Shell";
import { TicketStatusPill } from "@/components/TicketStatusPill";
import { SlaPill } from "@/components/SlaPill";
import { getSessionUser } from "@/lib/server/session";
import { getTicketById } from "@/lib/server/tickets";
import { TicketDetailActions } from "./ticket-detail-actions";

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const [ticket, agents] = await Promise.all([
    getTicketById(id, user.organizationId),
    prisma.user.findMany({ where: { organizationId: user.organizationId }, orderBy: { name: "asc" } })
  ]);

  if (!ticket) notFound();

  return (
    <Shell>
      <div className="pageHeader">
        <div>
          <p className="eyebrow">Ticket #{ticket.ticketNumber}</p>
          <h2>{ticket.title}</h2>
        </div>
        <div className="row">
          <TicketStatusPill value={ticket.status} />
          <span className="pill">{ticket.priority}</span>
          <SlaPill label="First response" msRemaining={ticket.sla.firstResponse?.msRemaining} />
          <SlaPill label="Resolution" msRemaining={ticket.sla.resolution?.msRemaining} />
        </div>
      </div>

      <div className="split">
        <section className="stack">
          <article className="card">
            <p className="muted">Description</p>
            <p>{ticket.description}</p>
          </article>
          <article className="card">
            <p className="muted">Conversation</p>
            <div className="timeline">
              {ticket.comments.map((comment) => (
                <div key={comment.id} className="timelineItem">
                  <div className="row">
                    <strong>{comment.author?.name ?? "System"}</strong>
                    <span className="pill">{comment.isInternal ? "Internal note" : "Public reply"}</span>
                    <span className="muted">{new Date(comment.createdAt).toLocaleString()}</span>
                  </div>
                  <p>{comment.body}</p>
                </div>
              ))}
            </div>
          </article>
          <article className="card">
            <p className="muted">Activity</p>
            <div className="timeline">
              {ticket.activities.map((activity) => (
                <div key={activity.id} className="timelineItem">
                  <div className="row">
                    <strong>{activity.actor?.name ?? "System"}</strong>
                    <span className="muted">{new Date(activity.createdAt).toLocaleString()}</span>
                  </div>
                  <p>{activity.message}</p>
                </div>
              ))}
            </div>
          </article>
        </section>

        <aside className="stack">
          <article className="card stack">
            <div>
              <p className="muted">Assignee</p>
              <strong>{ticket.assignee?.name ?? "Unassigned"}</strong>
            </div>
            <div>
              <p className="muted">Requester</p>
              <strong>{ticket.contact?.name ?? ticket.requester?.name ?? "Internal"}</strong>
            </div>
            <div>
              <p className="muted">Logged time</p>
              <strong>{ticket.timeEntries.reduce((sum, entry) => sum + entry.minutes, 0)} min</strong>
            </div>
          </article>
          <TicketDetailActions ticketId={ticket.id} currentStatus={ticket.status} currentPriority={ticket.priority} currentAssigneeId={ticket.assigneeId} agents={agents.map((agent) => ({ id: agent.id, name: agent.name }))} />
        </aside>
      </div>
    </Shell>
  );
}
