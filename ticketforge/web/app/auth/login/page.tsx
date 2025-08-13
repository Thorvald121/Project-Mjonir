"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API || "http://localhost:4000";

export default function LoginPage() {
  const [email,setEmail] = useState("admin@ticketforge.local");
  const [password,setPassword] = useState("admin123");
  const [error,setError] = useState<string|undefined>();
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    const r = await fetch(`${API}/auth/login`, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ email, password }) });
    if(!r.ok){ setError("Login failed"); return; }
    const data = await r.json();
    localStorage.setItem("token", data.token);
    router.push("/tickets");
  }

  return (
    <div className="grid" style={{maxWidth:420, margin:"2rem auto"}}>
      <h2>Log in</h2>
      <form className="grid" onSubmit={onSubmit}>
        <input placeholder="email" value={email} onChange={e=>setEmail(e.target.value)} />
        <input placeholder="password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
        {error && <div style={{color:"#ff7694"}}>{error}</div>}
        <button>Login</button>
      </form>
    </div>
  );
}
