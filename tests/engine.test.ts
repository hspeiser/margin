import { calc, evaluateDocument } from '../src/engine';

// Thu Oct 15 2026, 11:30 AM in Los Angeles (TZ set in vitest.config.ts)
const now = Date.UTC(2026, 9, 15, 18, 30);
const c = (s: string) => calc(s, { now });

function table(name: string, rows: [string, string][]) {
  describe(name, () => {
    for (const [input, expected] of rows) {
      it(input, () => expect(c(input)).toBe(expected));
    }
  });
}

table('arithmetic', [
  ['2 + 2', '4'],
  ['0.1 + 0.2', '0.3'],
  ['10 / 3', '3.3333'],
  ['2^10', '1,024'],
  ['2 ** 3', '8'],
  ['-2^2', '-4'],
  ['2^-1', '0.5'],
  ['2^3^2', '512'],
  ['5!', '120'],
  ['(1 + 2) * 3', '9'],
  ['6 / 2(1+2)', '9'],
  ['2pi', '6.2832'],
  ['3(4)', '12'],
  ['(2)(3)', '6'],
  ['sqrt 16', '4'],
  ['sqrt(16) + 9', '13'],
  ['square root of 81', '9'],
  ['cube root of 27', '3'],
  ['cbrt(-8)', '-2'],
  ['1,000,000 * 3', '3,000,000'],
  ['1_000 + 1', '1,001'],
  ['5k + 2', '5,002'],
  ['3 million', '3,000,000'],
  ['2.5M', '2,500,000'],
  ['1.5 billion / 3', '500,000,000'],
  ['a dozen', '12'],
  ['3 dozen', '36'],
  ['5 x 3', '15'],
  ['2x3', '6'],
  ['5 × 3 ÷ 2', '7.5'],
  ['8 − 3', '5'],
  ['10 plus 5', '15'],
  ['10 minus 5', '5'],
  ['3 times 4', '12'],
  ['12 divided by 4', '3'],
  ['3 multiplied by 4', '12'],
  ['2 to the power of 8', '256'],
  ['5 squared', '25'],
  ['2 cubed', '8'],
  ['10 mod 3', '1'],
  ['-7 mod 3', '2'],
  ['10 % 3', '1'],
  ['½ + ¼', '0.75'],
  ['1½ * 2', '3'],
  ['3²', '9'],
  ['1e3', '1,000'],
  ['1.5e-3', '0.0015'],
  ['.5 + .25', '0.75'],
  ['1/0', 'Error: Division by zero'],
  ['= 5 + 3', '8'],
  ['5 + 3 =', '8'],
  ['half of 50', '25'],
  ['a third of 90', '30'],
  ['twenty five + 5', '30'],
]);

table('bases and formats', [
  ['0xFF', '255'],
  ['0b1010 + 1', '11'],
  ['0o17', '15'],
  ['255 in hex', '0xFF'],
  ['10 in binary', '0b1010'],
  ['64 in octal', '0o100'],
  ['255 in base 36', '73 (base 36)'],
  ['0xFF & 0x0F', '15'],
  ['6 | 3', '7'],
  ['6 xor 3', '5'],
  ['1 << 10', '1,024'],
  ['0.75 as fraction', '3/4'],
  ['2.375 in fraction', '2 3/8'],
  ['pi as fraction', '≈ 355/113'],
  ['1e6 in sci', '1 × 10⁶'],
  ['123456 in scientific notation', '1.2346 × 10⁵'],
  ['pi to 2 dp', '3.14'],
  ['1 to 2 dp', '1.00'],
  ['123456 to 2 sf', '120,000'],
  ['1234 in words', 'one thousand two hundred thirty-four'],
  ['2026 in roman', 'MMXXVI'],
  ['17 to the nearest 5', '15'],
  ['0.25 in %', '25%'],
  ['0.256 as a percentage', '25.6%'],
]);

table('units: basics', [
  ['5 km in miles', '3.1069 mi'],
  ['5 km to mi', '3.1069 mi'],
  ['5 km as m', '5,000 m'],
  ['5 km into m', '5,000 m'],
  ['5 km + 300 m', '5.3 km'],
  ['5 km - 300 m in m', '4,700 m'],
  ['1 mile in furlongs', '8 furlongs'],
  ['a mile in km', '1.6093 km'],
  ['mile in feet', '5,280 ft'],
  ['half a mile in m', '804.672 m'],
  ['1 light year in km', '9,460,730,472,580.8 km'],
  ['1 AU in light minutes', '8.3167 light minutes'],
  ['5 stone in kg', '31.7515 kg'],
  ['150 lbs in kg', '68.0389 kg'],
  ['1 troy ounce in g', '31.1035 g'],
  ['1 tonne in lb', '2,204.6226 lb'],
  ['5 KM in m', '5,000 m'],
  ['5 Kg in g', '5,000 g'],
  ['100 kilometers in miles', '62.1371 mi'],
  ['3 millimetres in µm', '3,000 µm'],
  ['3 mm in um', '3,000 µm'],
  ['250 mcg in mg', '0.25 mg'],
  ['1 hectare in acres', '2.4711 acres'],
  ['2 cups in mL', '473.1765 mL'],
  ['1 gallon in liters', '3.7854 L'],
  ['1 imperial gallon in L', '4.5461 L'],
  ['16 fl oz in mL', '473.1765 mL'],
  ['3 tsp in tbsp', '1 tbsp'],
  ['1 cubic meter in L', '1,000 L'],
  ['1 cu ft in L', '28.3168 L'],
  ['1000 cc in L', '1 L'],
  ['100 sq ft in m2', '9.2903 m²'],
  ['1 square mile in km²', '2.59 km²'],
  ['1 sqkm in acres', '247.1054 acres'],
  ['1 m^2 in sq ft', '10.7639 ft²'],
  ['1 m³ in gallons', '264.1721 gal'],
]);

table('units: ambiguous "in"', [
  ['5 in', '5 in'],
  ['5 in in cm', '12.7 cm'],
  ['5 in cm', '12.7 cm'],
  ['5 in to cm', '12.7 cm'],
  ['12 in + 1 ft', '24 in'],
  ['3 in * 2', '6 in'],
  ['100 in hex', '0x64'],
  ['20 in USD', '$20'],
  ['5 ft 11 in in cm', '180.34 cm'],
]);

table('units: mixed and compound output', [
  ['6\'2" in cm', '187.96 cm'],
  ["5' 10\" in m", '1.778 m'],
  ['1.8 m in ft in', '5 ft 10.87 in'],
  ['1.8 m in feet and inches', '5 ft 10.87 in'],
  ['180 cm in ft and in', '5 ft 10.87 in'],
  ['1 h 30 min in min', '90 minutes'],
  ['1 hour and 30 minutes in hours', '1.5 hours'],
  ['90 min in hours and minutes', '1 hour 30 minutes'],
  ['3725 s in hms', '1 hour 2 minutes 5 seconds'],
  ['2 lb 3 oz in g', '992.2333 g'],
  ['1.25 kg in lb oz', '2 lb 12.09 oz'],
  ['70 kg in st lb', '11 st 0.32 lb'],
  ['30°15\' in deg', '30.25°'],
  ['1 1/2 cups in mL', '354.8824 mL'],
  ['3/4 cup in tbsp', '12 tbsp'],
  ['5 1/2 ft in m', '1.6764 m'],
]);

table('units: dimensional analysis', [
  ['60 mph in km/h', '96.5606 km/h'],
  ['100 km / 2 h', '50 km/h'],
  ['100 km / 2 h in mph', '31.0686 mph'],
  ['100 miles / 2 hours', '50 mph'],
  ['5 kg * 9.8 m/s^2', '49 N'],
  ['5 kg * 9.8 m/s²', '49 N'],
  ['9.8 m/s/s * 2 s', '19.6 m/s'],
  ['3 ft * 4 ft', '12 ft²'],
  ['10 ft by 12 ft in m^2', '11.1484 m²'],
  ['10 m * 5 m * 2 m in L', '100,000 L'],
  ['60 mph * 2 h', '120 mi'],
  ['60 mph * 30 min', '30 mi'],
  ['60 km / 100 km/h', '36 min'],
  ['4 h / 26.2 mi', '0.1527 h/mi'],
  ['100 GB / 10 MB/s', '2 h 46 min 40 s'],
  ['100 GB / 10 MB/s in h', '2.7778 hours'],
  ['500 MB / 25 Mbps', '2 min 40 s'],
  ['10 MB/s * 1 h', '36 GB'],
  ['1 Gbps * 1 min', '60 Gb'],
  ['1 TB in GiB', '931.3226 GiB'],
  ['1 GiB in MB', '1,073.7418 MB'],
  ['8 bits in bytes', '1 B'],
  ['500 gb in tb', '0.5 TB'],
  ['2 kW * 3 h', '6 kWh'],
  ['12 V * 2 A', '24 W'],
  ['5 J / 2 s', '2.5 W'],
  ['10 A * 5 h', '50 Ah'],
  ['500 mA * 4 h', '2,000 mAh'],
  ['1 kWh in J', '3,600,000 J'],
  ['1 kWh in MJ', '3.6 MJ'],
  ['1 hp in kW', '0.7457 kW'],
  ['100 psi in bar', '6.8948 bar'],
  ['1 atm in kPa', '101.325 kPa'],
  ['1 atm in mmHg', '760 mmHg'],
  ['2000 kcal in kJ', '8,368 kJ'],
  ['2000 calories in kWh', '2.3244 kWh'],
  ['speed of light in km/s', '299,792.458 km/s'],
  ['1 knot in km/h', '1.852 km/h'],
  ['mach 1 in mph', '761.2071 mph'],
  ['1 N*m in J', '1 J'],
  ['sqrt(16 m^2)', '4 m'],
  ['(3 m)^2', '9 m²'],
  ['10 m / 2', '5 m'],
  ['10 km / 2 km', '5'],
  ['10 m / 50 cm', '20'],
]);

table('units: special conversions', [
  ['20 °C in °F', '68°F'],
  ['98.6 F in C', '37°C'],
  ['0 K in C', '-273.15°C'],
  ['100 celsius in fahrenheit', '212°F'],
  ['20 C + 5 C', '25°C'],
  ['20 °C + 10 K', '30°C'],
  ['30 mpg in L/100km', '7.8405 L/100km'],
  ['8 L/100km in mpg', '29.4018 mpg'],
  ['3000 rpm in Hz', '50 Hz'],
  ['3000 rpm in rad/s', '314.1593 rad/s'],
  ['50 Hz in ms', '20 ms'],
  ['16 oz in mL', '473.1765 mL'],
  ['200 lb in N', '889.6443 N'],
  ['90 deg in rad', '1.5708 rad'],
  ['pi rad in degrees', '180°'],
  ['1 inch in px', '96 px'],
  ['12 pt in px', '16 px'],
  ['2 em in px', '32 px'],
  ['1 smoot in m', '1.7018 m'],
]);

table('densities', [
  ['2 cups flour in grams', '250 g'],
  ['2 cups of flour in g', '250 g'],
  ['250 g all-purpose flour in cups', '2 cups'],
  ['500 g sugar in cups', '2.5 cups'],
  ['1 stick butter in cups', '0.5 cups'],
  ['1 stick of butter in tbsp', '8 tbsp'],
  ['1 cup butter in g', '226.7962 g'],
  ['1 L of water in kg', '1 kg'],
  ['1 m^3 of concrete in kg', '2,400 kg'],
  ['1 cubic inch of gold in g', '316.5981 g'],
  ['1 gallon of gasoline in lb', '6.2173 lb'],
  ['2 cups flour', '2 cups'],
]);

table('unit errors', [
  ['5 km + 3 kg', "Error: Can't add kg to km"],
  ['5 km in kg', "Error: Can't convert km (length) to kg (mass)"],
]);

table('percentages', [
  ['20% of 50', '10'],
  ['20% of $50', '$10'],
  ['50 + 20%', '60'],
  ['$50 - 10%', '$45'],
  ['$100 + 8.25%', '$108.25'],
  ['5% on $30', '$31.50'],
  ['6% off 40', '37.6'],
  ['$50 as a % of $200', '25%'],
  ['$50 as % of $200', '25%'],
  ['50 as a percentage of 200', '25%'],
  ['$75 as a % on $50', '50%'],
  ['$40 as a % off $50', '20%'],
  ['6 is what % of 24', '25%'],
  ['5% of what is 6', '120'],
  ['5% on what is 6', '5.7143'],
  ['5% off what is 6', '6.3158'],
  ['6 is 5% of what', '120'],
  ['$50 to $75 is what %', '50%'],
  ['50% * 20%', '10%'],
  ['20% * 50', '10'],
  ['10%', '10%'],
  ['10 percent of 300', '30'],
  ['1 + 2%', '1.02'],
  ['50 bp in %', '0.5%'],
]);

table('money', [
  ['$5k', '$5,000'],
  ['$1.2B', '$1,200,000,000'],
  ['$2.5m', '$2,500,000'],
  ['$20/hr * 40 hr', '$800'],
  ['$15 an hour * 8 hours', '$120'],
  ['$15 per hour * 40 hours * 52', '$31,200'],
  ['$60,000 / 12 months', '$5,000/mo'],
  ['$60,000 per year in $/month', '$5,000/mo'],
  ['1 kWh * $0.15/kWh', '$0.15'],
  ['$4.50/gal * 12 gal', '$54'],
  ['$1 / 3', '$0.33'],
  ['$0.004', '$0.004'],
  ['-$5 + $2', '-$3'],
  ['$5 USD', '$5'],
  ['USD 50', '$50'],
  ['50 USD', '$50'],
  ['50 bucks', '$50'],
  ['1 BTC in USD', '$110,000'],
  ['$100 in EUR', '€86'],
  ['€50 + $20', '€67.20'],
  ['100 dollars in yen', '¥15,000'],
  ['¥1500 in USD', '$10'],
  ['£20 in USD', '$26.67'],
  ['20 CHF in USD', '$25'],
  ['$100 in CHF', '80 CHF'],
  ['100 sats in USD', '$0.11'],
]);

table('prose tolerance', [
  ['Rent: $1,450', '$1,450'],
  ['I spent $5 on coffee and $3 on tea', '$8'],
  ['what is 5 + 3', '8'],
  ['5 apples + 3 apples', '8'],
  ['$50 in Paris', '$50'],
  ['Trip to Paris $500', '$500'],
  ['Groceries $120 // weekly', '$120'],
  ['"quoted text" 5 + 5', '10'],
  ['I won $50', '$50'],
  ['$5 on coffee', '$5'],
  ['3 tickets at $25', '$75'],
  ['$1200 for the new laptop', '$1,200'],
  ['Total time 5 h + 3 h', '8 hours'],
  ['5 km in total', '5 km'],
  ['12 oz of coffee in mL', '354.8824 mL'],
  ['5 and', '5'],
  ['just some words', ''],
  ['The 2nd item costs $5', '$5'],
  ['the tram pass, which should wrap €45', '€45'],
]);

table('functions', [
  ['sin(30 deg)', '0.5'],
  ['sin 30°', '0.5'],
  ['cos(pi)', '-1'],
  ['sin(pi)', '0'],
  ['tan(45°)', '1'],
  ['asin(0.5) in deg', '30°'],
  ['asin(1)', '1.5708 rad'],
  ['log 1000', '3'],
  ['log(8, 2)', '3'],
  ['log2(1024)', '10'],
  ['ln e', '1'],
  ['exp(0)', '1'],
  ['round(3.14159, 2)', '3.14'],
  ['round(2.5)', '3'],
  ['floor(2.7)', '2'],
  ['ceil(2.1)', '3'],
  ['abs(-5 km)', '5 km'],
  ['max(3 km, 2000 m)', '3 km'],
  ['min(5, 2, 8)', '2'],
  ['gcd(12, 18)', '6'],
  ['lcm(4, 6)', '12'],
  ['factorial(5)', '120'],
  ['fact 10', '3,628,800'],
  ['10 choose 3', '120'],
  ['ncr(52, 5)', '2,598,960'],
  ['hypot(3, 4)', '5'],
  ['sum(1, 2, 3)', '6'],
  ['avg(2, 4)', '3'],
  ['root(27, 3)', '3'],
  ['min(30 s, 1 min)', '30 seconds'],
]);

table('dates and times', [
  ['today', 'Thu, Oct 15, 2026'],
  ['tomorrow', 'Fri, Oct 16, 2026'],
  ['yesterday', 'Wed, Oct 14, 2026'],
  ['now', 'Thu, Oct 15, 2026 at 11:30 AM'],
  ['today + 3 weeks', 'Thu, Nov 5, 2026'],
  ['today + 1 month', 'Sun, Nov 15, 2026'],
  ['today - 1 year', 'Wed, Oct 15, 2025'],
  ['Dec 25 - today', '71 days'],
  ['days until Dec 25', '71 days'],
  ['weeks until Dec 25', '10.1429 weeks'],
  ['days until christmas', '71 days'],
  ['days since Jan 1', '287 days'],
  ['2026-12-25 - 2026-01-01', '358 days'],
  ['next friday', 'Fri, Oct 16, 2026'],
  ['last friday', 'Fri, Oct 9, 2026'],
  ['tomorrow at 3pm', 'Fri, Oct 16, 2026 at 3:00 PM'],
  ['Dec 25 at noon', 'Fri, Dec 25, 2026 at 12:00 PM'],
  ['March 3rd, 2027', 'Wed, Mar 3, 2027'],
  ['25 Dec 2026', 'Fri, Dec 25, 2026'],
  ['3 days ago', 'Mon, Oct 12, 2026'],
  ['2 hours ago', 'Thu, Oct 15, 2026 at 9:30 AM'],
  ['3 days from now', 'Sun, Oct 18, 2026'],
  ['2 weeks after Dec 1', 'Tue, Dec 15, 2026'],
  ['time in Tokyo', '3:30 AM JST, tomorrow'],
  ['now in UTC', 'Thu, Oct 15, 2026 at 6:30 PM UTC'],
  ['3pm EST in PST', '12:00 PM PDT'],
  ['3pm in London', '11:00 PM BST'],
  ['9am London time in New York', '4:00 AM EDT'],
  ['15:00 UTC in Tokyo', '12:00 AM JST, tomorrow'],
  ['noon PST in IST', '12:30 AM IST, tomorrow'],
  ['fromunix(1700000000)', 'Tue, Nov 14, 2023 at 2:13:20 PM'],
  ['now in unix', '1792089000'],
  ['Jan 31 + 1 month', 'Sat, Feb 28, 2026'],
  ['5pm - 9am', '8 h'],
  ['5:30pm - 9:15am', '8 h 15 min'],
]);

describe('document', () => {
  const doc = (src: string) => evaluateDocument(src, { now }).map((r) => (r.kind === 'value' ? r.text : r.kind === 'error' ? 'Error: ' + r.error : ''));

  it('variables', () => {
    expect(doc('x = 5\ny = x * 2\ny + 1')).toEqual(['5', '10', '11']);
  });
  it('multi-word variables', () => {
    expect(doc('tax rate = 8.25%\nprice = $40\nprice + tax rate')).toEqual(['8.25%', '$40', '$43.30']);
  });
  it('variables with units', () => {
    expect(doc('speed = 60 mph\ntime = 2.5 h\nspeed * time in km')).toEqual(['60 mph', '2.5 hours', '241.4016 km']);
  });
  it('variables shadow units', () => {
    expect(doc('m = 3\n2m')).toEqual(['3', '6']);
  });
  it('case-insensitive variable lookup', () => {
    expect(doc('Total Cost = $50\ntotal cost * 2')).toEqual(['$50', '$100']);
  });
  it('sum and average', () => {
    expect(doc('$10\n$20\n$30\nsum\naverage')).toEqual(['$10', '$20', '$30', '$60', '$20']);
  });
  it('sum resets at blank lines and headers', () => {
    expect(doc('5\n5\n\n1\n2\ntotal\n# Header\n7\nsum')).toEqual(['5', '5', '', '1', '2', '3', '', '7', '7']);
  });
  it('sum converts units', () => {
    expect(doc('1 km\n500 m\nsum')).toEqual(['1 km', '500 m', '1.5 km']);
  });
  it('sum with labels and prose', () => {
    expect(doc('Rent: $1,500\nFood: $400\nTotal: sum')).toEqual(['$1,500', '$400', '$1,900']);
  });
  it('prev', () => {
    expect(doc('10 km\nprev in miles\nans * 2')).toEqual(['10 km', '6.2137 mi', '12.4274 mi']);
  });
  it('headers and comments', () => {
    expect(doc('# Budget\n// just a note\n5 + 5 // inline')).toEqual(['', '', '10']);
  });
  it('labels with digits', () => {
    expect(doc('Day 1: 5 km\nDay 2: 7 km\ntotal')).toEqual(['5 km', '7 km', '12 km']);
  });
  it('time labels are not labels', () => {
    expect(doc('3:30pm + 1 hour')).toEqual(['4:30 PM']);
  });
  it('error then recovery', () => {
    expect(doc('5 km + 3 kg\n5 km + 3 m')).toEqual(["Error: Can't add kg to km", '5.003 km']);
  });
});

describe('highlighting', () => {
  it('classifies tokens', () => {
    const r = evaluateDocument('Rent: $1,450 in EUR // monthly', { now })[0];
    const by = Object.fromEntries(r.spans.map((s) => ['Rent: $1,450 in EUR // monthly'.slice(s.from, s.to), s.cls]));
    expect(by['Rent:']).toBe('label');
    expect(by['$']).toBe('currency');
    expect(by['1,450']).toBe('number');
    expect(by['in']).toBe('keyword');
    expect(by['EUR']).toBe('currency');
    expect(by['// monthly']).toBe('comment');
  });
});
