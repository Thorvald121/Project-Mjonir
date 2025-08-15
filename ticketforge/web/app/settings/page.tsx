"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Me = { id: string; email: string; role: "ADMIN" | "AGENT" | "CLIENT" };
type Org = { id: string; name: string };
type Sla = { id: string; name: string; slaFirstResponseMins: number; slaResolutionMins: number; escalationEmail?: string | null };

export default function SettingsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState<string>("");
  const [sla, setSla] = useState<Sla | null>(null);
  const [firstMins, setFirstMins] = useState<number>(60);
  const [resMins, setResMins] = useState<number>(1440);
  const [escEmail, setEscEmail] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const user = await api<Me>("/auth/me");
        setMe(user);
        if (user.role !== "ADMIN") return;
        const o = await api<Org[]>("/orgs");
        setOrgs(o);
        if (o[0]?.id) {
          setOrgId(o[0].id);
        }
      } catch (e:any) { setErr(e?.message ?? String(e)); }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!orgId) return;
      try {
        const s = await api<Sla>(`/sla/${orgId}`);
        setSla(s);
        setFirstMins(s.slaFirstResponseMins);
        setResMins(s.slaResolutionMins);
        setEscEmail(s.escalationEmail ?? "");
      } catch (e:any) { setErr(e?.message ?? String(e)); }
    })();
  }, [orgId]);

  async function save() {
    try {
      setBusy(true); setErr(null);
      const s = await api<Sla>(`/sla/${orgId}`, {
        method: "PATCH",
        body: JSON.stringify({ slaFirstResponseMins: firstMins, slaResolutionMins: resMins, escalationEmail: escEmail || null })
      });
      setSla(s);
    } catch (e:any) { setErr(e?.message ?? String(e)); } finally { setBusy(false); }
  }

  if (!me) return <div>Loading…</div>;
  if (me.role !== "ADMIN") return <div className="grid" style={{maxWidth:800, margin:"0 auto"}}><h2>Settings</h2><div className="card" style={{ borderColor:"#3a1f2b", background:"#1a0e14", color:"#ff7694" }}>Admins only.</div></div>;

  return (
    <div className="grid" style={{maxWidth:800, margin:"0 auto"}}>
      <h2>Settings</h2>
      {err && <div className="card" style={{ borderColor:"#3a1f2b", background:"#1a0e14", color:"#ff7694" }}>{err}</div>}

      <div className="card grid">
        <div className="row" style={{ gap: ".5rem" }}>
          <label>Organization</label>
          <select value={orgId} onChange={(e)=>setOrgId(e.target.value)} style={{ minWidth: 260 }}>
            {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>

        <div className="row" style={{ gap: ".5rem", flexWrap:"wrap" }}>
          <label>First response (mins)</label>
          <input type="number" min={1} value={firstMins} onChange={e=>setFirstMins(Number(e.target.value))} style={{ width: 140 }} />
          <label>Resolution (mins)</label>
          <input type="number" min={1} value={resMins} onChange={e=>setResMins(Number(e.target.value))} style={{ width: 140 }} />
          <label>Escalation email</label>
          <input type="email" placeholder="alerts@yourdomain.com" value={escEmail} onChange={e=>setEscEmail(e.target.value)} style={{ minWidth: 280 }} />
          <button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>

        {sla && (
          <div style={{ opacity:.7, fontSize:12 }}>
            Current: first={sla.slaFirstResponseMins} min, resolution={sla.slaResolutionMins} min, escalation={sla.escalationEmail || "—"}
          </div>
        )}
      </div>
    </div>
  );
}
