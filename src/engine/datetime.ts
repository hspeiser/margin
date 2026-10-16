import type { DateTimeValue } from './quantity';

export interface ZParts {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
  wd: number;
}

const partsCache = new Map<string, Intl.DateTimeFormat>();
const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function partsFormatter(tz: string) {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      weekday: 'short',
    });
    partsCache.set(tz, f);
  }
  return f;
}

/** Fixed offsets like "UTC+5:30" (Intl only knows whole-hour Etc/GMT zones). */
const FIXED = /^UTC([+-])(\d{1,2})(?::(\d{2}))?$/;
export function fixedOffset(tz: string | null): number | null {
  const m = tz ? FIXED.exec(tz) : null;
  if (!m) return null;
  return (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +(m[3] ?? 0));
}

export function isValidZone(tz: string): boolean {
  try {
    partsFormatter(tz);
    return true;
  } catch {
    return false;
  }
}

export function zonedParts(ms: number, tz: string | null): ZParts {
  if (!tz) {
    const d = new Date(ms);
    return { y: d.getFullYear(), mo: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), mi: d.getMinutes(), s: d.getSeconds(), wd: d.getDay() };
  }
  const fixed = fixedOffset(tz);
  if (fixed !== null) {
    const d = new Date(ms + fixed * 60000);
    return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), wd: d.getUTCDay() };
  }
  const out: Partial<ZParts> = {};
  for (const p of partsFormatter(tz).formatToParts(new Date(ms))) {
    if (p.type === 'year') out.y = +p.value;
    else if (p.type === 'month') out.mo = +p.value;
    else if (p.type === 'day') out.d = +p.value;
    else if (p.type === 'hour') out.h = +p.value % 24;
    else if (p.type === 'minute') out.mi = +p.value;
    else if (p.type === 'second') out.s = +p.value;
    else if (p.type === 'weekday') out.wd = WD[p.value];
  }
  return out as ZParts;
}

export function tzOffsetMin(ms: number, tz: string | null): number {
  const p = zonedParts(ms, tz);
  const asUTC = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
  return Math.round((asUTC - Math.floor(ms / 1000) * 1000) / 60000);
}

/**
 * Wall-clock time in a zone → epoch ms. Matches Date and Temporal's "compatible"
 * mode: a repeated time picks the earlier instant, a skipped time moves forward.
 */
export function zonedToMs(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string | null): number {
  if (!tz) return new Date(y, mo - 1, d, h, mi, s).getTime();
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  // Any transition near this wall time sits between the offsets a day either side.
  const before = tzOffsetMin(guess - 86400000, tz);
  const after = tzOffsetMin(guess + 86400000, tz);
  let best: number | null = null;
  for (const off of before === after ? [before] : [before, after]) {
    const ms = guess - off * 60000;
    if (tzOffsetMin(ms, tz) === off && (best === null || ms < best)) best = ms;
  }
  // Neither offset fits: the time is in a gap, so read it with the pre-gap offset.
  return best ?? guess - before * 60000;
}

export function daysInMonth(y: number, mo: number): number {
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

/** Calendar-aware month arithmetic (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(v: DateTimeValue, months: number): DateTimeValue {
  const p = zonedParts(v.ms, v.tz);
  const whole = Math.trunc(months);
  let mo = p.mo - 1 + whole;
  const y = p.y + Math.floor(mo / 12);
  mo = ((mo % 12) + 12) % 12;
  const d = Math.min(p.d, daysInMonth(y, mo + 1));
  let ms = zonedToMs(y, mo + 1, d, p.h, p.mi, p.s, v.tz);
  const frac = months - whole;
  if (frac) ms += frac * 2629746000;
  return { ...v, ms };
}

export function startOfDay(ms: number, tz: string | null): number {
  const p = zonedParts(ms, tz);
  return zonedToMs(p.y, p.mo, p.d, 0, 0, 0, tz);
}

/** Whole calendar days between two instants (in zone `tz`). */
export function calendarDayDiff(a: number, b: number, tz: string | null): number {
  const pa = zonedParts(a, tz);
  const pb = zonedParts(b, tz);
  return Math.round((Date.UTC(pb.y, pb.mo - 1, pb.d) - Date.UTC(pa.y, pa.mo - 1, pa.d)) / 86400000);
}

const ZONE_ABBR: Record<string, [string, string]> = {
  'Asia/Tokyo': ['JST', 'JST'],
  'Asia/Seoul': ['KST', 'KST'],
  'Asia/Kolkata': ['IST', 'IST'],
  'Asia/Shanghai': ['CST', 'CST'],
  'Asia/Hong_Kong': ['HKT', 'HKT'],
  'Asia/Singapore': ['SGT', 'SGT'],
  'Asia/Taipei': ['CST', 'CST'],
  'Asia/Bangkok': ['ICT', 'ICT'],
  'Asia/Jakarta': ['WIB', 'WIB'],
  'Asia/Dubai': ['GST', 'GST'],
  'Asia/Karachi': ['PKT', 'PKT'],
  'Europe/Moscow': ['MSK', 'MSK'],
  'Africa/Johannesburg': ['SAST', 'SAST'],
  'Africa/Nairobi': ['EAT', 'EAT'],
  'Africa/Lagos': ['WAT', 'WAT'],
  'America/Sao_Paulo': ['BRT', 'BRT'],
  'America/Argentina/Buenos_Aires': ['ART', 'ART'],
};

/** Short zone label like "PST", "CET", "JST". */
export function zoneAbbr(ms: number, tz: string): string {
  if (tz === 'UTC') return 'UTC';
  if (fixedOffset(tz) !== null) return tz;
  if (tz === 'Etc/GMT') return 'GMT';
  for (const loc of ['en-US', 'en-GB', 'en-AU', 'en-NZ', 'en-IE', 'en-CA']) {
    try {
      const part = new Intl.DateTimeFormat(loc, { timeZone: tz, timeZoneName: 'short' })
        .formatToParts(new Date(ms))
        .find((p) => p.type === 'timeZoneName')?.value;
      if (part && !/^(GMT|UTC)[+-−]/.test(part)) return part;
    } catch {
      break;
    }
  }
  if (ZONE_ABBR[tz]) return ZONE_ABBR[tz][0];
  const off = tzOffsetMin(ms, tz);
  const sign = off < 0 ? '−' : '+';
  const a = Math.abs(off);
  return `UTC${sign}${Math.floor(a / 60)}${a % 60 ? ':' + String(a % 60).padStart(2, '0') : ''}`;
}

export interface DateFormatOpts {
  hour12: boolean;
  locale: string;
  now: number;
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(locale: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = locale + JSON.stringify(opts);
  let f = dtfCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, opts);
    dtfCache.set(key, f);
  }
  return f;
}

function isoString(v: DateTimeValue): string {
  const p = zonedParts(v.ms, v.tz);
  const off = tzOffsetMin(v.ms, v.tz);
  const pad = (n: number, w = 2) => String(Math.abs(n)).padStart(w, '0');
  const date = `${p.y}-${pad(p.mo)}-${pad(p.d)}`;
  if (!v.hasTime) return date;
  const tz = off === 0 ? 'Z' : `${off < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
  return `${date}T${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}${tz}`;
}

export function formatDateTime(v: DateTimeValue, o: DateFormatOpts): string {
  if (v.iso) return isoString(v);
  // fixed offsets: format the shifted instant as UTC, then label it
  const fixed = fixedOffset(v.tz);
  const timeZone = fixed !== null ? 'UTC' : (v.tz ?? undefined);
  const d = new Date(fixed !== null ? v.ms + fixed * 60000 : v.ms);
  const parts: string[] = [];
  if (v.hasDate) {
    parts.push(dtf(o.locale, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone }).format(d));
  }
  if (v.hasTime) {
    const p = zonedParts(v.ms, v.tz);
    const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', hour12: o.hour12, timeZone };
    if (v.seconds && p.s) opts.second = '2-digit';
    let t = dtf(o.locale, opts).format(d);
    if (v.tz) t += ' ' + zoneAbbr(v.ms, v.tz);
    if (!v.hasDate && v.tz) {
      const diff = calendarDayDiff(o.now, v.ms, v.tz) - calendarDayDiff(o.now, o.now, v.tz);
      const localDiff = (() => {
        const pl = zonedParts(o.now, null);
        const pz = zonedParts(v.ms, v.tz);
        return Math.round((Date.UTC(pz.y, pz.mo - 1, pz.d) - Date.UTC(pl.y, pl.mo - 1, pl.d)) / 86400000);
      })();
      void diff;
      if (localDiff === 1) t += ', tomorrow';
      else if (localDiff === -1) t += ', yesterday';
      else if (localDiff !== 0) t += `, ${dtf(o.locale, { weekday: 'short', month: 'short', day: 'numeric', timeZone }).format(d)}`;
    }
    parts.push(t);
  }
  return parts.join(' at ');
}
