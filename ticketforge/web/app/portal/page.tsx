export default function Portal() {
  return (
    <div className="grid" style={{maxWidth:900, margin:"0 auto"}}>
      <h2>Client Portal</h2>
      <div className="card">
        This is a placeholder for a client-scoped view (their tickets only, public comments, SLA status, invoice history).
        Reuses the same API with a restricted token.
      </div>
    </div>
  );
}
