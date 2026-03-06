export function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="card statCard">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
