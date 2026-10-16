import { dimEq, makeDim } from './dims';
import { addMonths, calendarDayDiff, daysInMonth, startOfDay, zonedParts, zonedToMs } from './datetime';
import type { Settings } from './format';
import type { ClockTime, DateSpec, Node, Target } from './parser';
import {
  CalcError,
  NoResult,
  type DateTimeValue,
  type Quantity,
  type Value,
  add,
  alignPair,
  convert,
  dimOf,
  hasRatio,
  isCurrency,
  isPercent,
  isPlain,
  isTime,
  mulDiv,
  negate,
  power,
  q,
  stripRatio,
  toSI,
} from './quantity';
import { type Term, getUnit, termsDim } from './units';
import { CONSTANTS, holidayDate } from './vocab';

export interface EvalContext {
  vars: Map<string, Value>;
  prev: Value | null;
  /** Values of preceding lines in the current block (for sum/avg). */
  block: Value[];
  now: number;
  settings: Settings;
}

const ANGLE = makeDim({ angle: 1 });
const unit = (id: string, pow = 1): Term => ({ u: getUnit(id), p: null, pow });

function asQ(v: Value, what = 'a number'): Quantity {
  if (v.kind !== 'q') throw new CalcError(`Expected ${what}, got a date`);
  return v;
}

function plainNum(v: Value, fn: string): number {
  const a = stripRatio(asQ(v));
  if (!isPlain(a)) throw new CalcError(`${fn} needs a plain number`);
  return a.v;
}

function intArg(v: Value, fn: string): number {
  const n = plainNum(v, fn);
  if (!Number.isInteger(Math.round(n * 1e9) / 1e9)) throw new CalcError(`${fn} needs whole numbers`);
  return Math.round(n);
}

export function evaluate(node: Node, ctx: EvalContext): Value {
  switch (node.k) {
    case 'num': {
      const r = q(node.v);
      if (node.unknown) r.unknown = node.unknown;
      return r;
    }
    case 'span': {
      const a = evaluate(node.a, ctx);
      const b = evaluate(node.b, ctx);
      let dur: Quantity;
      if (a.kind === 'dt' && b.kind === 'dt') {
        if (!a.hasTime && !b.hasTime) dur = q(Math.abs(calendarDayDiff(a.ms, b.ms, null)), [unit('day')]);
        else {
          let s = (b.ms - a.ms) / 1000;
          // "9pm to 2am" crosses midnight
          if (s < 0 && !a.hasDate && !b.hasDate) s += 86400;
          dur = { ...q(Math.abs(s), [unit('s')]), fmt: { humanizeParts: true } };
        }
      } else if (a.kind === 'q' && b.kind === 'q') {
        const r = add(b, a, -1);
        return { ...r, v: Math.abs(r.v) };
      } else throw new CalcError('Expected two dates or two values');
      if (node.unit) {
        const u = evaluate(node.unit, ctx);
        if (u.kind === 'q' && isTime(u)) return convert(dur, u.terms);
      }
      return dur;
    }
    case 'unit':
      return q(1, node.terms.map((t) => ({ ...t })));
    case 'attach': {
      const e = evaluate(node.e, ctx);
      const a = asQ(e);
      if (isPlain(a)) {
        const r = q(a.v, node.terms.map((t) => ({ ...t })));
        if (node.terms.length === 1 && node.terms[0].u.density) r.density = node.terms[0].u.density;
        return r;
      }
      if (node.terms.length === 1 && node.terms[0].u.id === 'percent') throw new CalcError('Only plain numbers can be percentages');
      return mulDiv(a, q(1, node.terms), 1);
    }
    case 'var': {
      const v = ctx.vars.get(node.name);
      if (!v) throw new CalcError(`${node.name} is not defined`);
      return v;
    }
    case 'const': {
      const c = CONSTANTS[node.name];
      return q(c.v, (c.unit ?? []).map(([id, pow]) => (id === 'g' ? { u: getUnit('g'), p: { sym: 'k', name: 'kilo', factor: 1e3 }, pow } : unit(id, pow))));
    }
    case 'neg': {
      const v = evaluate(node.e, ctx);
      return negate(asQ(v));
    }
    case 'bin':
      return binary(node.op, evaluate(node.a, ctx), evaluate(node.b, ctx), ctx);
    case 'call':
      return call(node.fn, node.args.map((a) => evaluate(a, ctx)), ctx);
    case 'conv':
      return convertTo(evaluate(node.e, ctx), node.to, ctx);
    case 'asPct': {
      const [a, b] = alignPair(stripRatio(asQ(evaluate(node.a, ctx))), stripRatio(asQ(evaluate(node.b, ctx))));
      if (b === 0) throw new CalcError('Division by zero');
      const r = a / b;
      const pct = node.mode === 'of' ? r * 100 : node.mode === 'on' ? (r - 1) * 100 : (1 - r) * 100;
      return q(pct, [unit('percent')]);
    }
    case 'solvePct': {
      const p = pctValue(asQ(evaluate(node.p, ctx)));
      const r = asQ(evaluate(node.r, ctx));
      const f = node.mode === 'of' ? p : node.mode === 'on' ? 1 + p : 1 - p;
      if (f === 0) throw new CalcError('Division by zero');
      return q(r.v / f, r.terms);
    }
    case 'pctChange': {
      const [a, b] = alignPair(asQ(evaluate(node.a, ctx)), asQ(evaluate(node.b, ctx)));
      if (a === 0) throw new CalcError('Division by zero');
      return q(((b - a) / Math.abs(a)) * 100, [unit('percent')]);
    }
    case 'agg':
      return aggregate(node.fn, ctx);
    case 'dt':
      return dateValue(node.spec, null, ctx);
    case 'tzq': {
      if (node.e.k !== 'dt') throw new CalcError('Time zone needs a time');
      return dateValue(node.e.spec, node.tz, ctx);
    }
    case 'until': {
      let b = evaluate(node.b, ctx);
      // "years since 1990"
      if (b.kind === 'q' && isPlain(b) && Number.isInteger(b.v) && b.v >= 1000 && b.v <= 9999) {
        b = { kind: 'dt', ms: zonedToMs(b.v, 1, 1, 0, 0, 0, null), tz: null, hasDate: true, hasTime: false };
      }
      if (b.kind !== 'dt') throw new CalcError('Expected a date');
      let target = b;
      // "hours until midnight": a time that has passed today means the next one
      if (!node.since && !b.hasDate && b.ms < ctx.now) target = { ...b, ms: b.ms + 86400000 };
      // an unqualified date that's already passed means next year's
      if (node.b.k === 'dt' && node.b.spec.k === 'date' && node.b.spec.y === undefined && !node.since && b.ms < startOfDay(ctx.now, null)) {
        target = addMonths(b, 12);
      }
      const dateOnly = !target.hasTime;
      const from = dateOnly ? startOfDay(ctx.now, null) : ctx.now;
      let diffS = node.since ? (from - target.ms) / 1000 : (target.ms - from) / 1000;
      if (dateOnly) diffS = (node.since ? calendarDayDiff(target.ms, from, null) : calendarDayDiff(from, target.ms, null)) * 86400;
      const dur = q(diffS, [unit('s')]);
      if (node.a) {
        const a = evaluate(node.a, ctx);
        if (a.kind === 'q' && isTime(a)) return convert(dur, a.terms);
      }
      if (dateOnly) return convert(dur, [unit('day')]);
      return { ...dur, fmt: { humanizeParts: true } };
    }
    case 'density': {
      const v = asQ(evaluate(node.e, ctx));
      return { ...v, density: node.density, liquid: node.liquid };
    }
    case 'ago': {
      const d = asQ(evaluate(node.e, ctx), 'a duration');
      if (!isTime(d)) throw new NoResult('not a duration');
      const base: DateTimeValue = { kind: 'dt', ms: ctx.now, tz: null, hasDate: true, hasTime: true };
      const r = addDuration(base, d, node.dir);
      const wholeDays = toSI(d) % 86400 === 0;
      return { ...r, hasTime: !wholeDays };
    }
  }
}

function pctValue(a: Quantity): number {
  if (isPercent(a) || hasRatio(a)) return stripRatio(a).v;
  if (isPlain(a)) return a.v / 100;
  throw new CalcError('Expected a percentage');
}

// ---------------------------------------------------------------------------
// Binary operators

function binary(op: string, av: Value, bv: Value, ctx: EvalContext): Value {
  if (av.kind === 'dt' || bv.kind === 'dt') return dateBinary(op, av, bv, ctx);
  const a = av;
  const b = bv;
  switch (op) {
    case '+':
    case '-': {
      const sign = op === '+' ? 1 : -1;
      // $50 + 10% → $55
      if (isPercent(b) && !hasRatio(a)) return q(a.v * (1 + (sign * b.v) / 100), a.terms, a.fmt);
      return add(a, b, sign);
    }
    case '*':
      return mulDiv(a, b, 1);
    case '/':
      return mulDiv(a, b, -1);
    case '^':
      return power(a, b);
    case 'of':
      // "20% of 50%" stays a percentage; "page 5 of 10" isn't math
      if (hasRatio(a) && hasRatio(b)) return mulDiv(a, b, 1);
      if (isPlain(a) && Math.abs(a.v) > 1) throw new NoResult('of');
      return mulDiv(stripRatio(a), b, 1);
    case 'rsub':
      return binary('-', b, a, ctx);
    case 'on':
    case 'off': {
      const p = pctValue(a);
      return q(b.v * (op === 'on' ? 1 + p : 1 - p), b.terms);
    }
    case 'mod': {
      const [x, y, terms] = alignPair(a, b);
      if (y === 0) throw new CalcError('Division by zero');
      return q(x - y * Math.floor(x / y), terms);
    }
    case 'ncr':
      return call('ncr', [a, b], ctx);
    case 'at':
      // "2 nights at $150", "5 hours @ $20": a quantity at a price per item
      if (isCurrency(b) && !isCurrency(a) && !isPlain(a)) return q(a.v * b.v, b.terms);
      return mulDiv(a, b, 1);
    case '&':
    case '|':
    case 'xor':
    case '<<':
    case '>>': {
      const x = BigInt(intArg(a, op));
      const y = BigInt(intArg(b, op));
      const r = op === '&' ? x & y : op === '|' ? x | y : op === 'xor' ? x ^ y : op === '<<' ? x << y : x >> y;
      return q(Number(r));
    }
  }
  throw new CalcError('Unknown operator ' + op);
}

const CALENDAR_MONTHS: Record<string, number> = { month: 1, year: 12, decade: 120, century: 1200, millennium: 12000 };

function addBusinessDays(d: DateTimeValue, n: number): DateTimeValue {
  const p = zonedParts(d.ms, d.tz);
  let day = p.d;
  let wd = p.wd;
  const step = n < 0 ? -1 : 1;
  for (let left = Math.abs(Math.round(n)); left > 0; ) {
    day += step;
    wd = (wd + step + 7) % 7;
    if (wd !== 0 && wd !== 6) left--;
  }
  return { ...d, ms: zonedToMs(p.y, p.mo, day, p.h, p.mi, p.s, d.tz) };
}

function addDuration(d: DateTimeValue, dur: Quantity, sign: number): DateTimeValue {
  if (!isTime(dur)) throw new CalcError('Can only add durations to dates');
  if (dur.terms.length === 1 && dur.terms[0].u.id === 'bday') return addBusinessDays(d, sign * dur.v);
  if (dur.terms.length === 1 && dur.terms[0].pow === 1 && CALENDAR_MONTHS[dur.terms[0].u.id]) {
    return addMonths(d, sign * dur.v * CALENDAR_MONTHS[dur.terms[0].u.id]);
  }
  const secs = toSI(dur) * sign;
  const hasTime = d.hasTime || secs % 86400 !== 0;
  // days/weeks: keep wall-clock time across DST changes
  if (secs % 86400 === 0 && dur.terms.every((t) => t.u.id === 'day' || t.u.id === 'week' || t.u.id === 'fortnight')) {
    const p = zonedParts(d.ms, d.tz);
    const ms = zonedToMs(p.y, p.mo, p.d + secs / 86400, p.h, p.mi, p.s, d.tz);
    return { ...d, ms, hasTime };
  }
  return { ...d, ms: d.ms + secs * 1000, hasTime };
}

function dateBinary(op: string, a: Value, b: Value, ctx: EvalContext): Value {
  void ctx;
  if (op === '+') {
    if (a.kind === 'dt' && b.kind === 'q') return addDuration(a, b, 1);
    if (a.kind === 'q' && b.kind === 'dt') return addDuration(b, a, 1);
    throw new CalcError("Can't add two dates");
  }
  if (op === '-') {
    if (a.kind === 'dt' && b.kind === 'q') return addDuration(a, b, -1);
    if (a.kind === 'dt' && b.kind === 'dt') {
      if (!a.hasTime && !b.hasTime) return q(calendarDayDiff(b.ms, a.ms, null), [unit('day')]);
      return { ...q((a.ms - b.ms) / 1000, [unit('s')]), fmt: { humanizeParts: true } };
    }
    throw new CalcError("Can't subtract a date from a number");
  }
  throw new CalcError(`Can't use ${op} with dates`);
}

// ---------------------------------------------------------------------------
// Dates

function withTime(dayMs: number, time: ClockTime | undefined, tz: string | null): number {
  const p = zonedParts(dayMs, tz);
  return zonedToMs(p.y, p.mo, p.d, time?.h ?? 0, time?.m ?? 0, time?.s ?? 0, tz);
}

function dateValue(spec: DateSpec, tz: string | null, ctx: EvalContext): DateTimeValue {
  const now = ctx.now;
  const mk = (ms: number, hasDate: boolean, hasTime: boolean): DateTimeValue => ({ kind: 'dt', ms, tz, hasDate, hasTime });
  const today = zonedParts(now, tz);
  switch (spec.k) {
    case 'now':
      return mk(now, !spec.timeOnly, true);
    case 'today': {
      const ms = zonedToMs(today.y, today.mo, today.d + spec.days, spec.time?.h ?? 0, spec.time?.m ?? 0, spec.time?.s ?? 0, tz);
      return mk(ms, true, !!spec.time);
    }
    case 'time':
      return { ...mk(zonedToMs(today.y, today.mo, today.d, spec.time.h, spec.time.m, spec.time.s, tz), false, true), seconds: spec.time.s !== 0 };
    case 'date': {
      const y = spec.y ?? today.y;
      if (spec.mo < 1 || spec.mo > 12 || spec.d > daysInMonth(y, spec.mo)) {
        const name = new Date(Date.UTC(y, spec.mo - 1, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
        throw new CalcError(`${name} ${y} only has ${daysInMonth(y, spec.mo)} days`);
      }
      const ms = zonedToMs(y, spec.mo, spec.d, spec.time?.h ?? 0, spec.time?.m ?? 0, spec.time?.s ?? 0, tz);
      return mk(ms, true, !!spec.time);
    }
    case 'weekday': {
      let delta = (spec.wd - today.wd + 7) % 7;
      if (spec.rel === 'next' && delta === 0) delta = 7;
      if (spec.rel === 'last') delta = delta === 0 ? -7 : delta - 7;
      const ms = zonedToMs(today.y, today.mo, today.d + delta, spec.time?.h ?? 0, spec.time?.m ?? 0, spec.time?.s ?? 0, tz);
      return mk(ms, true, !!spec.time);
    }
    case 'rel': {
      const base = mk(zonedToMs(today.y, today.mo, today.d, 0, 0, 0, tz), true, false);
      if (spec.unit === 'month') return addMonths(base, spec.n);
      if (spec.unit === 'year') return addMonths(base, 12 * spec.n);
      const days = spec.unit === 'week' ? 7 * spec.n : spec.n;
      return { ...base, ms: zonedToMs(today.y, today.mo, today.d + days, 0, 0, 0, tz) };
    }
    case 'holiday': {
      const [mo, d] = holidayDate(spec.name, today.y);
      let ms = withTime(zonedToMs(today.y, mo, d, 0, 0, 0, tz), spec.time, tz);
      if (ms < startOfDay(now, tz)) {
        const [mo2, d2] = holidayDate(spec.name, today.y + 1);
        ms = withTime(zonedToMs(today.y + 1, mo2, d2, 0, 0, 0, tz), spec.time, tz);
      }
      return mk(ms, true, !!spec.time);
    }
  }
}

// ---------------------------------------------------------------------------
// Conversions

function convertTo(v: Value, t: Target, ctx: EvalContext): Value {
  if (t.k === 'tz') {
    if (v.kind !== 'dt') return v; // "$50 in Paris" — the place is just context
    return { ...v, tz: t.tz };
  }
  if (t.k === 'date') {
    let d: DateTimeValue;
    if (v.kind === 'dt') d = v;
    else {
      const n = stripRatio(v);
      if (!isPlain(n)) throw new CalcError('Only timestamps convert to dates');
      d = fromUnix(n.v);
    }
    return t.iso ? { ...d, iso: true } : d;
  }
  if (v.kind === 'dt') {
    if (t.k === 'fmt' && t.f === 'unix') return q(Math.floor(v.ms / 1000), [], { noSep: true });
    if (t.k === 'units' && dimEq(termsDim(t.terms), makeDim({ time: 1 }))) {
      // "2:30 in minutes" is a duration; "now in ms" is epoch time
      if (!v.hasDate) {
        const p = zonedParts(v.ms, v.tz);
        return convert(q(p.h * 3600 + p.mi * 60 + p.s, [unit('s')]), t.terms);
      }
      return { ...convert(q(v.ms / 1000, [unit('s')]), t.terms), fmt: { noSep: true } };
    }
    throw new CalcError("Can't convert a date to that");
  }
  switch (t.k) {
    case 'units': {
      // "$50 per hour in per day": only the denominator changes
      if (t.terms.every((x) => x.pow < 0) && v.terms.some((x) => x.pow > 0) && !dimEq(termsDim(v.terms), termsDim(t.terms))) {
        return convert(v, [...v.terms.filter((x) => x.pow > 0), ...t.terms]);
      }
      return convert(v, t.terms);
    }
    case 'multi': {
      const r = convert(v, [t.parts[0]]);
      return { ...r, fmt: { multi: t.parts } };
    }
    case 'round': {
      if (t.nearest) {
        const n = asQ(evaluate(t.nearest, ctx));
        const [x, step, terms] = alignPair(stripRatio(v), stripRatio(n));
        if (step === 0) throw new CalcError('Division by zero');
        return q(Math.round(x / step) * step, terms);
      }
      if (t.dp !== undefined) return { ...v, v: roundTo(v.v, t.dp), fmt: { ...v.fmt, decimals: t.dp, humanize: false } };
      return { ...v, v: Number(v.v.toPrecision(t.sf!)), fmt: { ...v.fmt, sigfigs: t.sf, humanize: false } };
    }
    case 'fmt': {
      switch (t.f) {
        case 'pct': {
          if (isPercent(v)) return v;
          const s = stripRatio(v);
          if (!isPlain(s)) throw new CalcError("Can't express units as a percentage");
          return q(s.v * 100, [unit('percent')]);
        }
        case 'dec':
          return q(stripRatio(v).v, stripRatio(v).terms);
        case 'sci':
          return { ...v, fmt: { sci: true } };
        case 'frac':
          return { ...stripRatio(v), fmt: { fraction: true } };
        case 'unix':
          throw new CalcError('Only dates convert to unix time');
      }
      const n = stripRatio(v);
      if (!isPlain(n)) throw new CalcError(`${t.f} needs a plain number`);
      if (t.f === 'words') return { ...n, fmt: { words: true } };
      if (t.f === 'roman') return { ...n, fmt: { roman: true } };
      const base = t.f === 'hex' ? 16 : t.f === 'bin' ? 2 : t.f === 'oct' ? 8 : t.base!;
      return { ...n, fmt: { base } };
    }
  }
}

function roundTo(x: number, dp: number): number {
  if (dp > 15) return x;
  const f = 10 ** dp;
  return Math.round((x + Math.sign(x) * Number.EPSILON) * f) / f;
}

// ---------------------------------------------------------------------------
// Aggregates

function aggregate(fn: 'sum' | 'avg' | 'prev' | 'count', ctx: EvalContext): Value {
  if (fn === 'prev') {
    if (!ctx.prev) throw new CalcError('No previous result');
    return ctx.prev;
  }
  const qs = ctx.block.filter((v): v is Quantity => v.kind === 'q');
  if (fn === 'count') return q(qs.length);
  return sumOf(qs, fn === 'avg');
}

function sumOf(qs: Quantity[], avg: boolean): Quantity {
  if (!qs.length) throw new NoResult('nothing to add up');
  // use the first value with units as the reference so "$5 \n 3 \n sum" is $8
  const ref = qs.find((x) => !isPlain(x)) ?? qs[0];
  let total = q(0, ref.terms);
  let n = 0;
  for (const x of qs) {
    if (!isPlain(x) && !dimEq(dimOf(x), dimOf(ref))) continue;
    total = add(total, x, 1);
    n++;
  }
  return avg ? q(total.v / n, total.terms) : total;
}

// ---------------------------------------------------------------------------
// Functions

/** Seconds since 1970, or milliseconds if the number is clearly too big for seconds. */
function fromUnix(n: number): DateTimeValue {
  const ms = Math.abs(n) > 1e11 ? n : n * 1000;
  return { kind: 'dt', ms, tz: null, hasDate: true, hasTime: true, seconds: true };
}

function gammaFn(z: number): number {
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gammaFn(1 - z));
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61503916999185, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * t ** (z + 0.5) * Math.exp(-t) * x;
}

function factorial(n: number): number {
  if (n < 0) throw new CalcError('Factorial of a negative number');
  if (Number.isInteger(n)) {
    if (n > 170) return Infinity;
    let r = 1;
    for (let i = 2; i <= n; i++) r *= i;
    return r;
  }
  return gammaFn(n + 1);
}

function gcd2(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

function angleIn(v: Value, ctx: EvalContext): number {
  const a = stripRatio(asQ(v));
  if (isPlain(a)) return ctx.settings.angle === 'deg' ? (a.v * Math.PI) / 180 : a.v;
  if (dimEq(dimOf(a), ANGLE)) return toSI(a);
  throw new CalcError('Trig functions need an angle or a number');
}

function angleOut(rad: number, ctx: EvalContext): Quantity {
  if (Number.isNaN(rad)) throw new CalcError('Result is not a real number');
  if (ctx.settings.angle === 'deg') return q((rad * 180) / Math.PI, [unit('deg')]);
  return q(rad, [unit('rad')]);
}

function real(x: number): Quantity {
  if (Number.isNaN(x)) throw new CalcError('Result is not a real number');
  return q(x);
}

function sameUnits(args: Value[], fn: string): { vals: number[]; terms: Term[] } {
  if (!args.length) throw new CalcError(`${fn} needs at least one value`);
  const qs = args.map((a) => asQ(a));
  const ref = qs.find((x) => !isPlain(x)) ?? qs[0];
  return { vals: qs.map((x) => alignPair(ref, x)[1]), terms: ref.terms };
}

function call(fn: string, args: Value[], ctx: EvalContext): Value {
  const a0 = args[0];
  const need = (n: number) => {
    if (args.length < n) throw new NoResult(`${fn} needs ${n} argument${n > 1 ? 's' : ''}`);
  };
  switch (fn) {
    case 'sqrt':
      need(1);
      return power(asQ(a0), q(0.5));
    case 'cbrt': {
      need(1);
      const a = asQ(a0);
      if (isPlain(a)) return q(Math.cbrt(a.v));
      return power(a, q(1 / 3));
    }
    case 'root':
      need(1);
      return power(asQ(a0), q(1 / (args[1] ? plainNum(args[1], 'root') : 2)));
    case 'bitnot':
      need(1);
      return q(Number(~BigInt(intArg(a0, '~'))));
    case 'dayofyear':
    case 'weekofyear': {
      const p = zonedParts(ctx.now, null);
      const doy = Math.round((Date.UTC(p.y, p.mo - 1, p.d) - Date.UTC(p.y, 0, 1)) / 86400000) + 1;
      if (fn === 'dayofyear') return q(doy);
      // ISO 8601 week: the week containing this date's Thursday
      const wd = (p.wd + 6) % 7;
      const thu = Date.UTC(p.y, p.mo - 1, p.d - wd + 3);
      const yStart = Date.UTC(new Date(thu).getUTCFullYear(), 0, 1);
      return q(Math.floor((thu - yStart) / 86400000 / 7) + 1);
    }
    case 'pow':
      need(2);
      return power(asQ(a0), asQ(args[1]));
    case 'abs': {
      need(1);
      const a = asQ(a0);
      return { ...a, v: Math.abs(a.v) };
    }
    case 'round':
    case 'ceil':
    case 'floor':
    case 'trunc': {
      need(1);
      const a = asQ(a0);
      const dp = args[1] ? plainNum(args[1], fn) : 0;
      const f = 10 ** dp;
      const away = (x: number) => Math.sign(x) * Math.round(Math.abs(x));
      const m = fn === 'round' ? away : fn === 'ceil' ? Math.ceil : fn === 'floor' ? Math.floor : Math.trunc;
      return { ...a, v: m(+(a.v * f).toPrecision(15)) / f };
    }
    case 'sign':
      need(1);
      return q(Math.sign(asQ(a0).v));
    case 'log': {
      need(1);
      const x = plainNum(a0, 'log');
      if (args[1]) return real(Math.log(x) / Math.log(plainNum(args[1], 'log')));
      return real(Math.log10(x));
    }
    case 'log10':
      need(1);
      return real(Math.log10(plainNum(a0, fn)));
    case 'log2':
      need(1);
      return real(Math.log2(plainNum(a0, fn)));
    case 'ln':
      need(1);
      return real(Math.log(plainNum(a0, fn)));
    case 'exp':
      need(1);
      return real(Math.exp(plainNum(a0, fn)));
    case 'sin':
    case 'cos':
    case 'tan':
    case 'sec':
    case 'csc':
    case 'cot': {
      need(1);
      const x = angleIn(a0, ctx);
      let r = fn === 'sin' || fn === 'csc' ? Math.sin(x) : fn === 'cos' || fn === 'sec' ? Math.cos(x) : Math.tan(x);
      // clean up floating noise at exact angles (sin π = 0)
      if (Math.abs(r) < 1e-12) r = 0;
      if (fn === 'sec' || fn === 'csc' || fn === 'cot') {
        if (r === 0) throw new CalcError('Division by zero');
        r = 1 / r;
      }
      return q(r);
    }
    case 'asin':
      need(1);
      return angleOut(Math.asin(plainNum(a0, fn)), ctx);
    case 'acos':
      need(1);
      return angleOut(Math.acos(plainNum(a0, fn)), ctx);
    case 'atan':
      need(1);
      return angleOut(Math.atan(plainNum(a0, fn)), ctx);
    case 'atan2':
      need(2);
      return angleOut(Math.atan2(plainNum(a0, fn), plainNum(args[1], fn)), ctx);
    case 'sinh':
    case 'cosh':
    case 'tanh':
    case 'asinh':
    case 'acosh':
    case 'atanh':
      need(1);
      return real(Math[fn](plainNum(a0, fn)));
    case 'fact':
      need(1);
      return q(factorial(plainNum(a0, 'factorial')));
    case 'gamma':
      need(1);
      return q(gammaFn(plainNum(a0, fn)));
    case 'gcd':
    case 'lcm': {
      need(2);
      const ns = args.map((a) => intArg(a, fn));
      const r = fn === 'gcd' ? ns.reduce(gcd2) : ns.reduce((a, b) => (a && b ? Math.abs(a * b) / gcd2(a, b) : 0));
      return q(r);
    }
    case 'min':
    case 'max': {
      const { vals, terms } = sameUnits(args, fn);
      return q(fn === 'min' ? Math.min(...vals) : Math.max(...vals), terms);
    }
    case 'hypot': {
      const { vals, terms } = sameUnits(args, fn);
      return q(Math.hypot(...vals), terms);
    }
    case 'sum':
    case 'avg': {
      if (!args.length) return aggregate(fn, ctx);
      return sumOf(args.map((a) => asQ(a)), fn === 'avg');
    }
    case 'count':
      return q(args.length);
    case 'random': {
      if (!args.length) return q(Math.random());
      const lo = args.length > 1 ? plainNum(a0, fn) : 0;
      const hi = plainNum(args[args.length - 1], fn);
      return q(Math.floor(lo + Math.random() * (hi - lo + 1)));
    }
    case 'fromunix': {
      need(1);
      const a = asQ(a0);
      return isPlain(a) ? fromUnix(a.v) : fromUnix(toSI(a));
    }
    case 'median':
    case 'mode':
    case 'stdev':
    case 'variance':
    case 'product': {
      const { vals, terms } = sameUnits(args, fn);
      if (fn === 'product') return args.map((x) => asQ(x)).reduce((p, x) => mulDiv(p, x, 1));
      if (fn === 'median') {
        const s = [...vals].sort((x, y) => x - y);
        const mid = s.length / 2;
        return q(s.length % 2 ? s[Math.floor(mid)] : (s[mid - 1] + s[mid]) / 2, terms);
      }
      if (fn === 'mode') {
        const counts = new Map<number, number>();
        for (const x of vals) counts.set(x, (counts.get(x) ?? 0) + 1);
        return q([...counts.entries()].sort((x, y) => y[1] - x[1])[0][0], terms);
      }
      const mean = vals.reduce((s, x) => s + x, 0) / vals.length;
      const variance = vals.length < 2 ? 0 : vals.reduce((s, x) => s + (x - mean) ** 2, 0) / (vals.length - 1);
      if (fn === 'variance') return q(variance, terms.map((t) => ({ ...t, pow: t.pow * 2 })));
      return q(Math.sqrt(variance), terms);
    }
    case 'hex':
    case 'bin':
    case 'oct':
      need(1);
      return { ...q(plainNum(a0, fn)), fmt: { base: fn === 'hex' ? 16 : fn === 'bin' ? 2 : 8 } };
    case 'fracpart': {
      need(1);
      const a = asQ(a0);
      return { ...a, v: a.v - Math.trunc(a.v) };
    }
    case 'ncr':
    case 'npr': {
      need(2);
      const n = intArg(a0, fn);
      const k = intArg(args[1], fn);
      if (k < 0 || k > n) return q(0);
      let r = 1;
      for (let i = 0; i < k; i++) r = (r * (n - i)) / (fn === 'ncr' ? i + 1 : 1);
      return q(Math.round(r));
    }
    case 'isprime': {
      need(1);
      const n = intArg(a0, fn);
      if (n < 2) return q(0);
      for (let i = 2; i * i <= n; i++) if (n % i === 0) return q(0);
      return q(1);
    }
  }
  throw new CalcError(`Unknown function ${fn}`);
}

export { termsDim };
