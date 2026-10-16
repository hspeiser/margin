// Word lists the parser recognizes. Anything not in here (and not a unit or
// variable) is treated as prose and ignored, which is what lets lines like
// "Rent for March $1,450" evaluate.

export const CONV_WORDS = new Set(['in', 'into', 'to', 'as']);

/** Infix operator words → operator. */
export const OP_WORDS: Record<string, string> = {
  plus: '+',
  and: '+',
  minus: '-',
  less: '-',
  times: '*',
  'multiplied by': '*',
  x: '*',
  by: '*',
  at: 'at',
  'divided by': '/',
  over: '/',
  per: '/',
  mod: 'mod',
  modulo: 'mod',
  xor: 'xor',
  of: 'of',
  'out of': '/',
  'increased by': '+',
  'raised by': '+',
  'decreased by': '-',
  'reduced by': '-',
  'discounted by': '-',
  'off of': 'off',
  'discount on': 'off',
  'discount off': 'off',
  'markup on': 'on',
  'more than': 'more than',
  'less than': 'less than',
  choose: 'ncr',
  on: 'on',
  off: 'off',
  'to the power of': '^',
  'to the power': '^',
  'raised to': '^',
  'raised to the power of': '^',
  'shifted left by': '<<',
  'shifted right by': '>>',
};

export const POSTFIX_WORDS: Record<string, number> = { squared: 2, cubed: 3 };

export interface FnSpec {
  name: string;
  min: number;
  max: number;
}

const fn = (name: string, min = 1, max = min): FnSpec => ({ name, min, max });

export const FUNCTIONS: Record<string, FnSpec> = {
  sqrt: fn('sqrt'),
  'square root': fn('sqrt'),
  'square root of': fn('sqrt'),
  cbrt: fn('cbrt'),
  'cube root': fn('cbrt'),
  'cube root of': fn('cbrt'),
  root: fn('root', 1, 2),
  abs: fn('abs'),
  round: fn('round', 1, 2),
  ceil: fn('ceil', 1, 2),
  ceiling: fn('ceil', 1, 2),
  floor: fn('floor', 1, 2),
  trunc: fn('trunc'),
  sign: fn('sign'),
  log: fn('log', 1, 2),
  log10: fn('log10'),
  log2: fn('log2'),
  ln: fn('ln'),
  exp: fn('exp'),
  sin: fn('sin'),
  cos: fn('cos'),
  tan: fn('tan'),
  sec: fn('sec'),
  csc: fn('csc'),
  cot: fn('cot'),
  asin: fn('asin'),
  acos: fn('acos'),
  atan: fn('atan'),
  arcsin: fn('asin'),
  arccos: fn('acos'),
  arctan: fn('atan'),
  atan2: fn('atan2', 2),
  sinh: fn('sinh'),
  cosh: fn('cosh'),
  tanh: fn('tanh'),
  asinh: fn('asinh'),
  acosh: fn('acosh'),
  atanh: fn('atanh'),
  fact: fn('fact'),
  factorial: fn('fact'),
  gamma: fn('gamma'),
  gcd: fn('gcd', 2, 99),
  lcm: fn('lcm', 2, 99),
  min: fn('min', 1, 99),
  max: fn('max', 1, 99),
  hypot: fn('hypot', 1, 99),
  random: fn('random', 0, 2),
  rand: fn('random', 0, 2),
  fromunix: fn('fromunix'),
  unix: fn('fromunix'),
  ncr: fn('ncr', 2),
  choose: fn('ncr', 2),
  npr: fn('npr', 2),
  isprime: fn('isprime'),
  pow: fn('pow', 2),
  'round up': fn('ceil', 1, 2),
  'round down': fn('floor', 1, 2),
  int: fn('trunc'),
  integer: fn('trunc'),
  frac: fn('fracpart'),
  median: fn('median', 1, 99),
  mode: fn('mode', 1, 99),
  stdev: fn('stdev', 1, 99),
  stddev: fn('stdev', 1, 99),
  'standard deviation': fn('stdev', 1, 99),
  variance: fn('variance', 1, 99),
  product: fn('product', 1, 99),
  hex: fn('hex'),
  bin: fn('bin'),
  oct: fn('oct'),
};

/** Aggregates over the current block of lines. sum/avg also work as functions with parens. */
export const AGGREGATES: Record<string, 'sum' | 'avg' | 'prev' | 'count'> = {
  sum: 'sum',
  total: 'sum',
  subtotal: 'sum',
  avg: 'avg',
  average: 'avg',
  mean: 'avg',
  prev: 'prev',
  previous: 'prev',
  ans: 'prev',
  answer: 'prev',
  count: 'count',
};

export const CONSTANTS: Record<string, { v: number; unit?: [string, number][]; label: string }> = {
  pi: { v: Math.PI, label: 'π' },
  'π': { v: Math.PI, label: 'π' },
  e: { v: Math.E, label: 'e' },
  tau: { v: 2 * Math.PI, label: 'τ' },
  'τ': { v: 2 * Math.PI, label: 'τ' },
  phi: { v: (1 + Math.sqrt(5)) / 2, label: 'φ' },
  'φ': { v: (1 + Math.sqrt(5)) / 2, label: 'φ' },
  'golden ratio': { v: (1 + Math.sqrt(5)) / 2, label: 'φ' },
  'speed of light': { v: 299792458, unit: [['m', 1], ['s', -1]], label: 'c' },
  'speed of sound': { v: 343, unit: [['m', 1], ['s', -1]], label: 'speed of sound' },
  avogadro: { v: 6.02214076e23, unit: [['mol', -1]], label: 'Nₐ' },
  "avogadro's number": { v: 6.02214076e23, label: 'Nₐ' },
  'avogadro constant': { v: 6.02214076e23, unit: [['mol', -1]], label: 'Nₐ' },
  planck: { v: 6.62607015e-34, unit: [['J', 1], ['s', 1]], label: 'h' },
  'planck constant': { v: 6.62607015e-34, unit: [['J', 1], ['s', 1]], label: 'h' },
  boltzmann: { v: 1.380649e-23, unit: [['J', 1], ['K', -1]], label: 'k' },
  'boltzmann constant': { v: 1.380649e-23, unit: [['J', 1], ['K', -1]], label: 'k' },
  'elementary charge': { v: 1.602176634e-19, unit: [['coulomb', 1]], label: 'e' },
  'gravitational constant': { v: 6.6743e-11, unit: [['m', 3], ['g', -1], ['s', -2]], label: 'G' },
  'earth gravity': { v: 9.80665, unit: [['m', 1], ['s', -2]], label: 'g' },
  gravity: { v: 9.80665, unit: [['m', 1], ['s', -2]], label: 'g' },
};

/** Number words that multiply the preceding number. */
export const SCALES: Record<string, number> = {
  hundred: 100,
  hundreds: 100,
  thousand: 1e3,
  thousands: 1e3,
  k: 1e3,
  grand: 1e3,
  million: 1e6,
  millions: 1e6,
  M: 1e6,
  billion: 1e9,
  billions: 1e9,
  bn: 1e9,
  trillion: 1e12,
  trillions: 1e12,
  tn: 1e12,
  quadrillion: 1e15,
  dozen: 12,
  dozens: 12,
  lakh: 1e5,
  lakhs: 1e5,
  crore: 1e7,
  crores: 1e7,
};

/** Extra scale suffixes that only apply after a currency amount ($5k, €2.5M, $3B). */
export const CURRENCY_SCALES: Record<string, number> = {
  k: 1e3,
  K: 1e3,
  m: 1e6,
  M: 1e6,
  mm: 1e6,
  MM: 1e6,
  b: 1e9,
  B: 1e9,
  bn: 1e9,
  t: 1e12,
  T: 1e12,
  tn: 1e12,
  mil: 1e6,
};

/** Case-sensitive scale symbols (don't treat "m" as million outside currency). */
export const CASE_SENSITIVE_SCALES = new Set(['k', 'M', 'bn', 'tn']);

export const FRACTION_WORDS: Record<string, number> = {
  half: 0.5,
  halves: 0.5,
  third: 1 / 3,
  thirds: 1 / 3,
  quarter: 0.25,
  quarters: 0.25,
};

export const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90,
};

export type FormatName = 'hex' | 'bin' | 'oct' | 'dec' | 'sci' | 'frac' | 'pct' | 'words' | 'roman' | 'unix' | 'base';

export const FORMAT_WORDS: Record<string, FormatName> = {
  hex: 'hex',
  hexadecimal: 'hex',
  bin: 'bin',
  binary: 'bin',
  oct: 'oct',
  octal: 'oct',
  dec: 'dec',
  decimal: 'dec',
  decimals: 'dec',
  number: 'dec',
  sci: 'sci',
  scientific: 'sci',
  'scientific notation': 'sci',
  exponential: 'sci',
  'e notation': 'sci',
  fraction: 'frac',
  fractions: 'frac',
  frac: 'frac',
  percent: 'pct',
  percentage: 'pct',
  pct: 'pct',
  words: 'words',
  english: 'words',
  roman: 'roman',
  'roman numerals': 'roman',
  'roman numeral': 'roman',
  unix: 'unix',
  timestamp: 'unix',
  'unix time': 'unix',
  'unix timestamp': 'unix',
  epoch: 'unix',
  base: 'base',
};

export const ROUND_WORDS: Record<string, 'dp' | 'sf'> = {
  dp: 'dp',
  'decimal places': 'dp',
  'decimal place': 'dp',
  decimals: 'dp',
  places: 'dp',
  digits: 'dp',
  sf: 'sf',
  'sig figs': 'sf',
  'sig fig': 'sf',
  'significant figures': 'sf',
  'significant digits': 'sf',
  sigfigs: 'sf',
};

export const MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6,
  july: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9, october: 10, oct: 10,
  november: 11, nov: 11, december: 12, dec: 12,
};

export const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
};

export const DATE_WORDS = new Set([
  'now', 'today', 'tomorrow', 'yesterday', 'noon', 'midnight', 'time', 'date', 'next', 'last', 'this',
  'ago', 'from', 'after', 'before', 'until', 'till', 'til', 'since', 'later', 'hence', 'local', 'local time',
  'from now', 'tonight', 'in',
]);

/** Format targets that produce dates. */
export const DATE_TARGETS = new Set(['date', 'iso', 'iso 8601', 'iso8601']);

type MonthDay = [number, number];

/** The nth weekday of a month (n = -1 for the last one). */
function nthWeekday(y: number, mo: number, wd: number, n: number): MonthDay {
  if (n > 0) {
    const first = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay();
    return [mo, 1 + ((wd - first + 7) % 7) + (n - 1) * 7];
  }
  const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const lastWd = new Date(Date.UTC(y, mo, 0)).getUTCDay();
  return [mo, lastDay - ((lastWd - wd + 7) % 7)];
}

/** Western Easter (anonymous Gregorian algorithm). */
function easter(y: number): MonthDay {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  return [Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1];
}

export const HOLIDAYS: Record<string, MonthDay | ((year: number) => MonthDay)> = {
  thanksgiving: (y) => nthWeekday(y, 11, 4, 4),
  'thanksgiving day': (y) => nthWeekday(y, 11, 4, 4),
  easter: easter,
  'easter sunday': easter,
  "mother's day": (y) => nthWeekday(y, 5, 0, 2),
  'mothers day': (y) => nthWeekday(y, 5, 0, 2),
  "father's day": (y) => nthWeekday(y, 6, 0, 3),
  'fathers day': (y) => nthWeekday(y, 6, 0, 3),
  'labor day': (y) => nthWeekday(y, 9, 1, 1),
  'memorial day': (y) => nthWeekday(y, 5, 1, -1),
  'black friday': (y) => {
    const [mo, d] = nthWeekday(y, 11, 4, 4);
    return [mo, d + 1];
  },
  christmas: [12, 25],
  'christmas day': [12, 25],
  xmas: [12, 25],
  'christmas eve': [12, 24],
  "new year's eve": [12, 31],
  'new years eve': [12, 31],
  "new year's day": [1, 1],
  'new years day': [1, 1],
  'new year': [1, 1],
  "new year's": [1, 1],
  halloween: [10, 31],
  "valentine's day": [2, 14],
  'valentines day': [2, 14],
  "valentine's": [2, 14],
  'independence day': [7, 4],
  'july 4th': [7, 4],
  'st patricks day': [3, 17],
  "st. patrick's day": [3, 17],
  "st patrick's day": [3, 17],
};

export function holidayDate(name: string, year: number): MonthDay {
  const h = HOLIDAYS[name];
  return typeof h === 'function' ? h(year) : h;
}

const CUP_ML = 236.5882365;

/** Densities (g/mL) so volume ↔ mass conversions work: "2 cups flour in grams". */
export const DENSITIES: Record<string, number> = {
  water: 1,
  milk: 1.03,
  'whole milk': 1.03,
  buttermilk: 1.03,
  cream: 1.01,
  'heavy cream': 1.01,
  yogurt: 1.04,
  flour: 125 / CUP_ML,
  'all purpose flour': 125 / CUP_ML,
  'all-purpose flour': 125 / CUP_ML,
  'ap flour': 125 / CUP_ML,
  'bread flour': 127 / CUP_ML,
  'whole wheat flour': 120 / CUP_ML,
  'cake flour': 114 / CUP_ML,
  'almond flour': 96 / CUP_ML,
  sugar: 200 / CUP_ML,
  'granulated sugar': 200 / CUP_ML,
  'white sugar': 200 / CUP_ML,
  'brown sugar': 220 / CUP_ML,
  'powdered sugar': 120 / CUP_ML,
  'icing sugar': 120 / CUP_ML,
  "confectioners sugar": 120 / CUP_ML,
  butter: 226.796185 / CUP_ML, // a stick (¼ lb) is exactly ½ cup
  oil: 0.92,
  'olive oil': 0.91,
  'vegetable oil': 0.92,
  'coconut oil': 0.92,
  honey: 340 / CUP_ML,
  'maple syrup': 315 / CUP_ML,
  molasses: 337 / CUP_ML,
  salt: 288 / CUP_ML,
  'table salt': 288 / CUP_ML,
  'kosher salt': 135 / CUP_ML,
  rice: 185 / CUP_ML,
  oats: 90 / CUP_ML,
  'rolled oats': 90 / CUP_ML,
  'cocoa powder': 85 / CUP_ML,
  cocoa: 85 / CUP_ML,
  cornstarch: 128 / CUP_ML,
  'baking soda': 220 / CUP_ML,
  'baking powder': 192 / CUP_ML,
  'chocolate chips': 170 / CUP_ML,
  'peanut butter': 258 / CUP_ML,
  coffee: 1,
  'ground coffee': 85 / CUP_ML,
  wine: 0.99,
  beer: 1.01,
  gasoline: 0.745,
  petrol: 0.745,
  diesel: 0.832,
  ice: 0.917,
  seawater: 1.025,
  'sea water': 1.025,
  air: 0.001225,
  mercury: 13.534,
  gold: 19.32,
  silver: 10.49,
  platinum: 21.45,
  copper: 8.96,
  aluminum: 2.7,
  aluminium: 2.7,
  iron: 7.87,
  steel: 7.85,
  lead: 11.34,
  titanium: 4.51,
  concrete: 2.4,
  glass: 2.5,
  sand: 1.6,
};

/** Liquids: "12 oz of milk" means fluid ounces; "8 oz of flour" means weight. */
export const LIQUIDS = new Set([
  'water', 'milk', 'whole milk', 'buttermilk', 'cream', 'heavy cream', 'coffee', 'wine', 'beer', 'oil', 'olive oil',
  'vegetable oil', 'gasoline', 'petrol', 'diesel', 'seawater', 'sea water',
]);

/** Other keywords the parser understands in context. */
export const KEYWORDS = new Set([
  'for', 'each', 'how many', 'how much', 'between', 'difference between', 'the difference between', 'time between',
  'percent change', 'percentage change', 'percent increase', 'percentage increase', 'percent decrease', 'percentage decrease',
  'log base', 'rounded', 'factorial', 'point', 'integer', 'whole number', 'what time is it',
  'day of year', 'day of the year', 'week of year', 'week of the year', 'week number',
  'a', 'an', 'what', 'is', 'of', 'above', 'sq', 'square', 'cubic', 'cu', 'nearest', 'the nearest', 'negative',
  'notation', 'hms', 'percent', 'per cent', 'percentage', 'pct',
]);

// ---------------------------------------------------------------------------
// Time zones

export const TZ_ABBR: Record<string, string> = {
  UTC: 'UTC', GMT: 'Etc/GMT', Z: 'UTC', Zulu: 'UTC', LA: 'America/Los_Angeles', SF: 'America/Los_Angeles',
  NYC: 'America/New_York', DC: 'America/New_York', HK: 'Asia/Hong_Kong',
  ET: 'America/New_York', EST: 'America/New_York', EDT: 'America/New_York',
  CT: 'America/Chicago', CST: 'America/Chicago', CDT: 'America/Chicago',
  MT: 'America/Denver', MST: 'America/Denver', MDT: 'America/Denver',
  PT: 'America/Los_Angeles', PST: 'America/Los_Angeles', PDT: 'America/Los_Angeles',
  AKST: 'America/Anchorage', AKDT: 'America/Anchorage', HST: 'Pacific/Honolulu',
  AST: 'America/Halifax', ADT: 'America/Halifax', NST: 'America/St_Johns', NDT: 'America/St_Johns',
  BST: 'Europe/London', WET: 'Europe/Lisbon', WEST: 'Europe/Lisbon',
  CET: 'Europe/Paris', CEST: 'Europe/Paris', EET: 'Europe/Athens', EEST: 'Europe/Athens',
  MSK: 'Europe/Moscow', IST: 'Asia/Kolkata', PKT: 'Asia/Karachi', ICT: 'Asia/Bangkok',
  WIB: 'Asia/Jakarta', SGT: 'Asia/Singapore', HKT: 'Asia/Hong_Kong', JST: 'Asia/Tokyo',
  KST: 'Asia/Seoul', AEST: 'Australia/Sydney', AEDT: 'Australia/Sydney', ACST: 'Australia/Adelaide',
  ACDT: 'Australia/Adelaide', AWST: 'Australia/Perth', NZST: 'Pacific/Auckland', NZDT: 'Pacific/Auckland',
  BRT: 'America/Sao_Paulo', ART: 'America/Argentina/Buenos_Aires', SAST: 'Africa/Johannesburg',
  EAT: 'Africa/Nairobi', WAT: 'Africa/Lagos', CAT: 'Africa/Maputo', GST: 'Asia/Dubai',
};

/** Lowercase place names → IANA zone. */
export const PLACES: Record<string, string> = {
  'new york': 'America/New_York', nyc: 'America/New_York', 'new york city': 'America/New_York',
  boston: 'America/New_York', washington: 'America/New_York', 'washington dc': 'America/New_York',
  philadelphia: 'America/New_York', miami: 'America/New_York', atlanta: 'America/New_York',
  detroit: 'America/Detroit', toronto: 'America/Toronto', montreal: 'America/Toronto',
  chicago: 'America/Chicago', houston: 'America/Chicago', dallas: 'America/Chicago', austin: 'America/Chicago',
  'mexico city': 'America/Mexico_City', denver: 'America/Denver', calgary: 'America/Edmonton',
  phoenix: 'America/Phoenix', 'los angeles': 'America/Los_Angeles', 'san francisco': 'America/Los_Angeles',
  seattle: 'America/Los_Angeles', 'las vegas': 'America/Los_Angeles', 'san diego': 'America/Los_Angeles',
  'san jose': 'America/Los_Angeles', vancouver: 'America/Vancouver', anchorage: 'America/Anchorage',
  honolulu: 'Pacific/Honolulu', hawaii: 'Pacific/Honolulu', alaska: 'America/Anchorage',
  'sao paulo': 'America/Sao_Paulo', 'são paulo': 'America/Sao_Paulo', 'rio de janeiro': 'America/Sao_Paulo',
  'buenos aires': 'America/Argentina/Buenos_Aires', santiago: 'America/Santiago', lima: 'America/Lima',
  bogota: 'America/Bogota', 'bogotá': 'America/Bogota', caracas: 'America/Caracas',
  london: 'Europe/London', edinburgh: 'Europe/London', manchester: 'Europe/London', dublin: 'Europe/Dublin',
  lisbon: 'Europe/Lisbon', madrid: 'Europe/Madrid', barcelona: 'Europe/Madrid', paris: 'Europe/Paris',
  brussels: 'Europe/Brussels', amsterdam: 'Europe/Amsterdam', berlin: 'Europe/Berlin', munich: 'Europe/Berlin',
  frankfurt: 'Europe/Berlin', hamburg: 'Europe/Berlin', zurich: 'Europe/Zurich', 'zürich': 'Europe/Zurich',
  geneva: 'Europe/Zurich', vienna: 'Europe/Vienna', prague: 'Europe/Prague', warsaw: 'Europe/Warsaw',
  budapest: 'Europe/Budapest', rome: 'Europe/Rome', milan: 'Europe/Rome', stockholm: 'Europe/Stockholm',
  oslo: 'Europe/Oslo', copenhagen: 'Europe/Copenhagen', helsinki: 'Europe/Helsinki', athens: 'Europe/Athens',
  istanbul: 'Europe/Istanbul', moscow: 'Europe/Moscow', kyiv: 'Europe/Kyiv', kiev: 'Europe/Kyiv',
  reykjavik: 'Atlantic/Reykjavik', cairo: 'Africa/Cairo', lagos: 'Africa/Lagos', nairobi: 'Africa/Nairobi',
  johannesburg: 'Africa/Johannesburg', 'cape town': 'Africa/Johannesburg', casablanca: 'Africa/Casablanca',
  dubai: 'Asia/Dubai', 'abu dhabi': 'Asia/Dubai', riyadh: 'Asia/Riyadh', doha: 'Asia/Qatar',
  'tel aviv': 'Asia/Jerusalem', jerusalem: 'Asia/Jerusalem', tehran: 'Asia/Tehran', karachi: 'Asia/Karachi',
  mumbai: 'Asia/Kolkata', delhi: 'Asia/Kolkata', 'new delhi': 'Asia/Kolkata', bangalore: 'Asia/Kolkata',
  bengaluru: 'Asia/Kolkata', kolkata: 'Asia/Kolkata', chennai: 'Asia/Kolkata', dhaka: 'Asia/Dhaka',
  kathmandu: 'Asia/Kathmandu', bangkok: 'Asia/Bangkok', jakarta: 'Asia/Jakarta', singapore: 'Asia/Singapore',
  'kuala lumpur': 'Asia/Kuala_Lumpur', manila: 'Asia/Manila', 'ho chi minh city': 'Asia/Ho_Chi_Minh',
  hanoi: 'Asia/Bangkok', 'hong kong': 'Asia/Hong_Kong', shanghai: 'Asia/Shanghai', beijing: 'Asia/Shanghai',
  shenzhen: 'Asia/Shanghai', taipei: 'Asia/Taipei', seoul: 'Asia/Seoul', tokyo: 'Asia/Tokyo', osaka: 'Asia/Tokyo',
  sydney: 'Australia/Sydney', melbourne: 'Australia/Melbourne', brisbane: 'Australia/Brisbane',
  perth: 'Australia/Perth', adelaide: 'Australia/Adelaide', auckland: 'Pacific/Auckland',
  wellington: 'Pacific/Auckland',
  pacific: 'America/Los_Angeles', 'pacific time': 'America/Los_Angeles', eastern: 'America/New_York',
  'eastern time': 'America/New_York', central: 'America/Chicago', 'central time': 'America/Chicago',
  mountain: 'America/Denver', 'mountain time': 'America/Denver',
  california: 'America/Los_Angeles', texas: 'America/Chicago', florida: 'America/New_York',
  'new york state': 'America/New_York', colorado: 'America/Denver', arizona: 'America/Phoenix',
  'washington state': 'America/Los_Angeles', oregon: 'America/Los_Angeles', illinois: 'America/Chicago',
  brazil: 'America/Sao_Paulo', australia: 'Australia/Sydney', canada: 'America/Toronto', mexico: 'America/Mexico_City',
  russia: 'Europe/Moscow', scotland: 'Europe/London', wales: 'Europe/London', belgium: 'Europe/Brussels',
  austria: 'Europe/Vienna', 'czech republic': 'Europe/Prague', hungary: 'Europe/Budapest', romania: 'Europe/Bucharest',

  // countries with a single dominant zone
  japan: 'Asia/Tokyo', india: 'Asia/Kolkata', china: 'Asia/Shanghai', uk: 'Europe/London',
  'united kingdom': 'Europe/London', england: 'Europe/London', germany: 'Europe/Berlin', france: 'Europe/Paris',
  spain: 'Europe/Madrid', italy: 'Europe/Rome', 'south korea': 'Asia/Seoul', korea: 'Asia/Seoul',
  israel: 'Asia/Jerusalem', egypt: 'Africa/Cairo', kenya: 'Africa/Nairobi', nigeria: 'Africa/Lagos',
  ireland: 'Europe/Dublin', netherlands: 'Europe/Amsterdam', switzerland: 'Europe/Zurich',
  sweden: 'Europe/Stockholm', norway: 'Europe/Oslo', denmark: 'Europe/Copenhagen', finland: 'Europe/Helsinki',
  poland: 'Europe/Warsaw', ukraine: 'Europe/Kyiv', greece: 'Europe/Athens', portugal: 'Europe/Lisbon',
  thailand: 'Asia/Bangkok', vietnam: 'Asia/Ho_Chi_Minh', indonesia: 'Asia/Jakarta', philippines: 'Asia/Manila',
  malaysia: 'Asia/Kuala_Lumpur', taiwan: 'Asia/Taipei', 'new zealand': 'Pacific/Auckland',
  argentina: 'America/Argentina/Buenos_Aires', chile: 'America/Santiago', peru: 'America/Lima',
  colombia: 'America/Bogota', iceland: 'Atlantic/Reykjavik', 'south africa': 'Africa/Johannesburg',
  uae: 'Asia/Dubai', pakistan: 'Asia/Karachi', bangladesh: 'Asia/Dhaka', nepal: 'Asia/Kathmandu',
  iran: 'Asia/Tehran', 'saudi arabia': 'Asia/Riyadh', qatar: 'Asia/Qatar',
};

/** Resolve a word token to an IANA zone (or 'UTC'). */
export function resolveZone(s: string, lo: string): string | null {
  if (TZ_ABBR[s]) return TZ_ABBR[s];
  if (PLACES[lo]) return PLACES[lo];
  if (s.includes('/')) return s;
  if (lo === 'utc' || lo === 'gmt') return 'UTC';
  return null;
}

/** All lowercase multi-word phrases that should be merged by the lexer. */
export function vocabPhrases(): string[] {
  const keys = [
    ...Object.keys(OP_WORDS),
    ...Object.keys(FUNCTIONS),
    ...Object.keys(CONSTANTS),
    ...Object.keys(FORMAT_WORDS),
    ...Object.keys(ROUND_WORDS),
    ...Object.keys(PLACES),
    ...Object.keys(HOLIDAYS),
    ...DATE_WORDS,
    ...KEYWORDS,
    ...Object.keys(DENSITIES),
  ];
  return keys.filter((k) => k.includes(' ') || k.includes('-'));
}
