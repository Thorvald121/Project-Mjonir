export default function Home() {
  return (
    <div className="grid" style={{maxWidth:900, margin:"0 auto"}}>
      <h1>TicketForge</h1>
      <div className="card">
        <p>Welcome. Use Tickets to create and track. Client Portal shows a client-only view.</p>
        <p>Backend expected at <code>http://localhost:4000</code>. Configure <code>NEXT_PUBLIC_API</code> if different.</p>
      </div>
    </div>
  );
}
