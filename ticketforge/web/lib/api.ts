const API = process.env.NEXT_PUBLIC_API || "http://localhost:4000";

function authHeaders() {
  const t = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type":"application/json", ...(init?.headers||{}), ...authHeaders() },
    cache: "no-store"
  });
  if(!r.ok) throw new Error(`${r.status}`);
  return r.json() as Promise<T>;
}
