"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Link from "next/link";
import SlaBadge from "@/components/SlaBadge";

type TicketRow = {
  id: string;
  title: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  createdAt: string;
  requester?: { name?: string | null; email?: string | null } | null;
  assignee?: { name?: string | null } | null;
  computedSla?: {
    first: { msRemaining: number | null; breached: boolean };
    resolution: { msRemaining: number | null; breached: boolean };
  };
};

const FILTERS = [
  { key: "", label: "All" },
  { key: "my", label: "My Queue" },
  { key: "unassigned", label: "Unassigned" },
  { key: "breachingSoon", label: "Breaching Soon" },
  { key: "overdue", label: "Overdue" },
];

export default function TicketsList() {
  const [filter, setFilter] = useState<string>("");
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load(f = filter) {
    setLoading(true);
    setErr(null);
    try {
      const data = await api(`/tickets${f ? `?filter=${f}` : ""}`);
      setRows(data);
    } catch (e: any) {
      setErr(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(""); }, []);
  useEffect(() => { load(filter); }, [filter]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1 rounded border ${filter === f.key ? "bg-black text-white" : ""}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && <div>Loading…</div>}
      {err && <div className="text-red-600">{err}</div>}

      {!loading && !err && (
        <div className="space-y-2">
          {rows.map(t => (
            <Link key={t.id} href={`/tickets/${t.id}`} className="block border rounded p-3 hover:bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="font-medium">{t.title}</div>
                <div className="text-xs opacity-70">{new Date(t.createdAt).toLocaleString()}</div>
              </div>
              <div className="flex items-center gap-2 mt-1 text-sm">
                <span className="px-2 py-0.5 rounded border">{t.status}</span>
                <span className="px-2 py-0.5 rounded border">{t.priority}</span>
                {t.computedSla?.resolution && (
                  <SlaBadge msRemaining={t.computedSla.resolution.msRemaining ?? null} label="Resolution" />
                )}
                {t.assignee?.name && <span className="opacity-70">Assigned to {t.assignee.name}</span>}
                {t.requester?.email && <span className="opacity-70">Requester {t.requester.email}</span>}
              </div>
            </Link>
          ))}
          {rows.length === 0 && <div className="opacity-70">No tickets.</div>}
        </div>
      )}
    </div>
  );
}
