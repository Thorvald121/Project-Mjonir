const API = process.env.NEXT_PUBLIC_API || "http://localhost:4000";

function onUnauthorized() {
  try { localStorage.removeItem("token"); } catch {}
  if (typeof window !== "undefined") {
    const p = window.location.pathname || "/";
    if (!p.startsWith("/auth")) {
      window.location.href = "/auth/login";
    }
  }
}

export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith("http") ? path : `${API}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as any),
  };
  try {
    const token = localStorage.getItem("token");
    if (token) headers["Authorization"] = `Bearer ${token}`;
  } catch {}

  const resp = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    ...init,
    headers,
  });

  if (resp.status === 401) { onUnauthorized(); throw new Error("Unauthorized"); }
  if (resp.status === 403) { throw new Error("Forbidden"); }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(text || `HTTP ${resp.status}`);
  }
  if (resp.status === 204) return undefined as any;
  return resp.json() as Promise<T>;
}

// Multipart upload (FormData)
export async function apiUpload<T = any>(path: string, form: FormData): Promise<T> {
  const url = path.startsWith("http") ? path : `${API}${path}`;
  const headers: Record<string, string> = {};
  try {
    const token = localStorage.getItem("token");
    if (token) headers["Authorization"] = `Bearer ${token}`;
  } catch {}

  const resp = await fetch(url, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    body: form,
    headers, // DO NOT set Content-Type; browser sets proper boundary
  });

  if (resp.status === 401) { onUnauthorized(); throw new Error("Unauthorized"); }
  if (resp.status === 403) { throw new Error("Forbidden"); }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(text || `HTTP ${resp.status}`);
  }
  return resp.json() as Promise<T>;
}

export const API_BASE = process.env.NEXT_PUBLIC_API || "http://localhost:4000";

export async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} ${text}`);
  }
  return res.json();
}