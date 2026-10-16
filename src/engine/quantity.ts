import { type Dim, DIM_NAMES, dimAdd, dimDescribe, dimEq, dimIsInverse, dimIsNone, makeDim } from './dims';
import {
  type Term,
  type UnitDef,
  expandTerm,
  prefixBySym,
  suggestUnit,
  getUnit,
  recompose,
  sameUnit,
  termFactor,
  termsDim,
  termsFactor,
} from './units';

/** Output formatting requested by a conversion ("in hex", "to 2 dp", "in ft in"). */
export interface Fmt {
  base?: number;
  sci?: boolean;
  fraction?: boolean;
  decimals?: number;
  sigfigs?: number;
  /** Mixed-unit display, e.g. [ft, in] → "5 ft 10.5 in". */
  multi?: Term[];
  /** Pick the most readable unit (durations, data sizes). */
  humanize?: boolean;
  /** Spell out durations as "2 days 3 hours". */
  humanizeParts?: boolean;
  /** No thousands separators (timestamps). */
  noSep?: boolean;
  words?: boolean;
  roman?: boolean;
}

export interface Quantity {
  kind: 'q';
  v: number;
  terms: Term[];
  fmt?: Fmt;
  /** An unrecognized word followed this number; it must not silently become a unit. */
  unknown?: string;
  /** A temperature difference (30°C - 20°C), converted by scale only. */
  tempDelta?: boolean;
  /** Density in kg/m³ when the value names a substance ("2 cups flour"). */
  density?: number;
  liquid?: boolean;
}

export interface DateTimeValue {
  kind: 'dt';
  /** UTC epoch milliseconds. */
  ms: number;
  /** IANA zone used for display, or null for the local zone. */
  tz: string | null;
  hasDate: boolean;
  hasTime: boolean;
  /** Show seconds (explicit times, unix timestamps). */
  seconds?: boolean;
  /** Display as ISO 8601. */
  iso?: boolean;
}

export type Value = Quantity | DateTimeValue;

/** An error worth showing to the user (bad units, division by zero...). */
export class CalcError extends Error {}

/** The line isn't really a calculation; show nothing rather than an error. */
export class NoResult extends Error {}

export const q = (v: number, terms: Term[] = [], fmt?: Fmt): Quantity => ({ kind: 'q', v, terms, fmt });

export const isPlain = (a: Quantity) => a.terms.length === 0;
export const isPercent = (a: Quantity) => a.terms.length === 1 && a.terms[0].u.id === 'percent' && a.terms[0].pow === 1;
export const hasRatio = (a: Quantity) => a.terms.some((t) => t.u.ratio);
export const dimOf = (a: Quantity): Dim => termsDim(a.terms);
export const isCurrency = (a: Quantity) => a.terms.length === 1 && !!a.terms[0].u.currency && a.terms[0].pow === 1;

function offsetTerm(terms: readonly Term[]): Term | null {
  if (terms.length === 1 && terms[0].pow === 1 && terms[0].u.offset !== 0) return terms[0];
  return null;
}

export function toSI(a: Quantity): number {
  const t = offsetTerm(a.terms);
  if (t) {
    const si = a.v * termFactor(t) + t.u.offset;
    return Math.abs(si) < 1e-9 * t.u.offset ? 0 : si;
  }
  return a.v * termsFactor(a.terms);
}

export function fromSI(si: number, terms: readonly Term[]): number {
  const t = offsetTerm(terms);
  if (t) {
    const d = si - t.u.offset;
    // -459.67°F in K is exactly 0, not 2.8e-14
    return Math.abs(d) < 1e-9 * Math.abs(t.u.offset) ? 0 : d / termFactor(t);
  }
  return si / termsFactor(terms);
}

/** 20% → 0.2, 5 ppm → 0.000005 (other units kept). */
export function stripRatio(a: Quantity): Quantity {
  if (!hasRatio(a)) return a;
  let v = a.v;
  const rest: Term[] = [];
  for (const t of a.terms) {
    if (t.u.ratio) v *= termFactor(t);
    else rest.push(t);
  }
  return q(v, rest);
}

export function describeTerms(terms: readonly Term[]): string {
  if (!terms.length) return 'a plain number';
  return termsLabel(terms);
}

export function termsLabel(terms: readonly Term[]): string {
  const num = terms.filter((t) => t.pow > 0);
  const den = terms.filter((t) => t.pow < 0);
  const one = (t: Term, pow: number) => (t.p?.sym ?? '') + (t.u.currency ? t.u.id : t.u.symbol) + supPow(pow);
  let s = num.map((t) => one(t, t.pow)).join('·');
  if (den.length) s += (s ? '/' : '1/') + den.map((t) => one(t, -t.pow)).join('·');
  return s;
}

const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '.': '·' };
export function supPow(p: number): string {
  if (Math.abs(p - 1) < 1e-9) return '';
  const r = Math.round(p * 1000) / 1000;
  if (Number.isInteger(r)) return String(r).split('').map((c) => SUP[c] ?? c).join('');
  return '^' + r;
}

// ---------------------------------------------------------------------------
// Conversion

export function unknownUnitMessage(word: string): string {
  const s = suggestUnit(word);
  return s ? `Unknown unit “${word}”. Did you mean ${s}?` : `Unknown unit “${word}”`;
}

const ANGLE_IDX = DIM_NAMES.indexOf('angle');

export function convert(a: Quantity, target: Term[]): Quantity {
  const da = dimOf(a);
  const dt = termsDim(target);
  if (dimEq(da, dt)) {
    if (a.tempDelta) return { ...q((a.v * termsFactor(a.terms)) / termsFactor(target), target), tempDelta: true };
    return q(fromSI(toSI(a), target), target);
  }
  // a bare number is radians when converted to an angle: "pi/2 in degrees"
  if (isPlain(a) && !a.unknown && dimEq(dt, makeDim({ angle: 1 }))) return q(fromSI(a.v, target), target);
  // "100 pounds in dollars" means sterling
  if (a.terms.length === 1 && a.terms[0].u.id === 'lb' && target.length === 1 && target[0].u.currency) {
    return convert(q(a.v, [{ u: getUnit('GBP'), p: null, pow: 1 }]), target);
  }
  if (isPlain(a)) {
    if (a.unknown) throw new CalcError(unknownUnitMessage(a.unknown));
    return q(a.v, target); // "20 in USD" → $20
  }
  // Cycles ↔ radians: rpm ↔ Hz, rad/s ↔ Hz
  const diff = dimAdd(da, dt, -1);
  if (dimIsNone(diff.map((x, i) => (i === ANGLE_IDX ? 0 : x))) && Math.abs(Math.abs(diff[ANGLE_IDX]) - 1) < 1e-9) {
    const si = toSI(a) / (2 * Math.PI) ** diff[ANGLE_IDX];
    return q(fromSI(si, target), target);
  }
  // Reciprocal: mpg ↔ L/100km, Hz ↔ ms
  if (dimIsInverse(da, dt)) {
    const si = toSI(a);
    if (si === 0) throw new CalcError('Division by zero');
    return q(1 / si / termsFactor(target), target);
  }
  // Volume ↔ mass through the substance's density.
  const VOLUME = makeDim({ length: 3 });
  const MASS0 = makeDim({ mass: 1 });
  const ozTerm = a.terms.length === 1 && a.terms[0].u.id === 'oz';
  if (a.density && !(ozTerm && a.liquid && dimEq(dt, VOLUME))) {
    if (dimEq(da, VOLUME) && dimEq(dt, MASS0)) return q(fromSI(toSI(a) * a.density, target), target);
    if (dimEq(da, MASS0) && dimEq(dt, VOLUME)) return q(fromSI(toSI(a) / a.density, target), target);
  }
  // Ounces are ambiguous between mass and volume.
  if (a.terms.length === 1 && a.terms[0].u.id === 'oz' && dimEq(dt, makeDim({ length: 3 }))) {
    return convert(q(a.v, [{ u: getUnit('floz'), p: null, pow: a.terms[0].pow }]), target);
  }
  // Weight ↔ force under standard gravity: lb → N, lb/in² → kPa
  const ACCEL = makeDim({ length: 1, time: -2 });
  if (dimEq(dimAdd(da, ACCEL), dt)) return q(fromSI(toSI(a) * 9.80665, target), target);
  if (dimEq(dimAdd(dt, ACCEL), da)) return q(fromSI(toSI(a) / 9.80665, target), target);
  throw new CalcError(`Can't convert ${describeTerms(a.terms)} (${dimDescribe(da)}) to ${describeTerms(target)} (${dimDescribe(dt)})`);
}

/** Value of `b` expressed in `terms`. Temperatures are treated as intervals. */
function valueIn(b: Quantity, terms: readonly Term[], delta: boolean): number {
  if (delta) return (b.v * termsFactor(b.terms)) / termsFactor(terms);
  return fromSI(toSI(b), terms);
}

// ---------------------------------------------------------------------------
// Arithmetic

function snap(x: number, a: number, b: number): number {
  return Math.abs(x) < 1e-12 * Math.max(Math.abs(a), Math.abs(b)) ? 0 : x;
}

export function add(a: Quantity, b: Quantity, sign = 1): Quantity {
  if (isPlain(b)) return q(snap(a.v + sign * b.v, a.v, b.v), a.terms);
  if (isPlain(a)) return q(snap(a.v + sign * b.v, a.v, b.v), b.terms);
  if (!dimEq(dimOf(a), dimOf(b))) {
    throw new CalcError(`Can't ${sign > 0 ? 'add' : 'subtract'} ${describeTerms(b.terms)} ${sign > 0 ? 'to' : 'from'} ${describeTerms(a.terms)}`);
  }
  const delta = !!offsetTerm(a.terms) || !!offsetTerm(b.terms);
  const bv = valueIn(b, a.terms, delta);
  let v = a.v + sign * bv;
  // 0.1 + 0.2 - 0.3 is 0, not 5.6e-17
  if (Math.abs(v) < 1e-12 * Math.max(Math.abs(a.v), Math.abs(bv))) v = 0;
  const r = q(v, a.terms);
  // absolute − absolute temperature is a difference
  if (sign < 0 && offsetTerm(a.terms) && offsetTerm(b.terms) && !a.tempDelta && !b.tempDelta) r.tempDelta = true;
  return r;
}

function canMerge(o: Term, t: Term): boolean {
  const a = o.u;
  const b = t.u;
  if (a.offset || b.offset || a.ratio || b.ratio || a.compose || b.compose) return false;
  if (dimIsNone(a.dim)) return false;
  return dimEq(a.dim, b.dim);
}

function unitFactor(t: Term): number {
  return t.u.factor * (t.p?.factor ?? 1);
}

/** Multiply term lists, merging like dimensions. Returns a scale to apply to the value. */
export function combine(aTerms: readonly Term[], bTerms: readonly Term[], sign: number): { terms: Term[]; scale: number } {
  const out: Term[] = aTerms.map((t) => ({ ...t }));
  let scale = 1;
  for (const t0 of bTerms) {
    const t = { ...t0, pow: t0.pow * sign };
    let i = out.findIndex((o) => sameUnit(o, t) && Math.abs(o.pow) > 1e-9);
    if (i >= 0) {
      out[i].pow += t.pow;
      continue;
    }
    i = out.findIndex((o) => Math.abs(o.pow) > 1e-9 && canMerge(o, t));
    if (i >= 0) {
      scale *= (unitFactor(t) / unitFactor(out[i])) ** t.pow;
      out[i].pow += t.pow;
      continue;
    }
    out.push(t);
  }
  return { terms: out.filter((t) => Math.abs(t.pow) > 1e-9), scale };
}

const DERIVED = ['N', 'J', 'W', 'Pa', 'V', 'ohm', 'A'];
const SI_FAMILY = new Set(['V', 'A', 'ohm', 'W', 'J', 'N', 'Pa', 's', 'm', 'g', 'S', 'coulomb', 'Hz', 'farad', 'henry', 'Wb', 'tesla']);
const PREFIX_STEPS = ['T', 'G', 'M', 'k', '', 'm', 'µ', 'n', 'p'];

/** Re-express a product of SI units as one named unit: V·A → W, kΩ·mA → V. Returns a scale for the value. */
function simplify(terms: Term[]): { terms: Term[]; scale: number } {
  // volts × amps is power even inside a bigger product (A·h·V → W·h → Wh)
  let scale = 1;
  const vi = terms.findIndex((t) => t.u.id === 'V' && t.pow === 1);
  const ai = terms.findIndex((t) => t.u.id === 'A' && t.pow === 1);
  if (vi >= 0 && ai >= 0 && terms.length > 2) {
    scale = termFactor(terms[vi]) * termFactor(terms[ai]);
    terms = [{ u: getUnit('W'), p: null, pow: 1 }, ...terms.filter((_, i) => i !== vi && i !== ai)];
    const r = recompose(terms);
    return { terms: r, scale };
  }
  terms = recompose(terms);
  if (terms.length >= 2 && terms.every((t) => SI_FAMILY.has(t.u.id))) {
    const d = termsDim(terms);
    const hasPrefix = terms.some((t) => t.p && t.u.id !== 'g');
    for (const id of DERIVED) {
      const u = getUnit(id);
      if (!dimEq(u.dim, d)) continue;
      // m/s stays m/s; only collapse into a different named unit
      if (terms.some((t) => t.u.id === id)) break;
      return { terms: [{ u, p: null, pow: 1 }], scale: termsFactor(terms), rescale: hasPrefix } as { terms: Term[]; scale: number };
    }
  }
  return { terms, scale: 1 };
}

/** 9400 mV → 9.4 V: pick an SI prefix that keeps the number readable. */
export function autoPrefix(a: Quantity): Quantity {
  if (a.terms.length !== 1 || a.terms[0].pow !== 1 || !SI_FAMILY.has(a.terms[0].u.id) || a.v === 0) return a;
  const t = a.terms[0];
  const si = a.v * termFactor(t);
  for (const sym of PREFIX_STEPS) {
    const f = sym ? (prefixBySym(sym)?.factor ?? 1) : 1;
    if (Math.abs(si / f) >= 1) return q(si / f, [{ u: t.u, p: sym ? prefixBySym(sym)! : null, pow: 1 }]);
  }
  return a;
}

function expandAll(ts: readonly Term[]): Term[] {
  return ts.flatMap(expandTerm);
}

/** Units that read better per hour: km/min → km/h, mi/min → mph. */
function preferHours(r: Quantity): Quantity {
  if (r.terms.length !== 2) return r;
  const len = r.terms.find((t) => t.pow === 1 && (t.u.id === 'mi' || (t.u.id === 'm' && t.p?.sym === 'k')));
  const time = r.terms.find((t) => t.pow === -1 && (t.u.id === 'min' || t.u.id === 's'));
  if (!len || !time) return r;
  const target = len.u.id === 'mi' ? [{ u: getUnit('mph'), p: null, pow: 1 }] : [len, { u: getUnit('h'), p: null, pow: -1 }];
  return convert(r, target);
}

export function mulDiv(a: Quantity, b: Quantity, sign: 1 | -1): Quantity {
  if (sign < 0 && b.v === 0) throw new CalcError('Division by zero');
  // percentages behave as plain factors in products
  if (hasRatio(a) && hasRatio(b) && a.terms.length === 1 && b.terms.length === 1 && sign > 0) {
    // 50% × 20% = 10%
    const r = stripRatio(a).v * stripRatio(b).v;
    return q(r / termFactor(a.terms[0]), a.terms);
  }
  // a percentage applied to anything else is just a factor: 20% × 50 = 10
  if (hasRatio(a) && !hasRatio(b)) a = stripRatio(a);
  else if (hasRatio(b) && !hasRatio(a)) b = stripRatio(b);
  else if (hasRatio(a) && hasRatio(b)) {
    a = stripRatio(a);
    b = stripRatio(b);
  }
  const v = sign > 0 ? a.v * b.v : a.v / b.v;
  if (isPlain(b)) return q(v, a.terms);
  if (isPlain(a)) {
    const { terms, scale } = combine([], b.terms, sign);
    // 1 / 60 Hz → 16.67 ms
    if (terms.length === 1 && terms[0].u.id === 'Hz' && terms[0].pow === -1) {
      return { ...convert(q(v * scale, terms), [{ u: getUnit('s'), p: null, pow: 1 }]), fmt: { humanize: true } };
    }
    return q(v * scale, terms);
  }
  const { terms, scale } = combine(expandAll(a.terms), expandAll(b.terms), sign);
  const simp = simplify(terms);
  let res = q(v * scale * simp.scale, simp.terms);
  if (simp.terms !== terms && simp.scale !== 1) res = autoPrefix(res);
  res = preferHours(res);
  // computed durations and data sizes get a readable unit (100 GB / 10 MB/s → 2.78 hours)
  // ...but only when the unit came out of a cancellation; "40 h/wk * 52 wk" stays in hours
  const typed = res.terms[0]?.u.category === 'time' && [...a.terms, ...b.terms].some((t) => t.pow > 0 && sameUnit(t, res.terms[0]));
  if (res.terms.length === 1 && res.terms[0].pow === 1 && isAutoScaled(res.terms[0].u) && !typed) {
    res = { ...res, fmt: res.terms[0].u.category === 'time' && Math.abs(toSI(res)) >= 60 ? { humanizeParts: true } : { humanize: true } };
  }
  return res;
}

function isAutoScaled(u: UnitDef) {
  return u.category === 'time' || u.category === 'data';
}

export function power(a: Quantity, b: Quantity): Quantity {
  b = stripRatio(b);
  if (!isPlain(b)) throw new CalcError('Exponent must be a plain number');
  const n = b.v;
  if (hasRatio(a)) a = stripRatio(a);
  const v = a.v ** n;
  if (Number.isNaN(v)) throw new CalcError('Result is not a real number');
  if (isPlain(a)) return q(v);
  const terms = expandAll(a.terms).map((t) => ({ ...t, pow: t.pow * n }));
  return q(v, recompose(terms));
}

export function negate(a: Quantity): Quantity {
  return { ...a, v: -a.v };
}

/** Same-dimension quantities as plain numbers in a's unit (for mod, comparisons). */
export function alignPair(a: Quantity, b: Quantity): [number, number, Term[]] {
  if (isPlain(b)) return [a.v, b.v, a.terms];
  if (isPlain(a)) return [a.v, b.v, b.terms];
  if (!dimEq(dimOf(a), dimOf(b))) throw new CalcError(`Incompatible units: ${describeTerms(a.terms)} and ${describeTerms(b.terms)}`);
  return [a.v, valueIn(b, a.terms, false), a.terms];
}

export function isTime(a: Quantity): boolean {
  return !isPlain(a) && dimEq(dimOf(a), makeDim({ time: 1 }));
}

export function seconds(a: Quantity): number {
  return toSI(a);
}
