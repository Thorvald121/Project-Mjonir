import Link from "next/link";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">TicketForge</p>
          <h1>Help Desk MVP</h1>
        </div>
        <nav className="nav">
          <Link href="/">Dashboard</Link>
          <Link href="/tickets">Tickets</Link>
          <Link href="/tickets/new">New Ticket</Link>
          <Link href="/settings">Settings</Link>
        </nav>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
