// Dimension vectors. Every quantity carries an exponent for each base dimension,
// so arbitrary compound units (km/h, kg·m/s², $/kWh, GB/s) fall out naturally.

export const DIM_NAMES = [
  'length',
  'mass',
  'time',
  'current',
  'temperature',
  'amount',
  'luminosity',
  'data',
  'currency',
  'angle',
] as const;

export type DimName = (typeof DIM_NAMES)[number];
export type Dim = readonly number[];

const EPS = 1e-9;

export function makeDim(p: Partial<Record<DimName, number>> = {}): Dim {
  return DIM_NAMES.map((n) => p[n] ?? 0);
}

export const DIMLESS: Dim = makeDim();

export function dimAdd(a: Dim, b: Dim, k = 1): Dim {
  return a.map((x, i) => x + b[i] * k);
}

export function dimScale(a: Dim, k: number): Dim {
  return a.map((x) => x * k);
}

export function dimEq(a: Dim, b: Dim): boolean {
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > EPS) return false;
  return true;
}

export function dimIsNone(a: Dim): boolean {
  for (const x of a) if (Math.abs(x) > EPS) return false;
  return true;
}

export function dimIsInverse(a: Dim, b: Dim): boolean {
  if (dimIsNone(a)) return false;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] + b[i]) > EPS) return false;
  return true;
}

/** Human readable description, e.g. "length/time". */
export function dimDescribe(a: Dim): string {
  if (dimIsNone(a)) return 'a plain number';
  const named = NAMED_DIMS.find((n) => dimEq(n.dim, a));
  if (named) return named.name;
  const num: string[] = [];
  const den: string[] = [];
  a.forEach((x, i) => {
    if (Math.abs(x) < EPS) return;
    const p = Math.abs(x);
    const s = DIM_NAMES[i] + (Math.abs(p - 1) < EPS ? '' : '^' + +p.toFixed(3));
    (x > 0 ? num : den).push(s);
  });
  return (num.join('·') || '1') + (den.length ? '/' + den.join('·') : '');
}

const NAMED_DIMS: { name: string; dim: Dim }[] = [
  { name: 'length', dim: makeDim({ length: 1 }) },
  { name: 'area', dim: makeDim({ length: 2 }) },
  { name: 'volume', dim: makeDim({ length: 3 }) },
  { name: 'mass', dim: makeDim({ mass: 1 }) },
  { name: 'time', dim: makeDim({ time: 1 }) },
  { name: 'temperature', dim: makeDim({ temperature: 1 }) },
  { name: 'speed', dim: makeDim({ length: 1, time: -1 }) },
  { name: 'acceleration', dim: makeDim({ length: 1, time: -2 }) },
  { name: 'force', dim: makeDim({ mass: 1, length: 1, time: -2 }) },
  { name: 'energy', dim: makeDim({ mass: 1, length: 2, time: -2 }) },
  { name: 'power', dim: makeDim({ mass: 1, length: 2, time: -3 }) },
  { name: 'pressure', dim: makeDim({ mass: 1, length: -1, time: -2 }) },
  { name: 'frequency', dim: makeDim({ time: -1 }) },
  { name: 'data', dim: makeDim({ data: 1 }) },
  { name: 'data rate', dim: makeDim({ data: 1, time: -1 }) },
  { name: 'currency', dim: makeDim({ currency: 1 }) },
  { name: 'angle', dim: makeDim({ angle: 1 }) },
  { name: 'current', dim: makeDim({ current: 1 }) },
  { name: 'voltage', dim: makeDim({ mass: 1, length: 2, time: -3, current: -1 }) },
  { name: 'fuel economy', dim: makeDim({ length: -2 }) },
];
