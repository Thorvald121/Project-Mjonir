"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Canned = { id: string; title: string; body: string; isPublic: boolean };

export default function CannedReplyPicker({ onPick }: { onPick: (body: string) => void }) {
  const [items, setItems] = useState<Canned[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api("/canned").then(setItems).catch(() => setItems([]));
  }, []);

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(!open)} className="px-2 py-1 rounded border">Canned replies ▾</button>
      {open && (
        <div className="shadow rounded border bg-white absolute z-10 mt-2 w-80 max-h-80 overflow-auto">
          {items.length === 0 ? (
            <div className="p-3 text-sm opacity-70">No canned replies.</div>
          ) : items.map((c) => (
            <button
              key={c.id}
              onClick={() => { onPick(c.body); setOpen(false); }}
              className="w-full text-left p-3 hover:bg-gray-50"
              title={c.body}
            >
              <div className="font-medium">{c.title}</div>
              <div className="text-xs opacity-70 line-clamp-2">{c.body}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
