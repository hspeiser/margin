import { calc, evaluateDocument } from '../src/engine';

// Expected values in this file come from pint 0.26.1 (an independent unit
// library), not from hand calculation. Every engine unit and prefix was checked
// against pint; these rows pin a representative sample at 1e-9 relative error.

const now = Date.UTC(2026, 9, 15, 18, 30);
const c = (s: string) => calc(s, { now });

/** Full-precision numeric result of a conversion (the display rounds to 4 dp). */
function value(expr: string): number {
  const r = evaluateDocument(expr, { now }).at(-1)!;
  if (r.kind !== 'value' || r.value?.kind !== 'q') throw new Error(`${expr} → ${r.kind} ${r.error ?? ''}`);
  return r.value.v;
}

function expectClose(got: number, want: number, rel = 1e-9) {
  const scale = Math.max(Math.abs(got), Math.abs(want));
  if (scale === 0) return;
  expect(Math.abs(got - want) / scale).toBeLessThanOrEqual(rel);
}

function table(name: string, rows: [string, string][]) {
  describe(name, () => {
    for (const [input, expected] of rows) it(input, () => expect(c(input)).toBe(expected));
  });
}

function oracle(name: string, rows: [string, number][]) {
  describe(name, () => {
    for (const [expr, want] of rows) it(expr, () => expectClose(value(expr), want));
  });
}

oracle('pint: SI and binary prefixes', [
  ['1 km in m', 1000],
  ['1 mL in m^3', 1e-6],
  ['1 µs in s', 1e-6],
  ['1 us in s', 1e-6],
  ['5 mL in tsp', 1.0144206810552905],
  ['1 GiB in bit', 8589934592],
  ['1 TB in GiB', 931.3225746154785],
  ['1 GiB in MB', 1073.741824],
  ['1 YiB in ZB', 1208.925819614629],
  ['1 MBps in Mbps', 8],
  ['100 MBps in GB/h', 360],
  ['1 Gbps in MB/s', 125],
]);

oracle('pint: compound units', [
  ['60 mph in km/h', 96.56064],
  ['60 mph in m/s', 26.8224],
  ['100 km/h in mph', 62.1371192237334],
  ['2.5 kWh in J', 9000000],
  ['2.5 kWh in BTU', 8530.354082819853],
  ['1 MWh in GJ', 3.6],
  ['100 psi in bar', 6.894757293168364],
  ['100 psi in kPa', 689.4757293168364],
  ['1 kpsi in MPa', 6.894757293168363],
  ['1 atm in psi', 14.695948775513443],
  ['30 mpg in L/100km', 7.840486111111109],
  ['8 L/100km in mpg', 29.401822916666664],
  ['25 mpg in km/L', 10.628592685756802],
  ['1 L/100km in mpg', 235.2145833333333],
  ['200 lb in N', 889.6443230521002],
  ['1 Ah in coulomb', 3600],
  ['2000 mAh in coulomb', 7200],
  ['100 ft·lb in N·m', 135.58179483314],
  ['1 cfm in L/s', 0.47194744319999976],
  ['1 gpm in L/min', 3.7854117839999986],
  ['1 rpm in rad/s', 0.10471975511965977],
]);

oracle('pint: customary and other units', [
  ['1 cup in fl oz', 8],
  ['1 imperial gallon in gal', 1.2009499255048557],
  ['1 lb in oz', 16],
  ['1 st in lb', 14],
  ['1 ozt in g', 31.1034768],
  ['1 long ton in kg', 1016.0469088],
  ['1 hp in PS', 1.0138696654239998],
  ['1 lbf in kgf', 0.45359237],
  ['1 kcal in kJ', 4.184],
  ['1 eV in J', 1.602176634e-19],
  ['1 BTU in kJ', 1.0550558526200002],
  ['1 ly in pc', 0.3066013937879527],
  ['1 nmi in mi', 1.1507794480235425],
  ['1 knot in mph', 1.1507794480235427],
  ['1 hand in in', 4],
  ['12 pt in mm', 4.2333333333333325],
  ['90 deg in grad', 100],
]);

oracle('pint: temperatures', [
  ['1 °F in K', 255.92777777777778],
  ['300 K in °F', 80.33],
  ['500 °R in °C', 4.627777777777794],
  ['-40 °C in °F', -40],
  ['37 °C in °F', 98.6],
  ['98.6 °F in °C', 37],
  ['451 °F in °C', 232.77777777777783],
  ['-273.15 °C in °F', -459.67],
  ['100 °C in °R', 671.67],
  ['30 °C - 20 °C in °F', 18],
  ['68 °F - 32 °F in K', 20],
  ['50 °F + 10 °R in °C', 15.5555555555556],
]);

describe('temperature round trips', () => {
  const scales = ['°C', '°F', 'K', '°R'];
  for (const x of [-40, 0, 37, 451]) {
    for (const a of scales) {
      for (const b of scales) {
        if (a === b) continue;
        it(`${x} ${a} → ${b} → ${a}`, () => {
          const there = value(`${x} ${a} in ${b}`);
          const back = value(`${there} ${b} in ${a}`);
          expect(Math.abs(back - x)).toBeLessThan(1e-9);
        });
      }
    }
  }
  it('absolute zero is exactly zero', () => {
    expect(value('-459.67 °F in K')).toBe(0);
    expect(value('-273.15 °C in °R')).toBe(0);
  });
});

describe('regressions found by the pint comparison', () => {
  // a shot (jigger) is 1.5 US fl oz; the factor had a digit typo (44.3618 mL)
  it('shot', () => {
    expect(c('1 shot in mL')).toBe('44.3603 mL');
    expect(c('1 shot in tbsp')).toBe('3 tbsp');
    expect(c('1 jigger in fl oz')).toBe('1.5 fl oz');
    expectClose(value('1 shot in m^3'), 4.436029434375e-5, 1e-12);
  });
  // conventional inHg is 25.4 mm × 13595.1 kg/m³ × g₀, not the rounded 3386.389 Pa
  it('inHg', () => {
    expect(c('1 inHg in Pa')).toBe('3,386.3886 Pa');
    expect(c('30 inHg in hPa')).toBe('1,015.9166 hPa');
    expectClose(value('1 inHg in Pa'), 3386.388640341, 1e-12);
  });
  // dalton: CODATA 2022 value
  it('dalton', () => {
    expectClose(value('1 Da in kg'), 1.66053906892e-27, 1e-12);
    expectClose(value('1 kDa in kg'), 1.66053906892e-24, 1e-12);
  });
});

describe('parsing regressions found by the pint comparison', () => {
  // the engine displays imperial units as "imp gal" / "imp pint", but typing that back read US units
  it('imp gal and imp pint', () => {
    expect(c('1 imp gal')).toBe('1 imp gal');
    expect(c('1 imp gal in L')).toBe('4.5461 L');
    expect(c('2 imp gals in L')).toBe('9.0922 L');
    expect(c('1 gal in imp gal')).toBe('0.8327 imp gal');
    expect(c('2 imp pint in mL')).toBe('1,136.5225 mL');
    expect(c('1 imp gal in imp pint')).toBe('8 imperial pints');
    expectClose(value('1 imp gal in m^3'), 0.00454609, 1e-12);
    expectClose(value('1 imp pint in m^3'), 0.00056826125, 1e-12);
  });
  // ″ and ′ are the arcsec/arcmin display symbols; "1 ″ in rad" read ″ as a quote and gave a plain 1
  it('marks converted to an angle are arcminutes and arcseconds', () => {
    expect(c('1 ″ in rad')).toBe('0.000004848 rad');
    expectClose(value('1″ in rad'), Math.PI / 648000);
    expectClose(value('1 ′ in rad'), Math.PI / 10800);
    expect(c('3600″ in °')).toBe('1°');
    expect(c("30' in °")).toBe('0.5°');
    expect(c('-30′ in °')).toBe('-0.5°');
    expect(c(`6'2" in arcsec`)).toBe('362″');
    expect(c('1° in ″')).toBe('3,600″');
    expect(c('1° in ′')).toBe('60′');
  });
  it('marks otherwise keep meaning feet and inches', () => {
    expect(c(`6'2"`)).toBe('6.1667 ft');
    expect(c('6′2″')).toBe('6.1667 ft');
    expect(c('6′2″ in cm')).toBe('187.96 cm');
    expect(c('12 ″ in cm')).toBe('30.48 cm');
    expect(c(`30°15'`)).toBe('30.25°');
    expect(c('30°15′20″')).toBe('30.2556°');
    expect(c(`5 "quoted text"`)).toBe('5');
  });
  // "avogadro in 1/mol" lost the value and gave 1/mol
  it('1/unit targets', () => {
    expectClose(value('avogadro in 1/mol'), 6.02214076e23);
    expect(c('avogadro in 1/mol')).toBe(c('avogadro in mol^-1'));
    expect(c('5 Hz in 1/min')).toBe('300/min');
    expect(c('1/mol in 1/mmol')).toBe('0.001/mmol');
    expect(c('60 km/h in 1/min')).toBe(c('60 km/h in /min'));
  });
});

// These differ from pint on purpose. Pinned so they don't drift unnoticed.
table('definition choices', [
  ['1 yr in days', '365.2425 days'], // Gregorian year; pint uses the Julian 365.25
  ['1 month in days', '30.4369 days'], // Gregorian year / 12
  ['1 acre in m^2', '4,046.8564 m²'], // international acre; pint uses the US survey acre
  ['1 rod in ft', '16.5 ft'], // international feet; pint's rod/chain/furlong/fathom/league use survey feet
  ['1 BTU in J', '1,055.0559 J'], // International Table Btu; pint's "Btu" is ISO 1055.056 J
  ['1 therm in BTU', '100,000 BTU'], // 10⁵ IT Btu; pint uses 10⁵ ISO Btu
  ['1 mmHg in Pa', '133.3224 Pa'], // = 1 torr (101325/760); conventional mmHg is 133.322387415 Pa
  ['1 atm in mmHg', '760 mmHg'],
  ['1 bbl in gal', '42 gal'], // oil barrel; pint's "bbl" is the 31.5 gal fluid barrel
  ['mach 1 in m/s', '340.29 m/s'], // sea level, ISA 15 °C
  ['60 rpm in Hz', '1 Hz'], // revolutions are cycles; pint gives 2π Hz
]);
