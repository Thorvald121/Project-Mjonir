"use client";
import { useEffect, useState } from "react";

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${h}h ${m}m ${ss}s`;
}

export default function SlaBadge({ msRemaining, label }: { msRemaining: number | null | undefined; label: string }) {
  const [t, setT] = useState(msRemaining ?? null);
  useEffect(() => {
    setT(msRemaining ?? null);
    if (msRemaining == null) return;
    const id = setInterval(() => setT((prev) => (prev == null ? null : prev - 1000)), 1000);
    return () => clearInterval(id);
  }, [msRemaining]);

  if (t == null) return null;
  const breached = t < 0;
  const text = breached ? `${label}: overdue by ${fmt(-t)}` : `${label}: due in ${fmt(t)}`;
  const bg = breached ? "#fee2e2" : "#e0f2fe";
  const color = breached ? "#991b1b" : "#075985";

  return (
    <span style={{ background: bg, color, padding: "4px 8px", borderRadius: 8, fontSize: 12, whiteSpace: "nowrap" }}>
      {text}
    </span>
  );
}
