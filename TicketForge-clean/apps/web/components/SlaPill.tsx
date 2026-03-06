export function SlaPill({ label, msRemaining }: { label: string; msRemaining: number | null | undefined }) {
  if (msRemaining == null) return null;
  const overdue = msRemaining < 0;
  const minutes = Math.abs(Math.round(msRemaining / 60000));
  return <span className={`pill ${overdue ? "pillDanger" : "pillInfo"}`}>{label}: {overdue ? `${minutes}m overdue` : `${minutes}m left`}</span>;
}
