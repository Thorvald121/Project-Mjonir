import { DateTime } from "luxon";

/**
 * Business-hours config consumed by helpers below.
 * - daysCsv: "1,2,3,4,5" (Mon=1 ... Sun=7)
 * - openMin/closeMin: minutes since midnight
 * - zone: IANA TZ like "America/New_York"
 * - holidays: ISO dates like "2025-12-25"
 */
export type Biz = {
  daysCsv: string;
  openMin: number;
  closeMin: number;
  zone?: string | null;
  holidays?: string[];
};

// Note: we deliberately avoid using DateTime as a *type* to dodge shim conflicts.
function minutesSinceMidnight(dt: any) {
  return dt.hour * 60 + dt.minute;
}
function isHoliday(dt: any, holidays?: string[]) {
  if (!holidays?.length) return false;
  const iso = dt.toISODate();
  return holidays.includes(iso!);
}
function allowedDays(biz: Biz): Set<number> {
  return new Set(
    String(biz.daysCsv || "1,2,3,4,5")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => n >= 1 && n <= 7)
  );
}
function isBusinessDay(dt: any, biz: Biz) {
  const set = allowedDays(biz);
  return set.has(dt.weekday) && !isHoliday(dt, biz.holidays);
}
function startOfBusiness(dt: any, biz: Biz) {
  const mins = biz.openMin;
  return dt.set({ hour: Math.floor(mins / 60), minute: mins % 60, second: 0, millisecond: 0 });
}
function endOfBusiness(dt: any, biz: Biz) {
  const mins = biz.closeMin;
  return dt.set({ hour: Math.floor(mins / 60), minute: mins % 60, second: 0, millisecond: 0 });
}
function nextBusinessStart(dt: any, biz: Biz): any {
  let cur = dt;
  const days = allowedDays(biz);
  for (let i = 0; i < 14; i++) {
    const cand = startOfBusiness(cur, biz);
    if (days.has(cand.weekday) && !isHoliday(cand, biz.holidays)) return cand;
    cur = cur.plus({ days: 1 }).startOf("day");
  }
  return startOfBusiness(cur, biz);
}

/**
 * Add business minutes to a timestamp, respecting business windows.
 * Accepts undefined/null safely.
 */
export function addBusinessMinutes(start: Date, minutesIn: number | null | undefined, biz: Biz): Date {
  let minutes = Math.floor(Number(minutesIn ?? 0));
  if (minutes <= 0) return start;

  const zone = biz.zone || "UTC";
  let dt: any = DateTime.fromJSDate(start).setZone(zone);

  while (minutes > 0) {
    if (!isBusinessDay(dt, biz)) {
      dt = nextBusinessStart(dt, biz);
      continue;
    }
    const open = startOfBusiness(dt, biz);
    const close = endOfBusiness(dt, biz);
    if (dt < open) {
      dt = open;
    }
    if (dt >= close) {
      dt = nextBusinessStart(dt.plus({ days: 1 }).startOf("day"), biz);
      continue;
    }
    const availableToday = Math.max(0, close.diff(dt, "minutes").minutes | 0);
    const step = Math.min(minutes, availableToday);
    dt = dt.plus({ minutes: step });
    minutes -= step;
    if (minutes > 0) {
      dt = nextBusinessStart(dt.plus({ days: 1 }).startOf("day"), biz);
    }
  }
  return dt.toJSDate();
}

/**
 * Compute number of business minutes between two timestamps.
 */
export function businessMinutesBetween(from: Date, to: Date, biz: Biz): number {
  const zone = biz.zone || "UTC";
  let a: any = DateTime.fromJSDate(from).setZone(zone);
  const b: any = DateTime.fromJSDate(to).setZone(zone);
  if (a >= b) return 0;

  let sum = 0;
  while (a < b) {
    if (!isBusinessDay(a, biz)) {
      a = nextBusinessStart(a, biz);
      continue;
    }
    const open = startOfBusiness(a, biz);
    const close = endOfBusiness(a, biz);
    if (a < open) a = open;
    const end = b < close ? b : close;
    if (a < end) {
      sum += Math.max(0, end.diff(a, "minutes").minutes | 0);
      a = end;
    } else {
      a = nextBusinessStart(a.plus({ days: 1 }).startOf("day"), biz);
    }
  }
  return sum;
}
