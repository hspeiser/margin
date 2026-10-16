import { formatDateTime } from './datetime';
import { type Fmt, type Quantity, type Value, convert, fromSI, isPlain, q, supPow, toSI } from './quantity';
import { type Term, getUnit, termFactor } from './units';

export interface Settings {
  /** Maximum fraction digits for ordinary numbers. */
  decimals: number;
  /** Thousands separators. */
  separators: boolean;
  /** Unit assumed for trig on plain numbers. */
  angle: 'rad' | 'deg';
  ppi: number;
  emPx: number;
  hour12: boolean;
  locale: string;
}

export const DEFAULT_SETTINGS: Settings = {
  decimals: 4,
  separators: true,
  angle: 'rad',
  ppi: 96,
  emPx: 16,
  hour12: true,
  locale: 'en-US',
};

export interface Formatted {
  text: string;
  /** Plain text for the clipboard (no grouping, full useful precision). */
  copy: string;
}

// ---------------------------------------------------------------------------
// Numbers

function group(intPart: string, sep: boolean): string {
  if (!sep) return intPart;
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function withGroups(s: string, sep: boolean): string {
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  const [i, f] = s.split('.');
  return (neg ? '-' : '') + group(i, sep) + (f ? '.' + f : '');
}

function trimZeros(s: string): string {
  if (!s.includes('.')) return s;
  return s.replace(/0+$/, '').replace(/\.$/, '');
}

const SUPERSCRIPT: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

function sci(x: number, digits: number): Formatted {
  const [m, e] = x.toExponential(Math.min(Math.max(digits, 0), 15)).split('e');
  const mant = trimZeros(m);
  const exp = String(+e);
  return { text: `${mant} × 10${exp.split('').map((c) => SUPERSCRIPT[c] ?? c).join('')}`, copy: `${mant}e${exp}` };
}

export interface NumOpts {
  maxDecimals: number;
  sep: boolean;
  fixed?: number;
  sigfigs?: number;
  sci?: boolean;
}

export function formatNumber(x: number, o: NumOpts): Formatted {
  if (!Number.isFinite(x)) {
    const t = Number.isNaN(x) ? 'NaN' : x > 0 ? '∞' : '-∞';
    return { text: t, copy: t };
  }
  if (Object.is(x, -0)) x = 0;
  const ax = Math.abs(x);
  if (o.sci) return sci(x, o.sigfigs ? o.sigfigs - 1 : Math.max(o.maxDecimals, 2));
  if (o.sigfigs) {
    if (ax !== 0 && (ax >= 1e21 || ax < 1e-6)) return sci(x, o.sigfigs - 1);
    const s = x.toPrecision(o.sigfigs);
    const plain = s.includes('e') ? String(+s) : s;
    return { text: withGroups(plain, o.sep), copy: plain };
  }
  if (o.fixed !== undefined) {
    if (ax >= 1e21) return sci(x, o.fixed);
    // doubles hold ~15 significant digits; don't print noise beyond that
    const intDigits = ax >= 1 ? Math.floor(Math.log10(ax)) + 1 : 0;
    const s = x.toFixed(Math.min(o.fixed, Math.max(0, 15 - intDigits), 100));
    return { text: withGroups(s, o.sep), copy: s };
  }
  // beyond 2^53 integers aren't exact, so don't print them as if they were
  if (ax !== 0 && (ax >= 1e16 || ax < 1e-6)) return sci(x, Math.max(o.maxDecimals, 3));
  let dec = o.maxDecimals;
  // doubles carry ~15 significant digits; don't print float noise past that
  if (ax >= 1) dec = Math.min(dec, Math.max(0, 15 - (Math.floor(Math.log10(ax)) + 1)));
  if (ax !== 0 && ax < 1) {
    // keep at least 3 significant digits for small numbers
    const lead = Math.floor(-Math.log10(ax));
    dec = Math.max(dec, lead + 4);
  }
  dec = Math.min(dec, 20);
  let s = trimZeros(x.toFixed(dec));
  if (s === '-0') s = '0';
  return { text: withGroups(s, o.sep), copy: s };
}

// ---------------------------------------------------------------------------
// Special number formats

function toBase(x: number, base: number): string {
  const neg = x < 0;
  const ax = Math.abs(x);
  let digits: string;
  if (ax > Number.MAX_SAFE_INTEGER) digits = BigInt(Math.round(ax)).toString(base);
  else {
    digits = ax.toString(base);
    // 255.5 → FF.8; cap long expansions like 0.1 in binary
    const [i, f] = digits.split('.');
    if (f) digits = i + '.' + (f.length > 16 ? f.slice(0, 16) + '…' : f);
  }
  digits = digits.toUpperCase();
  const prefix = base === 16 ? '0x' : base === 2 ? '0b' : base === 8 ? '0o' : '';
  return (neg ? '-' : '') + prefix + digits + (prefix ? '' : ` (base ${base})`);
}

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

/** Best rational approximation via continued fractions. */
export function toFraction(x: number, maxDen = 10000): { n: number; d: number; exact: boolean } {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  let [h0, h1, k0, k1] = [0, 1, 1, 0];
  let b = x;
  for (let i = 0; i < 64; i++) {
    const a = Math.floor(b);
    const h2 = a * h1 + h0;
    const k2 = a * k1 + k0;
    if (k2 > maxDen) break;
    [h0, h1, k0, k1] = [h1, h2, k1, k2];
    if (Math.abs(x - h1 / k1) < 1e-12 * Math.max(1, x)) break;
    const frac = b - a;
    if (frac < 1e-12) break;
    b = 1 / frac;
  }
  const g = gcd(h1, k1) || 1;
  const n = h1 / g;
  const d = k1 / g;
  return { n: sign * n, d, exact: Math.abs(x - n / d) < 1e-9 * Math.max(1, x) };
}

function formatFraction(x: number): string {
  let { n, d, exact } = toFraction(x);
  if (!exact) ({ n, d } = toFraction(x, 1000));
  const approx = exact ? '' : '≈ ';
  if (d === 1) return approx + String(n);
  if (!exact) return `${approx}${n}/${d}`;
  const whole = Math.trunc(n / d);
  const rem = Math.abs(n % d);
  if (whole !== 0) return `${approx}${whole} ${rem}/${d}`;
  return `${approx}${n}/${d}`;
}

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const BIG = ['', 'thousand', 'million', 'billion', 'trillion', 'quadrillion'];

function under1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(ONES[Math.floor(n / 100)] + ' hundred');
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : ''));
  } else if (n > 0 || !parts.length) parts.push(ONES[n]);
  return parts.join(' ');
}

export function toWords(x: number): string {
  if (!Number.isFinite(x)) return String(x);
  if (Math.abs(x) >= 1e18) return 'a very large number';
  const neg = x < 0;
  x = Math.abs(x);
  let int = Math.floor(x);
  const fracStr = trimZeros(x.toFixed(6)).split('.')[1];
  const chunks: string[] = [];
  if (int === 0) chunks.push('zero');
  for (let i = 0; int > 0; i++) {
    const c = int % 1000;
    if (c) chunks.unshift(under1000(c) + (BIG[i] ? ' ' + BIG[i] : ''));
    int = Math.floor(int / 1000);
  }
  let s = chunks.join(' ');
  if (fracStr) s += ' point ' + fracStr.split('').map((d) => ONES[+d]).join(' ');
  return (neg ? 'minus ' : '') + s;
}

export function toRoman(x: number): string {
  let n = Math.round(x);
  if (n <= 0 || n >= 4000) return 'out of range';
  const map: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = '';
  for (const [v, r] of map) while (n >= v) (s += r), (n -= v);
  return s;
}

// ---------------------------------------------------------------------------
// Units

const TIGHT = new Set(['%', '‰', '°', '′', '″', '°C', '°F', '°R', '¢']);

function unitSym(t: Term): string {
  return (t.p?.sym ?? '') + (t.u.currency ? t.u.id : t.u.symbol);
}

/** Label for a single term standing alone, choosing singular/plural words. */
function soloLabel(t: Term, v: number): string {
  if (t.pow === 1 && !t.p && t.u.singular) return Math.abs(v) === 1 ? t.u.singular : t.u.plural!;
  return unitSym(t) + supPow(t.pow);
}

export function unitLabel(terms: readonly Term[], v: number): string {
  if (terms.length === 1 && terms[0].pow > 0) return soloLabel(terms[0], v);
  const num = terms.filter((t) => t.pow > 0);
  const den = terms.filter((t) => t.pow < 0);
  let s = num.map((t) => unitSym(t) + supPow(t.pow)).join('·');
  if (den.length) s += '/' + den.map((t) => unitSym(t) + supPow(-t.pow)).join('·');
  return s;
}

function joinUnit(num: string, label: string): string {
  if (!label) return num;
  if (TIGHT.has(label)) return num + label;
  if (label.startsWith('/')) return num + label;
  return num + ' ' + label;
}

function moneyNumber(v: number, decimals: number, crypto: boolean, s: Settings, fmt?: Fmt): Formatted {
  if (fmt?.decimals !== undefined || fmt?.sigfigs || fmt?.sci) return formatNumber(v, { maxDecimals: s.decimals, sep: s.separators, fixed: fmt.decimals, sigfigs: fmt.sigfigs, sci: fmt.sci });
  const av = Math.abs(v);
  if (crypto) return formatNumber(v, { maxDecimals: decimals === 2 ? 8 : decimals, sep: s.separators });
  if (av !== 0 && av < 0.01) return formatNumber(v, { maxDecimals: decimals, sep: s.separators });
  const rounded = Math.round(v * 10 ** decimals) / 10 ** decimals;
  const isWhole = Math.abs(rounded - Math.round(rounded)) < 1e-9;
  return formatNumber(rounded, { maxDecimals: decimals, sep: s.separators, fixed: isWhole || av >= 1e15 ? 0 : decimals });
}

function formatMoney(a: Quantity, s: Settings): Formatted | null {
  const cur = a.terms.find((t) => t.u.currency && t.pow === 1);
  if (!cur || a.terms.some((t) => t !== cur && t.pow > 0)) return null;
  const meta = cur.u.currency!;
  const n = moneyNumber(a.v, meta.decimals ?? 2, !!meta.crypto, s, a.fmt);
  const rest = a.terms.filter((t) => t !== cur);
  const tail = rest.length ? '/' + rest.map((t) => unitSym(t) + supPow(-t.pow)).join('·') : '';
  const neg = n.text.startsWith('-');
  const body = neg ? n.text.slice(1) : n.text;
  const sign = neg ? '-' : '';
  let text: string;
  if (meta.prefix && meta.symbol) text = `${sign}${meta.symbol}${body}${tail}`;
  else text = `${sign}${body} ${meta.symbol ?? meta.code}${tail}`;
  return { text, copy: text.replace(/,/g, '') };
}

/** "5 ft 10.5 in", "1 hour 30 minutes" */
const COMPACT: Record<string, string> = { h: 'h', min: 'min', s: 's' };

function formatMulti(a: Quantity, parts: Term[], s: Settings, compact = false): Formatted {
  let si = toSI(a);
  const neg = si < 0;
  si = Math.abs(si);
  const values: number[] = [];
  for (let i = 0; i < parts.length; i++) {
    const f = termFactor(parts[i]);
    if (i === parts.length - 1) values.push(si / f);
    else {
      const whole = Math.floor(si / f + 1e-9);
      values.push(whole);
      si -= whole * f;
      if (si < 0) si = 0;
    }
  }
  // round the last part and carry
  const dec = a.fmt?.decimals ?? Math.min(s.decimals, 2);
  for (let i = parts.length - 1; i >= 0; i--) {
    if (i === parts.length - 1) values[i] = Math.round(values[i] * 10 ** dec) / 10 ** dec;
    if (i > 0) {
      const ratio = Math.round(termFactor(parts[i - 1]) / termFactor(parts[i]));
      if (values[i] >= ratio - 1e-9 && Number.isInteger(ratio)) {
        values[i] -= ratio;
        values[i - 1] += 1;
      }
    }
  }
  const out: string[] = [];
  values.forEach((v, i) => {
    if (v === 0 && !(i === values.length - 1 && out.length === 0)) return;
    const n = formatNumber(v, { maxDecimals: dec, sep: s.separators });
    const label = compact && COMPACT[parts[i].u.id] ? COMPACT[parts[i].u.id] : soloLabel(parts[i], v);
    out.push(joinUnit(n.text, label));
  });
  const text = (neg ? '-' : '') + out.join(' ');
  return { text, copy: text.replace(/,/g, '') };
}

const DURATION_UNITS = ['ms', 's', 'min', 'h', 'day', 'year'];
const DATA_DECIMAL = ['k', 'M', 'G', 'T', 'P', 'E'];
const DATA_BINARY = ['Ki', 'Mi', 'Gi', 'Ti', 'Pi', 'Ei'];

/** Choose a friendlier unit for computed durations and data sizes. */
export function humanize(a: Quantity): Quantity {
  if (a.terms.length !== 1 || a.terms[0].pow !== 1) return a;
  const t = a.terms[0];
  const si = Math.abs(toSI(a));
  if (t.u.category === 'time') {
    const cands = DURATION_UNITS.map((id) => (id === 'ms' ? { u: getUnit('s'), p: { sym: 'm', name: 'milli', factor: 1e-3 }, pow: 1 } : { u: getUnit(id), p: null, pow: 1 }));
    let best = cands[1];
    for (const c of cands) if (si >= termFactor(c) * 0.9999) best = c;
    if (si === 0) best = { u: t.u, p: t.p, pow: 1 };
    return { ...convert(a, [best]), fmt: undefined };
  }
  if (t.u.id === 'byte' || t.u.id === 'bit') {
    const binary = !!t.p && t.p.sym.endsWith('i');
    const unitBits = t.u.factor;
    const list = binary ? DATA_BINARY : DATA_DECIMAL;
    const base = binary ? 1024 : 1000;
    let best: Term = { u: t.u, p: null, pow: 1 };
    list.forEach((sym, i) => {
      if (si >= unitBits * base ** (i + 1) * 0.9999) best = { u: t.u, p: { sym, name: sym, factor: base ** (i + 1) }, pow: 1 };
    });
    return { ...convert(a, [best]), fmt: undefined };
  }
  return a;
}

/** "2 days 3 hours 4 minutes" */
function humanizeParts(a: Quantity, s: Settings): Formatted {
  const secs = Math.abs(toSI(a));
  const ids = ['year', 'day', 'h', 'min', 's'];
  const parts = ids.map((id) => ({ u: getUnit(id), p: null, pow: 1 }) as Term);
  let usable = parts.filter((p) => secs >= termFactor(p) * 0.9999);
  if (!usable.length) usable = [parts[parts.length - 1]];
  // limit to 3 consecutive units for readability
  const startIdx = parts.indexOf(usable[0]);
  const chosen = parts.slice(startIdx, startIdx + 3);
  return formatMulti({ ...a, fmt: { ...a.fmt, decimals: a.fmt?.decimals ?? 0 } }, chosen, s, true);
}

export function formatQuantity(a: Quantity, s: Settings): Formatted {
  const fmt = a.fmt ?? {};
  if (fmt.multi) return formatMulti(a, fmt.multi, s);
  if (fmt.humanizeParts) return humanizeParts(a, s);
  if (fmt.humanize) return formatQuantity(humanize({ ...a, fmt: undefined }), s);

  if (isPlain(a)) {
    if (fmt.base) {
      const t = toBase(a.v, fmt.base);
      return { text: t, copy: t.replace(/ \(base \d+\)$/, '') };
    }
    if (fmt.fraction) {
      const t = formatFraction(a.v);
      return { text: t, copy: t.replace('≈ ', '') };
    }
    if (fmt.words) {
      const t = toWords(a.v);
      return { text: t, copy: t };
    }
    if (fmt.roman) {
      const t = toRoman(a.v);
      return { text: t, copy: t };
    }
  }

  const money = formatMoney(a, s);
  if (money) return money;

  let num: Formatted;
  if (fmt.fraction) {
    const t = formatFraction(a.v);
    num = { text: t, copy: t.replace('≈ ', '') };
  } else {
    num = formatNumber(a.v, { maxDecimals: s.decimals, sep: s.separators && !fmt.noSep, fixed: fmt.decimals, sigfigs: fmt.sigfigs, sci: fmt.sci });
  }
  const label = unitLabel(a.terms, a.v);
  return { text: joinUnit(num.text, label), copy: joinUnit(num.copy, label) };
}

export function formatValue(v: Value, s: Settings, now: number): Formatted {
  if (v.kind === 'dt') {
    const t = formatDateTime(v, { hour12: s.hour12, locale: s.locale, now });
    return { text: t, copy: t };
  }
  return formatQuantity(v, s);
}

/** Shared helper so callers can make quantities in a specific unit. */
export function inUnit(v: number, id: string): Quantity {
  return q(v, [{ u: getUnit(id), p: null, pow: 1 }]);
}

export { fromSI };
