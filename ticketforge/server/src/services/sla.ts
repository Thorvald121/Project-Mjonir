import { businessMinutesBetween, addBusinessMinutes } from "./timebox.js";
// If you later want to do DB work each tick, uncomment this:
// import { prisma } from "../lib/prisma.js";

/**
 * Normalize org business-hours settings for the timebox helpers.
 * We coerce types explicitly so TS + runtime are happy.
 */
export function bizFromOrg(org: any) {
  return {
    zone: org.businessTimezone,
    // timebox expects CSV string, not string[]
    daysCsv: String(org.businessDays ?? "1,2,3,4,5"),
    openMin: Number(org.businessOpenMin ?? 9 * 60),
    closeMin: Number(org.businessCloseMin ?? 17 * 60),
    holidays: (org.holidays as string[] | null) ?? undefined,
  };
}

/** Remaining business minutes until dueAt (or null). */
export function remainingFirstResponse(now: Date, dueAt: Date | null, org: any) {
  if (!dueAt) return null;
  return businessMinutesBetween(now, dueAt, bizFromOrg(org));
}

/** Push a timestamp forward by remaining business minutes (or null). */
export function pushByRemaining(now: Date, remainingMins: number | null, org: any) {
  if (remainingMins == null) return null;
  return addBusinessMinutes(now, Number(remainingMins ?? 0), bizFromOrg(org));
}

/**
 * Lightweight scheduler so imports in index.ts work.
 * Returns a stop() function. Currently a no-op tick; you can
 * later add DB checks, breach updates, notifications, etc.
 */
export function startSlaMonitor(opts?: { intervalMs?: number }) {
  const intervalMs = opts?.intervalMs ?? 60_000; // 1 minute default
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      // Place SLA maintenance logic here if/when needed.
      // Example (pseudo):
      // const overdue = await prisma.ticket.findMany({ ... });
      // await prisma.ticket.updateMany({ where: { id: { in: overdueIds }}, data: { ... } });
    } catch (err) {
      console.error("[SLA] monitor tick error:", err);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, intervalMs);
  console.log(`[SLA] monitor started (every ${intervalMs} ms)`);
  // kick off an initial tick after boot
  void tick();

  return () => {
    clearInterval(timer);
    console.log("[SLA] monitor stopped");
  };
}
