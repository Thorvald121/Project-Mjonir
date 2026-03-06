import Link from "next/link";
import { TicketStatusPill } from "./TicketStatusPill";
import { SlaPill } from "./SlaPill";

type TicketRow = {
  id: string;
  ticketNumber: number;
  title: string;
  status: string;
  priority: string;
  assignee: { name: string } | null;
  contact: { name: string; email: string } | null;
  updatedAt: string | Date;
  sla: {
    resolution: { msRemaining: number | null } | null;
  };
};

export function TicketTable({ tickets }: { tickets: TicketRow[] }) {
  return (
    <div className="card tableWrap">
      <table className="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Title</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Assignee</th>
            <th>Requester</th>
            <th>SLA</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            <tr key={ticket.id}>
              <td>
                <Link href={`/tickets/${ticket.id}`}>#{ticket.ticketNumber}</Link>
              </td>
              <td>{ticket.title}</td>
              <td><TicketStatusPill value={ticket.status} /></td>
              <td>{ticket.priority}</td>
              <td>{ticket.assignee?.name ?? "Unassigned"}</td>
              <td>{ticket.contact?.name ?? ticket.contact?.email ?? "Internal"}</td>
              <td><SlaPill label="Resolution" msRemaining={ticket.sla.resolution?.msRemaining ?? null} /></td>
              <td>{new Date(ticket.updatedAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {tickets.length === 0 ? <p className="muted">No tickets yet.</p> : null}
    </div>
  );
}
