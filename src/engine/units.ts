import { CURRENCIES, FALLBACK_RATES, type CurrencyMeta } from './currency';
import { type Dim, type DimName, DIMLESS, dimAdd, dimEq, makeDim } from './dims';

export interface Prefix {
  sym: string;
  name: string;
  factor: number;
}

export interface UnitDef {
  id: string;
  /** Display symbol (unprefixed). */
  symbol: string;
  dim: Dim;
  /** Multiply a value in this unit by `factor` (then add `offset`) to get coherent SI. */
  factor: number;
  offset: number;
  category: string;
  /** Word display, used when the unit stands alone ("3 days", "1 cup"). */
  singular?: string;
  plural?: string;
  /** Composite units expand into these when combined with other units (mph → mi/h). */
  compose?: { id: string; power: number; prefix?: string }[];
  prefixes: Prefix[];
  currency?: CurrencyMeta;
  /** Dimensionless ratio units such as %, ‰, ppm. */
  ratio?: boolean;
  /** Implied density in kg/m³. */
  density?: number;
}

export interface Term {
  u: UnitDef;
  p: Prefix | null;
  pow: number;
}

// ---------------------------------------------------------------------------
// Prefixes

export const SI_PREFIXES: Prefix[] = [
  { sym: 'Q', name: 'quetta', factor: 1e30 },
  { sym: 'R', name: 'ronna', factor: 1e27 },
  { sym: 'Y', name: 'yotta', factor: 1e24 },
  { sym: 'Z', name: 'zetta', factor: 1e21 },
  { sym: 'E', name: 'exa', factor: 1e18 },
  { sym: 'P', name: 'peta', factor: 1e15 },
  { sym: 'T', name: 'tera', factor: 1e12 },
  { sym: 'G', name: 'giga', factor: 1e9 },
  { sym: 'M', name: 'mega', factor: 1e6 },
  { sym: 'k', name: 'kilo', factor: 1e3 },
  { sym: 'h', name: 'hecto', factor: 1e2 },
  { sym: 'da', name: 'deca', factor: 1e1 },
  { sym: 'd', name: 'deci', factor: 1e-1 },
  { sym: 'c', name: 'centi', factor: 1e-2 },
  { sym: 'm', name: 'milli', factor: 1e-3 },
  { sym: 'µ', name: 'micro', factor: 1e-6 },
  { sym: 'n', name: 'nano', factor: 1e-9 },
  { sym: 'p', name: 'pico', factor: 1e-12 },
  { sym: 'f', name: 'femto', factor: 1e-15 },
  { sym: 'a', name: 'atto', factor: 1e-18 },
  { sym: 'z', name: 'zepto', factor: 1e-21 },
  { sym: 'y', name: 'yocto', factor: 1e-24 },
  { sym: 'r', name: 'ronto', factor: 1e-27 },
  { sym: 'q', name: 'quecto', factor: 1e-30 },
];

export const BINARY_PREFIXES: Prefix[] = [
  { sym: 'Ki', name: 'kibi', factor: 2 ** 10 },
  { sym: 'Mi', name: 'mebi', factor: 2 ** 20 },
  { sym: 'Gi', name: 'gibi', factor: 2 ** 30 },
  { sym: 'Ti', name: 'tebi', factor: 2 ** 40 },
  { sym: 'Pi', name: 'pebi', factor: 2 ** 50 },
  { sym: 'Ei', name: 'exbi', factor: 2 ** 60 },
  { sym: 'Zi', name: 'zebi', factor: 2 ** 70 },
  { sym: 'Yi', name: 'yobi', factor: 2 ** 80 },
];

const P = (syms: string[]): Prefix[] => syms.map((s) => SI_PREFIXES.find((p) => p.sym === s)!);
// atto and below collide with words ("as", "am") and are never used in practice
const ALL = SI_PREFIXES.filter((p) => p.factor >= 1e-15 && p.factor <= 1e24);
const SMALL = P(['m', 'µ', 'n', 'p', 'f']);
const DATA = [...P(['Q', 'R', 'Y', 'Z', 'E', 'P', 'T', 'G', 'M', 'k']), ...BINARY_PREFIXES];

export function prefixBySym(sym: string): Prefix | undefined {
  return SI_PREFIXES.find((p) => p.sym === sym) ?? BINARY_PREFIXES.find((p) => p.sym === sym);
}

// ---------------------------------------------------------------------------
// Unit table

interface Spec {
  id: string;
  sym: string;
  cat: string;
  dim?: Partial<Record<DimName, number>>;
  f?: number;
  off?: number;
  /** exact-case aliases */
  al?: string[];
  /** case-insensitive words (include plurals) */
  w?: string[];
  /** word display: [singular, plural] */
  wd?: [string, string];
  pre?: Prefix[];
  /** symbols that accept prefix symbols (default: [sym]) */
  psym?: string[];
  /** words that accept prefix names (default: single-word entries of w) */
  pw?: string[];
  comp?: [string, number, string?][];
  ratio?: boolean;
  /** Implied substance density in g/mL (a stick is butter). */
  density?: number;
}

const s = (...words: string[]) => words.flatMap((w) => [w, w + 's']);

const L = { length: 1 };
const AREA = { length: 2 };
const VOL = { length: 3 };
const M = { mass: 1 };
const T = { time: 1 };
const PI = Math.PI;

const SPECS: Spec[] = [
  // ----- length
  { id: 'm', sym: 'm', cat: 'length', dim: L, f: 1, al: ['m'], w: s('meter', 'metre'), pre: ALL },
  { id: 'in', sym: 'in', cat: 'length', dim: L, f: 0.0254, al: ['in', 'inch'], w: ['inch', 'inches'] },
  { id: 'ft', sym: 'ft', cat: 'length', dim: L, f: 0.3048, al: ['ft'], w: ['foot', 'feet'] },
  { id: 'yd', sym: 'yd', cat: 'length', dim: L, f: 0.9144, al: ['yd', 'yds'], w: s('yard') },
  { id: 'mi', sym: 'mi', cat: 'length', dim: L, f: 1609.344, al: ['mi'], w: s('mile') },
  { id: 'nmi', sym: 'nmi', cat: 'length', dim: L, f: 1852, al: ['nmi', 'NM'], w: s('nautical mile') },
  { id: 'furlong', sym: 'furlong', cat: 'length', dim: L, f: 201.168, w: s('furlong'), wd: ['furlong', 'furlongs'] },
  { id: 'chain', sym: 'ch', cat: 'length', dim: L, f: 20.1168, w: s('chain') },
  { id: 'rod', sym: 'rod', cat: 'length', dim: L, f: 5.0292, w: s('rod'), wd: ['rod', 'rods'] },
  { id: 'league', sym: 'league', cat: 'length', dim: L, f: 4828.032, w: s('league'), wd: ['league', 'leagues'] },
  { id: 'fathom', sym: 'ftm', cat: 'length', dim: L, f: 1.8288, al: ['ftm'], w: s('fathom') },
  { id: 'hand', sym: 'hand', cat: 'length', dim: L, f: 0.1016, w: s('hand'), wd: ['hand', 'hands'] },
  { id: 'mil', sym: 'mil', cat: 'length', dim: L, f: 2.54e-5, al: ['mil', 'thou'], w: ['mils', 'thou'] },
  { id: 'au', sym: 'au', cat: 'length', dim: L, f: 149597870700, al: ['au', 'AU'], w: s('astronomical unit') },
  { id: 'ly', sym: 'ly', cat: 'length', dim: L, f: 9460730472580800, al: ['ly'], w: [...s('light year', 'lightyear', 'light-year')], pre: P(['k', 'M', 'G']), pw: [] },
  { id: 'lightsecond', sym: 'light second', cat: 'length', dim: L, f: 299792458, w: s('light second', 'light-second'), wd: ['light second', 'light seconds'] },
  { id: 'lightminute', sym: 'light minute', cat: 'length', dim: L, f: 299792458 * 60, w: s('light minute', 'light-minute'), wd: ['light minute', 'light minutes'] },
  { id: 'lighthour', sym: 'light hour', cat: 'length', dim: L, f: 299792458 * 3600, w: s('light hour', 'light-hour'), wd: ['light hour', 'light hours'] },
  { id: 'lightday', sym: 'light day', cat: 'length', dim: L, f: 299792458 * 86400, w: s('light day', 'light-day'), wd: ['light day', 'light days'] },
  { id: 'pc', sym: 'pc', cat: 'length', dim: L, f: 3.0856775814913673e16, al: ['pc'], w: s('parsec'), pre: P(['k', 'M', 'G']) },
  { id: 'angstrom', sym: 'Å', cat: 'length', dim: L, f: 1e-10, al: ['Å', 'Å'], w: [...s('angstrom'), 'ångström', 'ångströms'] },
  { id: 'micron', sym: 'µm', cat: 'length', dim: L, f: 1e-6, w: s('micron') },
  { id: 'px', sym: 'px', cat: 'css', dim: L, f: 0.0254 / 96, al: ['px'], w: s('pixel') },
  { id: 'pt', sym: 'pt', cat: 'css', dim: L, f: 0.0254 / 72, al: ['pt', 'pts'] },
  { id: 'pica', sym: 'pica', cat: 'css', dim: L, f: 0.0254 / 6, w: s('pica'), wd: ['pica', 'picas'] },
  { id: 'em', sym: 'em', cat: 'css', dim: L, f: (0.0254 / 96) * 16, al: ['em', 'ems'] },
  { id: 'rem', sym: 'rem', cat: 'css', dim: L, f: (0.0254 / 96) * 16, al: ['rem', 'rems'] },
  { id: 'smoot', sym: 'smoot', cat: 'length', dim: L, f: 1.7018, w: s('smoot'), wd: ['smoot', 'smoots'] },
  { id: 'footballfield', sym: 'football field', cat: 'length', dim: L, f: 91.44, w: s('football field'), wd: ['football field', 'football fields'] },

  // ----- area
  { id: 'ha', sym: 'ha', cat: 'area', dim: AREA, f: 1e4, al: ['ha'], w: s('hectare') },
  { id: 'acre', sym: 'ac', cat: 'area', dim: AREA, f: 4046.8564224, al: ['ac'], w: s('acre'), wd: ['acre', 'acres'] },

  // ----- volume
  { id: 'L', sym: 'L', cat: 'volume', dim: VOL, f: 1e-3, al: ['L', 'l', 'ℓ'], w: s('liter', 'litre'), pre: P(['k', 'h', 'd', 'c', 'm', 'µ', 'M']), psym: ['L', 'l'] },
  { id: 'cc', sym: 'cc', cat: 'volume', dim: VOL, f: 1e-6, al: ['cc'] },
  { id: 'gal', sym: 'gal', cat: 'volume', dim: VOL, f: 0.003785411784, al: ['gal', 'gals'], w: [...s('gallon', 'us gallon')] },
  { id: 'impgal', sym: 'imp gal', cat: 'volume', dim: VOL, f: 0.00454609, w: s('imperial gallon', 'uk gallon', 'imp gal') },
  { id: 'qt', sym: 'qt', cat: 'volume', dim: VOL, f: 0.000946352946, al: ['qt', 'qts'], w: s('quart') },
  { id: 'pint', sym: 'pint', cat: 'volume', dim: VOL, f: 0.000473176473, w: s('pint', 'us pint'), wd: ['pint', 'pints'] },
  { id: 'imppint', sym: 'imp pint', cat: 'volume', dim: VOL, f: 0.00056826125, w: s('imperial pint', 'uk pint', 'imp pint'), wd: ['imperial pint', 'imperial pints'] },
  { id: 'cup', sym: 'cup', cat: 'volume', dim: VOL, f: 0.0002365882365, al: ['cup', 'cups'], w: s('cup', 'us cup'), wd: ['cup', 'cups'] },
  { id: 'floz', sym: 'fl oz', cat: 'volume', dim: VOL, f: 2.95735295625e-5, al: ['floz'], w: ['fl oz', 'fl. oz', 'fl.oz', ...s('fluid ounce')] },
  { id: 'tbsp', sym: 'tbsp', cat: 'volume', dim: VOL, f: 1.478676478125e-5, al: ['tbsp', 'Tbsp', 'tbs', 'tblsp'], w: s('tablespoon') },
  { id: 'tsp', sym: 'tsp', cat: 'volume', dim: VOL, f: 4.92892159375e-6, al: ['tsp'], w: s('teaspoon') },
  { id: 'shot', sym: 'shot', cat: 'volume', dim: VOL, f: 4.436029434375e-5, w: s('shot', 'jigger'), wd: ['shot', 'shots'] },
  { id: 'pinch', sym: 'pinch', cat: 'volume', dim: VOL, f: 4.92892159375e-6 / 16, w: ['pinch', 'pinches'], wd: ['pinch', 'pinches'] },
  { id: 'dash', sym: 'dash', cat: 'volume', dim: VOL, f: 4.92892159375e-6 / 8, w: ['dash', 'dashes'], wd: ['dash', 'dashes'] },
  { id: 'gpm', sym: 'gpm', cat: 'flow', comp: [['gal', 1], ['min', -1]], al: ['gpm', 'GPM'], w: ['gallons per minute', 'gallon per minute'] },
  { id: 'cfm', sym: 'cfm', cat: 'flow', comp: [['ft', 3], ['min', -1]], al: ['cfm', 'CFM'], w: ['cubic feet per minute', 'cubic foot per minute'] },
  { id: 'bbl', sym: 'bbl', cat: 'volume', dim: VOL, f: 0.158987294928, al: ['bbl'], w: s('barrel') },

  // ----- mass
  { id: 'g', sym: 'g', cat: 'mass', dim: M, f: 1e-3, al: ['g', 'gm', 'gms'], w: s('gram', 'gramme'), pre: ALL },
  { id: 't', sym: 't', cat: 'mass', dim: M, f: 1e3, al: ['t'], w: s('tonne', 'metric ton'), pre: P(['k', 'M', 'G']), pw: ['tonne', 'tonnes'] },
  { id: 'lb', sym: 'lb', cat: 'mass', dim: M, f: 0.45359237, al: ['lb', 'lbs', '℔'], w: s('pound') },
  { id: 'oz', sym: 'oz', cat: 'mass', dim: M, f: 0.028349523125, al: ['oz'], w: s('ounce') },
  { id: 'ozt', sym: 'ozt', cat: 'mass', dim: M, f: 0.0311034768, al: ['ozt'], w: s('troy ounce') },
  { id: 'st', sym: 'st', cat: 'mass', dim: M, f: 6.35029318, al: ['st'], w: ['stone', 'stones'] },
  { id: 'ton', sym: 'ton', cat: 'mass', dim: M, f: 907.18474, w: s('ton', 'short ton', 'us ton'), wd: ['ton', 'tons'] },
  { id: 'longton', sym: 'long ton', cat: 'mass', dim: M, f: 1016.0469088, w: s('long ton', 'imperial ton'), wd: ['long ton', 'long tons'] },
  { id: 'grain', sym: 'gr', cat: 'mass', dim: M, f: 6.479891e-5, al: ['gr'], w: s('grain') },
  { id: 'ct', sym: 'ct', cat: 'mass', dim: M, f: 2e-4, al: ['ct'], w: s('carat') },
  { id: 'slug', sym: 'slug', cat: 'mass', dim: M, f: 14.59390294, w: s('slug'), wd: ['slug', 'slugs'] },
  { id: 'stick', sym: 'stick', cat: 'mass', dim: M, f: 0.1133980925, w: s('stick'), wd: ['stick', 'sticks'], density: 226.796185 / 236.5882365 },
  { id: 'Da', sym: 'Da', cat: 'mass', dim: M, f: 1.66053906892e-27, al: ['Da'], w: s('dalton'), pre: P(['k', 'M']) },

  // ----- time
  { id: 's', sym: 's', cat: 'time', dim: T, f: 1, al: ['s', 'sec', 'secs'], w: s('second'), wd: ['second', 'seconds'], pre: SMALL, psym: ['s'] },
  { id: 'min', sym: 'min', cat: 'time', dim: T, f: 60, al: ['min', 'mins'], w: s('minute'), wd: ['minute', 'minutes'] },
  { id: 'h', sym: 'h', cat: 'time', dim: T, f: 3600, al: ['h', 'hr', 'hrs'], w: s('hour'), wd: ['hour', 'hours'] },
  { id: 'day', sym: 'd', cat: 'time', dim: T, f: 86400, al: ['d'], w: s('day'), wd: ['day', 'days'] },
  { id: 'night', sym: 'night', cat: 'time', dim: T, f: 86400, w: s('night'), wd: ['night', 'nights'] },
  { id: 'bday', sym: 'business day', cat: 'time', dim: T, f: 86400, w: [...s('business day', 'workday', 'work day', 'working day', 'weekday')], wd: ['business day', 'business days'] },
  { id: 'week', sym: 'wk', cat: 'time', dim: T, f: 604800, al: ['wk', 'wks'], w: s('week'), wd: ['week', 'weeks'] },
  { id: 'fortnight', sym: 'fortnight', cat: 'time', dim: T, f: 1209600, w: s('fortnight'), wd: ['fortnight', 'fortnights'] },
  { id: 'month', sym: 'mo', cat: 'time', dim: T, f: 2629746, al: ['mo', 'mos'], w: s('month'), wd: ['month', 'months'] },
  { id: 'year', sym: 'yr', cat: 'time', dim: T, f: 31556952, al: ['yr', 'yrs'], w: s('year'), wd: ['year', 'years'] },
  { id: 'decade', sym: 'decade', cat: 'time', dim: T, f: 315569520, w: s('decade'), wd: ['decade', 'decades'] },
  { id: 'century', sym: 'century', cat: 'time', dim: T, f: 3155695200, w: ['century', 'centuries'], wd: ['century', 'centuries'] },
  { id: 'millennium', sym: 'millennium', cat: 'time', dim: T, f: 31556952000, w: ['millennium', 'millennia', 'millenniums'], wd: ['millennium', 'millennia'] },

  // ----- temperature
  { id: 'K', sym: 'K', cat: 'temperature', dim: { temperature: 1 }, f: 1, al: ['K'], w: [...s('kelvin'), 'degree kelvin', 'degrees kelvin'], pre: P(['m', 'µ', 'n']), pw: [] },
  { id: 'degC', sym: '°C', cat: 'temperature', dim: { temperature: 1 }, f: 1, off: 273.15, al: ['°C', '℃', 'C', 'c', 'degC', 'ºC'], w: ['celsius', 'centigrade', 'degree celsius', 'degrees celsius', 'degree c', 'degrees c', 'deg c', 'degree centigrade', 'degrees centigrade'] },
  { id: 'degF', sym: '°F', cat: 'temperature', dim: { temperature: 1 }, f: 5 / 9, off: (459.67 * 5) / 9, al: ['°F', '℉', 'F', 'f', 'degF', 'ºF'], w: ['fahrenheit', 'degree fahrenheit', 'degrees fahrenheit', 'degree f', 'degrees f', 'deg f'] },
  { id: 'degR', sym: '°R', cat: 'temperature', dim: { temperature: 1 }, f: 5 / 9, al: ['°R', '°Ra'], w: ['rankine', 'degree rankine', 'degrees rankine'] },

  // ----- speed / acceleration
  { id: 'mph', sym: 'mph', cat: 'speed', comp: [['mi', 1], ['h', -1]], al: ['mph', 'MPH'], w: ['miles per hour', 'mile per hour'] },
  { id: 'kph', sym: 'km/h', cat: 'speed', comp: [['m', 1, 'k'], ['h', -1]], al: ['kph', 'kmh', 'kmph', 'KPH'], w: ['kilometers per hour', 'kilometres per hour', 'kilometer per hour', 'kilometre per hour'] },
  { id: 'knot', sym: 'kn', cat: 'speed', dim: { length: 1, time: -1 }, f: 1852 / 3600, al: ['kn', 'kt', 'kts'], w: s('knot') },
  { id: 'mach', sym: 'Mach', cat: 'speed', dim: { length: 1, time: -1 }, f: 340.29, w: ['mach'] },
  { id: 'gee', sym: 'g₀', cat: 'acceleration', dim: { length: 1, time: -2 }, f: 9.80665, al: ['g0', 'gₙ'], w: ['gee', 'gees', 'g force', 'g-force', 'g forces'] },

  // ----- force
  { id: 'N', sym: 'N', cat: 'force', dim: { mass: 1, length: 1, time: -2 }, f: 1, al: ['N'], w: s('newton'), pre: ALL },
  { id: 'lbf', sym: 'lbf', cat: 'force', dim: { mass: 1, length: 1, time: -2 }, f: 4.4482216152605, al: ['lbf'], w: ['pound force', 'pounds force', 'pound of force', 'pounds of force'] },
  { id: 'kgf', sym: 'kgf', cat: 'force', dim: { mass: 1, length: 1, time: -2 }, f: 9.80665, al: ['kgf', 'kp'], w: ['kilogram force', 'kilograms force'] },
  { id: 'dyn', sym: 'dyn', cat: 'force', dim: { mass: 1, length: 1, time: -2 }, f: 1e-5, al: ['dyn'], w: s('dyne') },

  // ----- pressure
  { id: 'Pa', sym: 'Pa', cat: 'pressure', dim: { mass: 1, length: -1, time: -2 }, f: 1, al: ['Pa'], w: s('pascal'), pre: P(['G', 'M', 'k', 'h', 'm']) },
  { id: 'bar', sym: 'bar', cat: 'pressure', dim: { mass: 1, length: -1, time: -2 }, f: 1e5, al: ['bar'], w: ['bar', 'bars'], pre: P(['k', 'c', 'm']) },
  { id: 'atm', sym: 'atm', cat: 'pressure', dim: { mass: 1, length: -1, time: -2 }, f: 101325, al: ['atm'], w: s('atmosphere') },
  { id: 'psi', sym: 'psi', cat: 'pressure', dim: { mass: 1, length: -1, time: -2 }, f: 6894.757293168361, al: ['psi', 'PSI'], w: ['pound per square inch', 'pounds per square inch'], pre: P(['k']) },
  { id: 'mmHg', sym: 'mmHg', cat: 'pressure', dim: { mass: 1, length: -1, time: -2 }, f: 101325 / 760, al: ['mmHg'], w: ['millimeter of mercury', 'millimeters of mercury', 'millimetre of mercury', 'millimetres of mercury'] },
  { id: 'torr', sym: 'Torr', cat: 'pressure', dim: { mass: 1, length: -1, time: -2 }, f: 101325 / 760, al: ['Torr'], w: ['torr'] },
  { id: 'inHg', sym: 'inHg', cat: 'pressure', dim: { mass: 1, length: -1, time: -2 }, f: 3386.388640341, al: ['inHg'], w: ['inch of mercury', 'inches of mercury'] },

  // ----- energy
  { id: 'J', sym: 'J', cat: 'energy', dim: { mass: 1, length: 2, time: -2 }, f: 1, al: ['J'], w: [...s('joule', 'watt second', 'watt-second')], pre: ALL, pw: s('joule') },
  { id: 'Nm', sym: 'N·m', cat: 'torque', comp: [['N', 1], ['m', 1]], al: ['Nm', 'N·m', 'N-m', 'N*m'], w: s('newton meter', 'newton metre', 'newton-meter', 'newton-metre') },
  { id: 'cal', sym: 'cal', cat: 'energy', dim: { mass: 1, length: 2, time: -2 }, f: 4.184, al: ['cal'], w: ['small calorie', 'small calories', 'gram calorie', 'gram calories'], pre: [], pw: [] },
  { id: 'kcal', sym: 'kcal', cat: 'energy', dim: { mass: 1, length: 2, time: -2 }, f: 4184, al: ['kcal', 'Cal', 'Kcal'], w: [...s('calorie', 'kilocalorie', 'food calorie')] },
  { id: 'Wh', sym: 'Wh', cat: 'energy', comp: [['W', 1], ['h', 1]], al: ['Wh'], w: s('watt hour', 'watt-hour'), pre: P(['m', 'k', 'M', 'G', 'T']), pw: s('watt hour', 'watt-hour') },
  { id: 'eV', sym: 'eV', cat: 'energy', dim: { mass: 1, length: 2, time: -2 }, f: 1.602176634e-19, al: ['eV'], w: s('electronvolt', 'electron volt'), pre: P(['µ', 'm', 'k', 'M', 'G', 'T']) },
  { id: 'BTU', sym: 'BTU', cat: 'energy', dim: { mass: 1, length: 2, time: -2 }, f: 1055.05585262, al: ['BTU', 'Btu', 'btu'], w: s('british thermal unit') },
  { id: 'therm', sym: 'thm', cat: 'energy', dim: { mass: 1, length: 2, time: -2 }, f: 105505585.262, al: ['thm'], w: s('therm') },
  { id: 'erg', sym: 'erg', cat: 'energy', dim: { mass: 1, length: 2, time: -2 }, f: 1e-7, al: ['erg'], w: s('erg') },
  { id: 'ftlb', sym: 'ft·lb', cat: 'energy', dim: { mass: 1, length: 2, time: -2 }, f: 1.3558179483314004, al: ['ftlb', 'ft·lb', 'ft-lb', 'ft-lbs', 'ft·lbf', 'lbft', 'lb-ft', 'lb·ft', 'lbf·ft', 'lbf-ft'], w: [...s('foot pound', 'foot-pound', 'pound foot'), 'pound feet', 'lb ft', 'ft lb', 'ft lbs', 'lbs ft', 'ft lbf', 'lbf ft'] },
  { id: 'tTNT', sym: 't TNT', cat: 'energy', dim: { mass: 1, length: 2, time: -2 }, f: 4.184e9, w: ['ton of tnt', 'tons of tnt', 'tonne of tnt', 'tonnes of tnt'] },
  { id: 'ktTNT', sym: 'kt TNT', cat: 'energy', dim: { mass: 1, length: 2, time: -2 }, f: 4.184e12, w: ['kiloton of tnt', 'kilotons of tnt', 'kiloton', 'kilotons'] },
  { id: 'MtTNT', sym: 'Mt TNT', cat: 'energy', dim: { mass: 1, length: 2, time: -2 }, f: 4.184e15, w: ['megaton of tnt', 'megatons of tnt', 'megaton', 'megatons'] },

  // ----- power
  { id: 'W', sym: 'W', cat: 'power', dim: { mass: 1, length: 2, time: -3 }, f: 1, al: ['W'], w: s('watt'), pre: ALL },
  { id: 'hp', sym: 'hp', cat: 'power', dim: { mass: 1, length: 2, time: -3 }, f: 745.69987158227022, al: ['hp', 'HP', 'bhp'], w: ['horsepower', 'horse power'] },
  { id: 'PS', sym: 'PS', cat: 'power', dim: { mass: 1, length: 2, time: -3 }, f: 735.49875, al: ['PS'], w: ['metric horsepower'] },

  // ----- electromagnetism
  { id: 'A', sym: 'A', cat: 'current', dim: { current: 1 }, f: 1, al: ['A', 'amp', 'amps'], w: [...s('ampere', 'amp')], pre: ALL, psym: ['A'], pw: s('ampere', 'amp') },
  { id: 'V', sym: 'V', cat: 'voltage', dim: { mass: 1, length: 2, time: -3, current: -1 }, f: 1, al: ['V'], w: s('volt'), pre: ALL },
  { id: 'ohm', sym: 'Ω', cat: 'resistance', dim: { mass: 1, length: 2, time: -3, current: -2 }, f: 1, al: ['\u2126', '\u03A9', 'ohm', 'ohms'], w: s('ohm'), pre: ALL, psym: ['\u2126', '\u03A9', 'ohm'] },
  { id: 'coulomb', sym: 'C', cat: 'charge', dim: { current: 1, time: 1 }, f: 1, w: s('coulomb'), pre: ALL, psym: ['C'] },
  { id: 'farad', sym: 'F', cat: 'capacitance', dim: { current: 2, time: 4, mass: -1, length: -2 }, f: 1, w: s('farad'), pre: P(['m', 'µ', 'n', 'p', 'k']), psym: ['F'] },
  { id: 'henry', sym: 'H', cat: 'inductance', dim: { mass: 1, length: 2, time: -2, current: -2 }, f: 1, al: ['H'], w: ['henry', 'henries', 'henrys'], pre: SMALL },
  { id: 'tesla', sym: 'T', cat: 'magnetic', dim: { mass: 1, time: -2, current: -1 }, f: 1, al: ['T'], w: s('tesla'), pre: SMALL, psym: ['T'] },
  { id: 'Wb', sym: 'Wb', cat: 'magnetic', dim: { mass: 1, length: 2, time: -2, current: -1 }, f: 1, al: ['Wb'], w: s('weber'), pre: P(['m', 'µ']) },
  { id: 'S', sym: 'S', cat: 'conductance', dim: { mass: -1, length: -2, time: 3, current: 2 }, f: 1, al: ['S'], w: ['siemens'], pre: P(['k', 'm', 'µ']) },
  { id: 'Ah', sym: 'Ah', cat: 'charge', comp: [['A', 1], ['h', 1]], al: ['Ah'], w: s('amp hour', 'ampere hour', 'amp-hour'), pre: P(['k', 'm']), pw: s('amp hour', 'ampere hour') },

  // ----- frequency
  { id: 'Hz', sym: 'Hz', cat: 'frequency', dim: { time: -1 }, f: 1, al: ['Hz', 'hz'], w: ['hertz'], pre: ALL },
  { id: 'rpm', sym: 'rpm', cat: 'frequency', dim: { angle: 1, time: -1 }, f: (2 * PI) / 60, al: ['rpm', 'RPM'], w: ['revolutions per minute', 'revolution per minute', 'rotations per minute'] },
  { id: 'bpm', sym: 'bpm', cat: 'frequency', dim: { time: -1 }, f: 1 / 60, al: ['bpm', 'BPM'], w: ['beats per minute'] },

  // ----- data
  { id: 'bit', sym: 'b', cat: 'data', dim: { data: 1 }, f: 1, al: ['b', 'bit', 'bits'], w: s('bit'), wd: ['bit', 'bits'], pre: DATA, psym: ['b', 'bit'], pw: s('bit') },
  { id: 'byte', sym: 'B', cat: 'data', dim: { data: 1 }, f: 8, al: ['B'], w: s('byte'), pre: DATA, psym: ['B'], pw: s('byte') },
  { id: 'nibble', sym: 'nibble', cat: 'data', dim: { data: 1 }, f: 4, w: s('nibble'), wd: ['nibble', 'nibbles'] },
  { id: 'Bps', sym: 'B/s', cat: 'data rate', comp: [['byte', 1], ['s', -1]], al: ['Bps'], pre: P(['k', 'M', 'G', 'T', 'P']), psym: ['Bps'], pw: [] },
  { id: 'bps', sym: 'bps', cat: 'data rate', comp: [['bit', 1], ['s', -1]], al: ['bps'], pre: P(['k', 'M', 'G', 'T', 'P']), psym: ['bps'], pw: [] },

  // ----- angle
  { id: 'rad', sym: 'rad', cat: 'angle', dim: { angle: 1 }, f: 1, al: ['rad', 'rads'], w: s('radian'), pre: P(['m', 'µ']), pw: s('radian') },
  { id: 'deg', sym: '°', cat: 'angle', dim: { angle: 1 }, f: PI / 180, al: ['°', 'deg', 'degs', 'º'], w: s('degree') },
  { id: 'arcmin', sym: '′', cat: 'angle', dim: { angle: 1 }, f: PI / 10800, al: ['arcmin', '′'], w: s('arcminute', 'arc minute') },
  { id: 'arcsec', sym: '″', cat: 'angle', dim: { angle: 1 }, f: PI / 648000, al: ['arcsec', '″'], w: s('arcsecond', 'arc second'), pre: P(['m', 'µ']), psym: ['arcsec'], pw: [] },
  { id: 'grad', sym: 'grad', cat: 'angle', dim: { angle: 1 }, f: PI / 200, al: ['grad', 'gon'], w: s('gradian') },
  { id: 'turn', sym: 'turn', cat: 'angle', dim: { angle: 1 }, f: 2 * PI, al: ['rev', 'revs'], w: s('turn', 'revolution', 'rotation'), wd: ['turn', 'turns'] },

  // ----- amount / light
  { id: 'mol', sym: 'mol', cat: 'amount', dim: { amount: 1 }, f: 1, al: ['mol'], w: s('mole'), pre: ALL },
  { id: 'cd', sym: 'cd', cat: 'light', dim: { luminosity: 1 }, f: 1, al: ['cd'], w: s('candela'), pre: P(['k', 'm']) },
  { id: 'lm', sym: 'lm', cat: 'light', dim: { luminosity: 1 }, f: 1, al: ['lm'], w: s('lumen') },
  { id: 'lx', sym: 'lx', cat: 'light', dim: { luminosity: 1, length: -2 }, f: 1, al: ['lx'], w: ['lux'] },

  // ----- dimensionless ratios
  { id: 'percent', sym: '%', cat: 'ratio', dim: {}, f: 0.01, al: ['%'], w: ['percent', 'per cent', 'pct', 'percentage'], ratio: true },
  { id: 'permille', sym: '‰', cat: 'ratio', dim: {}, f: 0.001, al: ['‰'], w: ['permille', 'per mille', 'per mil'], ratio: true },
  { id: 'bp', sym: 'bp', cat: 'ratio', dim: {}, f: 0.0001, al: ['bp'], w: s('basis point'), ratio: true },
  { id: 'ppm', sym: 'ppm', cat: 'ratio', dim: {}, f: 1e-6, al: ['ppm'], ratio: true },
  { id: 'ppb', sym: 'ppb', cat: 'ratio', dim: {}, f: 1e-9, al: ['ppb'], ratio: true },

  // ----- money
  { id: 'cent', sym: '¢', cat: 'currency', dim: { currency: 1 }, f: 0.01, al: ['¢'], w: s('cent') },

  // ----- fuel economy (inverse of L/100km)
  { id: 'mpg', sym: 'mpg', cat: 'fuel economy', comp: [['mi', 1], ['gal', -1]], al: ['mpg', 'MPG'], w: ['miles per gallon', 'mile per gallon'] },
  { id: 'L100km', sym: 'L/100km', cat: 'fuel economy', dim: { length: 2 }, f: 1e-3 / 1e5, al: ['L/100km'] },
];

// ---------------------------------------------------------------------------
// Registry

const byId = new Map<string, UnitDef>();
const exact = new Map<string, { u: UnitDef; p: Prefix | null }>();
const words = new Map<string, { u: UnitDef; p: Prefix | null }>();
const lowerSym = new Map<string, { u: UnitDef; p: Prefix | null } | null>();
/** Multi-word phrases (lowercase) the lexer should glue together. */
export const UNIT_PHRASES = new Set<string>();

function addExact(k: string, u: UnitDef, p: Prefix | null, force = false) {
  if (!force && exact.has(k)) return;
  exact.set(k, { u, p });
  if (k.includes('-') && /^[\p{L}]/u.test(k)) UNIT_PHRASES.add(k.toLowerCase());
}
function addWord(k: string, u: UnitDef, p: Prefix | null, force = false) {
  const key = k.toLowerCase();
  if (!force && words.has(key)) return;
  words.set(key, { u, p });
  if (key.includes(' ') || key.includes('-')) UNIT_PHRASES.add(key);
}

function computeCompose(spec: Spec): { dim: Dim; factor: number } {
  let dim: Dim = DIMLESS;
  let factor = 1;
  for (const [id, pow, pre] of spec.comp!) {
    const u = byId.get(id);
    if (!u) throw new Error('compose: unknown unit ' + id);
    const pf = pre ? prefixBySym(pre)!.factor : 1;
    dim = dimAdd(dim, u.dim, pow);
    factor *= (u.factor * pf) ** pow;
  }
  return { dim, factor };
}

function register(spec: Spec): UnitDef {
  let dim = makeDim(spec.dim ?? {});
  let factor = spec.f ?? 1;
  if (spec.comp) ({ dim, factor } = computeCompose(spec));
  const u: UnitDef = {
    id: spec.id,
    symbol: spec.sym,
    dim,
    factor,
    offset: spec.off ?? 0,
    category: spec.cat,
    prefixes: spec.pre ?? [],
    ratio: spec.ratio,
    density: spec.density ? spec.density * 1000 : undefined,
  };
  if (spec.wd) [u.singular, u.plural] = spec.wd;
  if (spec.comp) u.compose = spec.comp.map(([id, power, prefix]) => ({ id, power, prefix }));
  byId.set(u.id, u);
  return u;
}

const pendingPrefixed: [Spec, UnitDef][] = [];

// composites reference other units, so register them last
for (const spec of [...SPECS.filter((x) => !x.comp), ...SPECS.filter((x) => x.comp)]) {
  const u = register(spec);
  for (const a of spec.al ?? []) addExact(a, u, null, true);
  for (const w of spec.w ?? []) addWord(w, u, null, true);
  if (spec.pre?.length) pendingPrefixed.push([spec, u]);
}

// Currencies
function registerCurrency(c: CurrencyMeta) {
  if (byId.has(c.code)) return byId.get(c.code)!;
  const rate = FALLBACK_RATES[c.code] ?? 1;
  const u: UnitDef = {
    id: c.code,
    symbol: c.symbol ?? c.code,
    dim: makeDim({ currency: 1 }),
    factor: 1 / rate,
    offset: 0,
    category: 'currency',
    prefixes: [],
    currency: c,
  };
  byId.set(u.id, u);
  addExact(c.code, u, null, true);
  if (!LOWERCASE_CODE_BLOCKLIST.has(c.code.toLowerCase())) addWord(c.code, u, null, false);
  for (const a of c.aliases ?? []) addExact(a, u, null, true);
  for (const w of c.words ?? []) addWord(w, u, null, true);
  return u;
}

// lowercase versions of these codes are ordinary English words
const LOWERCASE_CODE_BLOCKLIST = new Set([
  'try', 'pen', 'mad', 'cop', 'ron', 'sar', 'sol', 'ada', 'all', 'cup', 'top', 'bob', 'gel', 'mop', 'lak', 'sat', 'php', 'bam', 'ang', 'mur', 'kes', 'egp',
]);

for (const c of CURRENCIES) registerCurrency(c);

// Prefixed forms are registered after every explicit alias so they never shadow one.
for (const [spec, u] of pendingPrefixed) {
  const psyms = spec.psym ?? [spec.sym];
  const pwords = spec.pw ?? (spec.w ?? []).filter((w) => !w.includes(' '));
  for (const p of u.prefixes) {
    for (const sym of psyms) {
      addExact(p.sym + sym, u, p);
      if (p.sym === 'µ') {
        addExact('u' + sym, u, p);
        addExact('μ' + sym, u, p); // greek mu
      }
    }
    for (const w of pwords) {
      addWord(p.name + w, u, p);
      if (p.name === 'deca') addWord('deka' + w, u, p);
    }
  }
}

// All-lowercase data sizes almost always mean bytes ("500 gb").
{
  const byte = byId.get('byte')!;
  for (const ps of ['k', 'M', 'G', 'T', 'P', 'E']) {
    exact.set(ps.toLowerCase() + 'b', { u: byte, p: prefixBySym(ps)! });
  }
  exact.set('KB', { u: byte, p: prefixBySym('k')! });
  const bit = byId.get('bit')!;
  exact.set('Kb', { u: bit, p: prefixBySym('k')! });
  exact.set('Kbit', { u: bit, p: prefixBySym('k')! });
  const pre = (id: string, ps: string | null, ...keys: string[]) => {
    const u = byId.get(id)!;
    const p = ps ? prefixBySym(ps)! : null;
    for (const k of keys) {
      exact.set(k, { u, p });
      words.set(k.toLowerCase(), { u, p });
    }
  };
  pre('g', 'µ', 'mcg');
  pre('g', 'k', 'kilo', 'kilos', 'kgs', 'KGs', 'KGS', 'kilogramme', 'kilogrammes');
  pre('m', 'k', 'kms', 'KMs', 'klick', 'klicks');
  pre('m', 'c', 'cms');
  pre('m', 'm', 'mms');
  pre('s', 'm', 'msec', 'msecs', 'millis', 'millisec', 'millisecs');
  pre('s', 'µ', 'usec', 'usecs', 'µsec', 'micros');
  pre('s', 'n', 'nsec', 'nsecs');
  pre('L', null, 'ltr', 'ltrs', 'Ltr', 'Ltrs', 'lit', 'lts');
  pre('L', 'm', 'mls', 'mLs', 'MLs');
  pre('K', null, '°K', 'ºK', 'degK');
  pre('tbsp', null, 'tbsps', 'Tbsps', 'tbls');
  pre('tsp', null, 'tsps');
  pre('oz', null, 'ozs');
  pre('h', null, 'hour(s)', 'hr.', 'hrs.');
  pre('min', null, 'mins.', 'min.');
  // all-lowercase spellings: pick the prefix people actually mean
  pre('Hz', 'k', 'khz', 'KHZ', 'KHz');
  pre('Hz', 'M', 'mhz', 'MHZ', 'Mhz');
  pre('Hz', 'G', 'ghz', 'GHZ', 'Ghz');
  pre('Hz', 'T', 'thz', 'THZ');
  pre('A', 'm', 'ma', 'MA');
  pre('V', 'm', 'mv');
  pre('V', 'k', 'kv', 'KV');
  pre('V', null, 'v');
  pre('W', 'k', 'kw', 'KW');
  pre('W', null, 'w');
  pre('Wh', 'k', 'kwh', 'KWH', 'Kwh', 'KWh');
  pre('Wh', 'M', 'mwh', 'MWH');
  pre('Wh', 'G', 'gwh', 'GWH');
  pre('Ah', 'm', 'mah', 'MAH');
  pre('byte', 'Ki', 'kib', 'KIB');
  pre('byte', 'Mi', 'mib', 'MIB');
  pre('byte', 'Gi', 'gib', 'GIB');
  pre('byte', 'Ti', 'tib', 'TIB');
  pre('bps', 'k', 'kbps', 'Kbps');
  pre('bps', 'M', 'mbps', 'MBPS');
  pre('bps', 'G', 'gbps', 'GBPS');
  pre('Bps', 'M', 'MB/s');
}

// Case-insensitive fallback for multi-letter symbols ("KM", "Kg", "KWH", "MPH").
for (const [k, v] of exact) {
  if (k.length < 2) continue;
  if (v.p?.sym === 'µ' && k.startsWith('u')) continue;
  const lk = k.toLowerCase();
  const prev = lowerSym.get(lk);
  if (prev === undefined) lowerSym.set(lk, v);
  else if (prev && (prev.u !== v.u || prev.p !== v.p)) lowerSym.set(lk, null);
}

// ---------------------------------------------------------------------------
// Public API

export function getUnit(id: string): UnitDef {
  const u = byId.get(id);
  if (!u) throw new Error('Unknown unit id ' + id);
  return u;
}

export function allUnits(): UnitDef[] {
  return [...byId.values()];
}

const LENGTH = makeDim({ length: 1 });

export function isLengthTerm(t: Term): boolean {
  return t.pow === 1 && dimEq(t.u.dim, LENGTH);
}

/**
 * Resolve a word to a unit term. Handles exact symbols (case-sensitive), names
 * (case-insensitive), prefixes, "m2"/"ft3" powers and "sqft"/"cuin" forms.
 */
export function lookupUnit(word: string): Term | null {
  const hit = lookupBase(word);
  if (hit) return { u: hit.u, p: hit.p, pow: 1 };
  // m2, cm3, ft2 ...
  const pm = /^(.+?)([23])$/.exec(word);
  if (pm) {
    const b = lookupBase(pm[1]);
    if (b && dimEq(b.u.dim, LENGTH)) return { u: b.u, p: b.p, pow: +pm[2] };
  }
  // sqft, sqm, sqkm, cuin, cuft
  const sq = /^(sq|cu)\.?(.+)$/i.exec(word);
  if (sq && !/^cum$/i.test(word)) {
    const b = lookupBase(sq[2]);
    if (b && dimEq(b.u.dim, LENGTH)) return { u: b.u, p: b.p, pow: sq[1].toLowerCase() === 'sq' ? 2 : 3 };
  }
  return null;
}

function lookupBase(word: string) {
  return exact.get(word) ?? words.get(word.toLowerCase()) ?? lowerSym.get(word.toLowerCase()) ?? null;
}

/** Register a currency code seen in live rate data that isn't in our table. */
export function ensureCurrency(code: string): UnitDef {
  return registerCurrency({ code, name: code });
}

export function currencyUnit(code: string): UnitDef | undefined {
  const u = byId.get(code);
  return u?.currency ? u : undefined;
}

/** Update currency factors from a table of units-per-USD. */
export function setRates(rates: Record<string, number>) {
  for (const [code, rate] of Object.entries(rates)) {
    if (!(rate > 0) || !/^[A-Z]{3,5}$/.test(code)) continue;
    const u = byId.get(code) ?? ensureCurrency(code);
    if (!u.currency) continue;
    u.factor = 1 / rate;
  }
  // satoshis follow bitcoin
  const btc = byId.get('BTC');
  const sat = byId.get('SAT');
  if (btc && sat) sat.factor = btc.factor / 1e8;
}

/** CSS units depend on display settings. */
export function setCssBase(ppi: number, emPx: number) {
  const px = 0.0254 / ppi;
  byId.get('px')!.factor = px;
  byId.get('em')!.factor = px * emPx;
  byId.get('rem')!.factor = px * emPx;
}

export function termFactor(t: Term): number {
  return (t.u.factor * (t.p?.factor ?? 1)) ** t.pow;
}

export function termsFactor(ts: readonly Term[]): number {
  let f = 1;
  for (const t of ts) f *= termFactor(t);
  return f;
}

export function termsDim(ts: readonly Term[]): Dim {
  let d: Dim = DIMLESS;
  for (const t of ts) d = dimAdd(d, t.u.dim, t.pow);
  return d;
}

export function sameUnit(a: Term, b: Term): boolean {
  return a.u === b.u && a.p === b.p;
}

/** Expand composite units (mph → mi·h⁻¹, kWh → kW·h). */
export function expandTerm(t: Term): Term[] {
  if (!t.u.compose) return [t];
  return t.u.compose.map((c, i) => {
    const u = getUnit(c.id);
    let p: Prefix | null = c.prefix ? prefixBySym(c.prefix)! : null;
    if (i === 0 && t.p) p = t.p; // kWh → k applies to W
    return { u, p, pow: c.power * t.pow };
  });
}

/** Composite units that should be re-formed after arithmetic (kW·h → kWh). */
export function recompose(ts: Term[]): Term[] {
  if (ts.length < 2) return ts;
  for (const id of ['Wh', 'Ah', 'mph', 'mpg']) {
    const u = getUnit(id);
    const prefixes = id === 'mph' || id === 'mpg' ? [null] : [null, ...u.prefixes];
    for (const p of prefixes) {
      const exp = expandTerm({ u, p, pow: 1 });
      for (const sign of [1, -1]) {
        const idx = exp.map((e) => ts.findIndex((t) => sameUnit(t, e) && Math.abs(t.pow - e.pow * sign) < 1e-9));
        if (idx.every((i) => i >= 0)) {
          // mph only replaces a bare mi/h; inside bigger units keep it spelled out
          if (id === 'mph' && ts.length !== exp.length) continue;
          if (sign < 0 && ts.length === exp.length) continue;
          const rest = ts.filter((_, i) => !idx.includes(i));
          const at = Math.min(...idx);
          const out = [...rest];
          out.splice(Math.min(at, out.length), 0, { u, p, pow: sign });
          return out;
        }
      }
    }
  }
  return ts;
}

function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  const prev2 = new Array(b.length + 1).fill(0);
  const cur = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) {
      prev2[j] = prev[j];
      prev[j] = cur[j];
    }
  }
  return prev[b.length];
}

/** Closest unit name for a misspelled word ("farenheit" → "fahrenheit"). */
export function suggestUnit(word: string): string | null {
  const w = word.toLowerCase();
  if (w.length < 4) return null;
  const max = w.length >= 7 ? 2 : 1;
  let best: string | null = null;
  let bestD = max + 1;
  for (const key of words.keys()) {
    if (key.length < 4 || key.includes(' ')) continue;
    const d = editDistance(w, key, max);
    if (d < bestD || (d === bestD && best && key.length < best.length)) {
      bestD = d;
      best = key;
    }
  }
  return bestD <= max ? best : null;
}

/** Character sets the lexer needs. */
export function isKnownUnitWord(w: string): boolean {
  return lookupUnit(w) !== null;
}
