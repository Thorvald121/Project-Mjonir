export function TicketStatusPill({ value }: { value: string }) {
  return <span className="pill">{value.replaceAll("_", " ")}</span>;
}
