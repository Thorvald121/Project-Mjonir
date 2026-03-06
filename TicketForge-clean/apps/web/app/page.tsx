import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { StatCard } from "@/components/StatCard";
import { TicketTable } from "@/components/TicketTable";
import { getSessionUser } from "@/lib/server/session";
import { getDashboardStats } from "@/lib/server/dashboard";
import { listTickets } from "@/lib/server/tickets";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [stats, tickets] = await Promise.all([
    getDashboardStats(user.organizationId),
    listTickets(user.organizationId, "open")
  ]);

  return (
    <Shell>
      <div className="pageHeader">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h2>Welcome back, {user.name}</h2>
        </div>
        <Link href="/tickets/new" className="pill">Create ticket</Link>
      </div>

      <section className="grid4">
        <StatCard label="Total tickets" value={stats.total} />
        <StatCard label="Open" value={stats.open} />
        <StatCard label="In progress" value={stats.inProgress} />
        <StatCard label="Waiting" value={stats.waiting} />
      </section>

      <section className="stack" style={{ marginTop: "1rem" }}>
        <div className="pageHeader">
          <div>
            <p className="eyebrow">Queue</p>
            <h3>Active tickets</h3>
          </div>
        </div>
        <TicketTable tickets={tickets} />
      </section>
    </Shell>
  );
}
