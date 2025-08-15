"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_API || "http://localhost:4000";

type Org = { id: string; name: string };
type Invoice = { id: string; totalCents: number; currency: string; periodStart: string; periodEnd: string; status: string; createdAt: string;
  lines: { id: string; description: string; quantity: number; unitCents: number; totalCents: number }[] };
type Me = { id: string; email: string; role: "ADMIN" | "AGENT" | "CLIENT" };

export default function InvoicesPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState<string>("");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [periodStart, setPeriodStart] = useState<string>("");
  const [periodEnd, setPeriodEnd] = useState<string>("");
  const [rate, setRate] = useState<number>(200);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  function iso(d: Date) { return d.toISOString(); }
  function setThisMonth() { const now = new Date(); setPeriodStart(iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0,0,0))));
    setPeriodEnd(iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth()+1, 0, 23,59,59)))); }
  function setLast30() { const end = new Date(); const start = new Date(end.getTime() - 30*24*3600*1000); setPeriodStart(iso(start)); setPeriodEnd(iso(end)); }

  const currencyFmt = useMemo(() => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }), []);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const user = await api<Me>("/auth/me");
        setMe(user);
        if (user.role !== "ADMIN") { setLoading(false); return; }
        const o = await api<Org[]>("/orgs");
        setOrgs(o);
        if (!orgId && o[0]?.id) setOrgId(o[0].id);
        setThisMonth();
        if (o[0]?.id) {
          const list = await api<Invoice[]>(`/invoices?organizationId=${o[0].id}`);
          setInvoices(list);
        }
      } catch (e:any) {
        setErr(e?.message ?? String(e));
      } finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generate() {
    try {
      setBusy(true); setErr(null);
      const inv = await api<Invoice>("/invoices/generate", { method: "POST", body: JSON.stringify({ organizationId: orgId, periodStart, periodEnd, defaultRateCentsPerMinute: rate }) });
      setInvoices([inv, ...invoices]);
    } catch (e:any) { setErr(`Generate failed: ${e?.message ?? String(e)}`); } finally { setBusy(false); }
  }

  if (loading) return <div>Loading…</div>;
  if (me && me.role !== "ADMIN") {
    return (
      <div className="grid" style={{maxWidth: 800, margin: "0 auto"}}>
        <h2>Invoices</h2>
        <div className="card" style={{ borderColor:"#3a1f2b", background:"#1a0e14", color:"#ff7694" }}>
          Admins only. If you need access, ask an admin to promote your account.
        </div>
      </div>
    );
  }

  return (
    <div className="grid" style={{maxWidth: 1000, margin: "0 auto"}}>
      <h2>Invoices</h2>
      {err && <div className="card" style={{ borderColor:"#3a1f2b", background:"#1a0e14", color:"#ff7694" }}>{err}</div>}
      <div className="card grid">
        <div className="row" style={{ flexWrap:"wrap", gap:"0.5rem" }}>
          <label>Organization</label>
          <select value={orgId} onChange={(e)=>setOrgId(e.target.value)} style={{ minWidth: 220 }}>
            {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <label>Start</label>
          <input value={periodStart} onChange={e=>setPeriodStart(e.target.value)} style={{ minWidth: 360 }} />
          <label>End</label>
          <input value={periodEnd} onChange={e=>setPeriodEnd(e.target.value)} style={{ minWidth: 360 }} />
          <button onClick={setThisMonth}>This Month</button>
          <button onClick={setLast30}>Last 30 days</button>
          <label>Rate (¢/min)</label>
          <input type="number" min={1} value={rate} onChange={e=>setRate(Number(e.target.value))} style={{ width: 120 }} />
          <button onClick={generate} disabled={!orgId || busy}>{busy ? "Generating…" : "Generate invoice"}</button>
        </div>
      </div>

      <div className="grid">
        {invoices.map(inv => (
          <div key={inv.id} className="card">
            <div className="row" style={{ justifyContent:"space-between" }}>
              <div>
                <b>Invoice {inv.id.slice(0,8)}</b>
                <div style={{ opacity:.7, fontSize:12 }}>
                  Period: {new Date(inv.periodStart).toLocaleDateString()} – {new Date(inv.periodEnd).toLocaleDateString()} • Status: {inv.status}
                </div>
              </div>
              <div className="row" style={{ gap: ".5rem", alignItems: "center" }}>
                <div style={{ fontWeight:700 }}>{currencyFmt.format(inv.totalCents / 100)}</div>
                <a href={`${API}/invoices/${inv.id}/pdf`} target="_blank" rel="noreferrer">
                  <button>Open PDF</button>
                </a>
              </div>
            </div>
            <div className="grid" style={{ marginTop: ".5rem" }}>
              {inv.lines.length === 0 ? (
                <div style={{ opacity:.7 }}>No time in this period.</div>
              ) : inv.lines.map(line => (
                <div key={line.id} className="row" style={{ justifyContent:"space-between" }}>
                  <div>{line.description}</div>
                  <div style={{ opacity:.7 }}>{line.quantity} × {currencyFmt.format(line.unitCents / 100)}</div>
                  <div style={{ fontWeight:700 }}>{currencyFmt.format(line.totalCents / 100)}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
