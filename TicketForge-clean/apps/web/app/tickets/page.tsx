import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { TicketTable } from "@/components/TicketTable";
import { getSessionUser } from "@/lib/server/session";
import { listTickets } from "@/lib/server/tickets";

export default async function TicketsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const tickets = await listTickets(user.organizationId, params.filter);

  return (
    <Shell>
      <div className="pageHeader">
        <div>
          <p className="eyebrow">Tickets</p>
          <h2>Service desk queue</h2>
        </div>
        <div className="row">
          <Link href="/tickets?filter=open" className="pill">Open</Link>
          <Link href="/tickets" className="pill">All</Link>
          <Link href="/tickets/new" className="pill">New ticket</Link>
        </div>
      </div>
      <TicketTable tickets={tickets} />
    </Shell>
  );
}
