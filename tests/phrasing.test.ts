import { calc, evaluateDocument } from '../src/engine';

// Regressions from adversarial testing: spellings, natural phrasing, and lines
// that used to produce confidently wrong answers.
const now = Date.UTC(2026, 9, 15, 18, 30);
const c = (s: string) => calc(s, { now });

function table(name: string, rows: [string, string][]) {
  describe(name, () => {
    for (const [input, expected] of rows) {
      it(input, () => expect(c(input)).toBe(expected));
    }
  });
}

table('unit spellings', [
  ['5 kilos in lb', '11.0231 lb'],
  ['2.2 lbs in kgs', '0.9979 kg'],
  ['10 kms in miles', '6.2137 mi'],
  ['170 cms in feet', '5.5774 ft'],
  ['500 msec in s', '0.5 seconds'],
  ['5 secs in millis', '5,000 ms'],
  ['2 ltr in gal', '0.5283 gal'],
  ['100 MHZ in kHz', '100,000 kHz'],
  ['500 ma in A', '0.5 A'],
  ['8 gib in gb', '8.5899 GB'],
  ['300 °K in °C', '26.85°C'],
  ['2 tbsps in mL', '29.5735 mL'],
  ['1 kw in w', '1,000 W'],
  ['100 Nm in lb ft', '73.7562 ft·lb'],
  ['1 ft-lb in J', '1.3558 J'],
  ['1 newton-meter in J', '1 J'],
  ['3 gpm in L/min', '11.3562 L/min'],
  ['1 cfm in L/s', '0.4719 L/s'],
  ['1 MBps in Mbps', '8 Mbps'],
  ['1 Kbit in bits', '1,000 bits'],
  ['1 shot in mL', '44.3603 mL'],
  ['1 pinch in tsp', '0.0625 tsp'],
  ['20° C in F', '68°F'],
  ['20 ° C in F', '68°F'],
  ['20 c in f', '68°F'],
  ['6ft2in in cm', '187.96 cm'],
  ['1h30m in min', '90 minutes'],
  ['2h15m30s in seconds', '8,130 seconds'],
  ['1h 30m in minutes', '90 minutes'],
  ['5 foot 3 in cm', '160.02 cm'],
  ['2 in² in cm²', '12.9032 cm²'],
  ['2 in³ in cm³', '32.7741 cm³'],
  ['3 × 10^8 m/s in km/s', '300,000 km/s'],
  ['10⁻³ m in mm', '1 mm'],
  ['3661 seconds in h m s', '1 hour 1 minute 1 second'],
]);

table('unknown words never become units', [
  ['5 blargs in kg', 'Error: Unknown unit “blargs”'],
  ['100 farenheit in celsius', 'Error: Unknown unit “farenheit”. Did you mean fahrenheit?'],
  ['5 kilomters in miles', 'Error: Unknown unit “kilomters”. Did you mean kilometers?'],
  ['5 km in furlongz', 'Error: Unknown unit “furlongz”. Did you mean furlong?'],
  ['5 people in the room', '5'],
  ['Buy 3 apples in the store at $2 each', '$6'],
  ['5 apples + 3 apples', '8'],
]);

table('arrows and symbols', [
  ['5 km -> m', '5,000 m'],
  ['5 km → m', '5,000 m'],
  ['5 km => miles', '3.1069 mi'],
  ['√2', '1.4142'],
  ['√16 + 1', '5'],
  ['∛27', '3'],
  ['~5', '-6'],
  ['(3 + 4)2', '14'],
  ['1 000 000 * 2', '2,000,000'],
  ['My phone number is 555-1234', ''],
  ['Page 5 of 10', ''],
  ['3rd floor', ''],
]);

table('natural phrasing', [
  ['how many feet in a mile', '5,280 ft'],
  ['how many cm in an inch', '2.54 cm'],
  ['how many seconds in a day', '86,400 seconds'],
  ['5 km is how many miles', '3.1069 mi'],
  ['average of 2 and 4', '3'],
  ['sum of 5 and 10', '15'],
  ['total of $5 and $10', '$15'],
  ['max of 3 and 7', '7'],
  ['min of 3, 7, 1', '1'],
  ['average of 2, 4, 6', '4'],
  ['product of 3 and 4', '12'],
  ['difference between 10 and 4', '6'],
  ['median(1, 2, 3, 4)', '2.5'],
  ['two thousand twenty six', '2,026'],
  ['one point five million', '1,500,000'],
  ['a hundred and five', '105'],
  ['5 factorial', '120'],
  ['log base 2 of 8', '3'],
  ['root 16', '4'],
  ['round up 12.1', '13'],
  ['round down 12.9', '12'],
  ['round 1234.5678 to 2 dp', '1,234.57'],
  ['1234.5678 rounded', '1,235'],
  ['12.5 to nearest integer', '13'],
  ['round(-2.5)', '-3'],
  ['hex(255)', '0xFF'],
  ['int(3.7)', '3'],
]);

table('percent phrasing', [
  ['15% off of 200', '170'],
  ['15% discount on $200', '$170'],
  ['20% more than 50', '60'],
  ['20% less than 50', '40'],
  ['5 more than 3', '8'],
  ['5 less than 8', '3'],
  ['50 increased by 20%', '60'],
  ['50 decreased by 20%', '40'],
  ['50 out of 200 as percent', '25%'],
  ['3 out of 4', '0.75'],
  ['what % of 200 is 50', '25%'],
  ['what percent of 200 is 50', '25%'],
  ['percent change from 50 to 75', '50%'],
  ['percentage decrease from 100 to 80', '20%'],
  ['75 is what % more than 50', '50%'],
  ['50 is what % less than 75', '33.3333%'],
  ['10% of 10%', '1%'],
  ['25% as fraction', '1/4'],
]);

table('money', [
  ['$100 / $50', '2'],
  ['$50 / €50', '0.86'],
  ['50 cents in dollars', '$0.50'],
  ['5 dollars + 25 cents', '$5.25'],
  ['$10 and 50 cents', '$10.50'],
  ['$25 per hour * 40 hours per week * 52 weeks per year', '$52,000/yr'],
  ['$15/h * 37.5 h/wk', '$562.50/wk'],
  ['$50 per hour in per day', '$1,200/d'],
  ['100 pounds in dollars', '$133.33'],
  ['2 nights in Tokyo at $150', '$300'],
  ['5 hours @ $20', '$100'],
  ['I paid $40 for 2 shirts', '$40'],
  ['$1 in sats', '909 sats'],
]);

table('derived units', [
  ['12 V / 4 Ω', '3 A'],
  ['4.7 kΩ * 2 mA', '9.4 V'],
  ['5 W / 5 V', '1 A'],
  ['5 Ah * 12 V', '60 Wh'],
  ['1 / 60 Hz', '16.6667 ms'],
  ['5 km / 25 min', '12 km/h'],
  ['1 mi / 8 min', '7.5 mph'],
  ['300 mi / 10 gal', '30 mpg'],
  ['$1 / 1 kWh', '$1/kWh'],
  ['40 hours per week * 52 weeks', '2,080 hours'],
  ['4 L per 100 km', '4 L/100km'],
  ['1 lb per sq in in kPa', '6.8948 kPa'],
  ['30°C - 20°C in K', '10 K'],
  ['70°F - 50°F in °C', '11.1111°C'],
  ['-459.67 F in K', '0 K'],
  ['pi/2 in degrees', '90°'],
  ['0.1 + 0.2 - 0.3', '0'],
]);

table('dates', [
  ['days between Jan 1 and Dec 31', '364 days'],
  ['weeks between Jan 1 and Mar 1', '8.4286 weeks'],
  ['Jan 1 to Mar 1', '59 days'],
  ['days from Jan 1 to Mar 1', '59 days'],
  ['9am to 5pm', '8 h'],
  ['8:15 am to 4:45 pm in hours', '8.5 hours'],
  ['between 9am and 5:30pm', '8 h 30 min'],
  ['3:45pm + 1h 20m', '5:05 PM'],
  ['hours until midnight', '12.5 hours'],
  ['days until thanksgiving', '42 days'],
  ['days until easter', '164 days'],
  ['days until my birthday', ''],
  ['5 business days from today', 'Thu, Oct 22, 2026'],
  ['10 workdays from Oct 15', 'Thu, Oct 29, 2026'],
  ['in 3 days', 'Sun, Oct 18, 2026'],
  ['1/1/2027', 'Fri, Jan 1, 2027'],
  ['12/25/2026', 'Fri, Dec 25, 2026'],
  ['Feb 29, 2027', 'Error: February 2027 only has 28 days'],
  ['day of year', '288'],
  ['week of year', '42'],
  ['2:30 in minutes', '150 minutes'],
  ['1700000000 in date', 'Tue, Nov 14, 2023 at 2:13:20 PM'],
  ['1700000000 unix', 'Tue, Nov 14, 2023 at 2:13:20 PM'],
  ['fromunix(1700000000000)', 'Tue, Nov 14, 2023 at 2:13:20 PM'],
  ['now in ISO 8601', '2026-10-15T11:30:00-07:00'],
]);

table('time zones', [
  ['time in UK', '7:30 PM BST'],
  ['what time is it in Tokyo', '3:30 AM JST, tomorrow'],
  ['3pm Tokyo time in LA', '11:00 PM PDT'],
  ['3pm Pacific in Eastern', '6:00 PM EDT'],
  ['3pm Pacific time in Eastern time', '6:00 PM EDT'],
  ['time in Texas', '1:30 PM CDT'],
  ['time in Brazil', '3:30 PM BRT'],
  ['now in UTC+5:30', 'Fri, Oct 16, 2026 at 12:00 AM UTC+5:30'],
  ['now in GMT', 'Thu, Oct 15, 2026 at 6:30 PM GMT'],
]);

table('number formatting', [
  ['123456789 * 987654321', '1.2193 × 10¹⁷'],
  ['0.00001234', '0.00001234'],
  ['1 erg in J', '1 × 10⁻⁷ J'],
  ['255.5 in hex', '0xFF.8'],
  ['1/3 to 20 dp', '0.333333333333333'],
]);

describe('aggregates', () => {
  const doc = (src: string) => evaluateDocument(src, { now }).map((r) => (r.kind === 'value' ? r.text : r.kind === 'error' ? 'Error: ' + r.error : ''));
  it("totals don't count themselves", () => {
    expect(doc('2 hours\n30 min\nsum\naverage').at(-1)).toBe('1.25 hours');
    expect(doc('$10\n$20\n$30\navg\nmean\ncount').at(-1)).toBe('3');
    expect(doc('Flight: $450\nHotel: $360\nFood: $150\nTotal: sum\nPer person: total / 2').at(-1)).toBe('$480');
    expect(doc('Flight: $450\nHotel: $360\nsubtotal\ntax = 10%\nsubtotal + tax').at(-1)).toBe('$891');
  });
  it('a prose line starts a new block', () => {
    expect(doc('Income\nSalary: $5,000\nBonus: $1,000\nTotal income: sum\nExpenses\nRent: $2,000\nFood: $500\nTotal expenses: sum').at(-1)).toBe('$2,500');
  });
  it('an empty block has no total', () => {
    expect(doc('Subtotal + Tax')).toEqual(['']);
  });
});
