import { calc } from '../src/engine';

// DST boundaries in 2026 (local zone is America/Los_Angeles, see vitest.config.ts):
//   US:  Mar 8 02:00 → 03:00, Nov 1 02:00 → 01:00
//   UK:  Mar 29 01:00 GMT → 02:00 BST, Oct 25 02:00 BST → 01:00 GMT
//   Tokyo has no DST (UTC+9).

function table(name: string, now: number, rows: [string, string][]) {
  describe(name, () => {
    for (const [input, expected] of rows) {
      it(input, () => expect(calc(input, { now })).toBe(expected));
    }
  });
}

// Thu Oct 15 2026, 11:30 AM PDT
const OCT_15 = Date.UTC(2026, 9, 15, 18, 30);
// Sat Mar 7 2026, 12:00 PM PST (the day before spring forward)
const MAR_7 = Date.UTC(2026, 2, 7, 20, 0);
// Sat Oct 31 2026, 12:00 PM PDT (the day before fall back)
const OCT_31 = Date.UTC(2026, 9, 31, 19, 0);

table('spring forward: adding days keeps wall-clock time, hours are elapsed time', OCT_15, [
  ['Mar 7, 2026 at 10am + 1 day', 'Sun, Mar 8, 2026 at 10:00 AM'],
  ['Mar 7, 2026 at 10am + 24 hours', 'Sun, Mar 8, 2026 at 11:00 AM'],
  ['Mar 7, 2026 at 9am + 1 week', 'Sat, Mar 14, 2026 at 9:00 AM'],
  ['Mar 8, 2026 + 1 day', 'Mon, Mar 9, 2026'],
  ['Mar 8, 2026 at 12am + 24 hours', 'Mon, Mar 9, 2026 at 1:00 AM'],
  ['Mar 8, 2026 at 1:30am + 1 hour', 'Sun, Mar 8, 2026 at 3:30 AM'],
  // 2:30 AM doesn't exist; it moves forward like JavaScript's Date does
  ['Mar 8, 2026 at 2:30am', 'Sun, Mar 8, 2026 at 3:30 AM'],
  ['Mar 9, 2026 at 12am - Mar 8, 2026 at 12am', '23 h'],
  ['Mar 8, 2026 at 12am to Mar 9, 2026 at 12am in hours', '23 hours'],
  ['between Mar 8, 2026 at 12am and Mar 9, 2026 at 12am', '23 h'],
  ['Mar 7, 2026 to Mar 10, 2026', '3 days'],
  ['between Mar 1, 2026 and Mar 31, 2026', '30 days'],
]);

table('fall back: adding days keeps wall-clock time, hours are elapsed time', OCT_15, [
  ['Oct 31, 2026 at 6pm + 1 week', 'Sat, Nov 7, 2026 at 6:00 PM'],
  ['Oct 31, 2026 at 6pm + 168 hours', 'Sat, Nov 7, 2026 at 5:00 PM'],
  ['Nov 1, 2026 at 12am + 1 day', 'Mon, Nov 2, 2026 at 12:00 AM'],
  ['Nov 1, 2026 at 12am + 24 hours', 'Sun, Nov 1, 2026 at 11:00 PM'],
  // 1:30 AM happens twice; the first (PDT) is meant, and an hour later is 1:30 AM PST
  ['Nov 1, 2026 at 1:30am in UTC', 'Sun, Nov 1, 2026 at 8:30 AM UTC'],
  ['(Nov 1, 2026 at 1:30am + 1 hour) in UTC', 'Sun, Nov 1, 2026 at 9:30 AM UTC'],
  ['Nov 1, 2026 at 1:30am + 1 hour', 'Sun, Nov 1, 2026 at 1:30 AM'],
  ['Nov 1, 2026 at 12am to Nov 2, 2026 at 12am in hours', '25 hours'],
  ['Nov 1, 2026 at 12am to Nov 2, 2026 at 12am', '1 day 1 h'],
  ['Nov 2, 2026 - Oct 31, 2026', '2 days'],
]);

table('now just before spring forward', MAR_7, [
  ['now + 1 day', 'Sun, Mar 8, 2026 at 12:00 PM'],
  ['now + 24 hours', 'Sun, Mar 8, 2026 at 1:00 PM'],
  ['tomorrow at 3am', 'Sun, Mar 8, 2026 at 3:00 AM'],
  ['days until Mar 9', '2 days'],
  ['hours until Mar 8 at 3am', '14 hours'],
  ['minutes until Mar 8 at 3:30am', '870 minutes'],
  ['hours until Mar 9 at noon', '47 hours'],
  ['days between Mar 6, 2026 and Mar 9, 2026', '3 days'],
  ['time in New York', '3:00 PM EST'],
  ['time in London', '8:00 PM GMT'],
]);

table('now just before fall back', OCT_31, [
  ['now + 1 day', 'Sun, Nov 1, 2026 at 12:00 PM'],
  ['now + 24 hours', 'Sun, Nov 1, 2026 at 11:00 AM'],
  ['3 days from now', 'Tue, Nov 3, 2026'],
  ['days until Nov 2', '2 days'],
  ['hours until Nov 1 at 3am', '16 hours'],
  ['hours until tomorrow at noon', '25 hours'],
  ['tomorrow at noon - now', '1 day 1 h'],
  ['Nov 1 at 12am to Nov 1 at 3am in minutes', '240 minutes'],
  ['days since Mar 1', '244 days'],
]);

table('until / since spans that cross a DST change', OCT_15, [
  ['days until Nov 3', '19 days'],
  ['hours until Nov 2 at noon', '433.5 hours'],
  ['days since Mar 1', '228 days'],
  ['days between Oct 15 and Nov 15', '31 days'],
]);

table('London ↔ New York while their DST dates differ', OCT_15, [
  // usual 5 hour gap
  ['Mar 5, 2026 at 9am London time in New York', 'Thu, Mar 5, 2026 at 4:00 AM EST'],
  // Mar 8–29: New York has moved, London hasn't → 4 hours
  ['Mar 10, 2026 at 9am London time in New York', 'Tue, Mar 10, 2026 at 5:00 AM EDT'],
  ['Mar 29, 2026 at 12:30am London time in New York', 'Sat, Mar 28, 2026 at 8:30 PM EDT'],
  ['Mar 30, 2026 at 9am London time in New York', 'Mon, Mar 30, 2026 at 4:00 AM EDT'],
  ['Oct 24, 2026 at 9am London time in New York', 'Sat, Oct 24, 2026 at 4:00 AM EDT'],
  // Oct 25 – Nov 1: London has moved back, New York hasn't → 4 hours
  ['Oct 26, 2026 at 9am London time in New York', 'Mon, Oct 26, 2026 at 5:00 AM EDT'],
  ['Nov 2, 2026 at 9am London time in New York', 'Mon, Nov 2, 2026 at 4:00 AM EST'],
  ['Mar 8, 2026 at 1am New York time in London', 'Sun, Mar 8, 2026 at 6:00 AM GMT'],
  ['Mar 8, 2026 at 3am New York time in London', 'Sun, Mar 8, 2026 at 7:00 AM GMT'],
  ['Mar 8, 2026 at 12am New York time to Mar 8, 2026 at 12am London time', '5 h'],
]);

table('Tokyo (no DST) ↔ London and New York', OCT_15, [
  ['Mar 7, 2026 at 9am Tokyo time in New York', 'Fri, Mar 6, 2026 at 7:00 PM EST'],
  ['Mar 9, 2026 at 9am Tokyo time in New York', 'Sun, Mar 8, 2026 at 8:00 PM EDT'],
  ['Mar 28, 2026 at 6pm Tokyo time in London', 'Sat, Mar 28, 2026 at 9:00 AM GMT'],
  ['Mar 30, 2026 at 6pm Tokyo time in London', 'Mon, Mar 30, 2026 at 10:00 AM BST'],
  ['Oct 24, 2026 at 6pm Tokyo time in London', 'Sat, Oct 24, 2026 at 10:00 AM BST'],
  ['Oct 26, 2026 at 6pm Tokyo time in London', 'Mon, Oct 26, 2026 at 9:00 AM GMT'],
  ['Mar 28, 2026 at 3am London time in Tokyo', 'Sat, Mar 28, 2026 at 12:00 PM JST'],
  ['Mar 29, 2026 at 3am London time in Tokyo', 'Sun, Mar 29, 2026 at 11:00 AM JST'],
  ['Oct 31, 2026 at 8pm New York time in Tokyo', 'Sun, Nov 1, 2026 at 9:00 AM JST'],
  ['Nov 2, 2026 at 8pm New York time in Tokyo', 'Tue, Nov 3, 2026 at 10:00 AM JST'],
]);

table('date arithmetic in other zones', OCT_15, [
  ['Mar 28, 2026 at 12pm London time + 1 day', 'Sun, Mar 29, 2026 at 12:00 PM BST'],
  ['Mar 28, 2026 at 12pm London time + 24 hours', 'Sun, Mar 29, 2026 at 1:00 PM BST'],
  ['Mar 28, 2026 at 12pm London time + 1 day in New York', 'Sun, Mar 29, 2026 at 7:00 AM EDT'],
  ['Oct 24, 2026 at 12pm London time + 1 day', 'Sun, Oct 25, 2026 at 12:00 PM GMT'],
  ['Oct 24, 2026 at 12pm London time + 24 hours', 'Sun, Oct 25, 2026 at 11:00 AM GMT'],
  ['Mar 29, 2026 at 12am London time to Mar 30, 2026 at 12am London time', '23 h'],
  ['Oct 25, 2026 at 12am London time to Oct 26, 2026 at 12am London time in hours', '25 hours'],
  ['Mar 7, 2026 at 12pm New York time + 1 day', 'Sun, Mar 8, 2026 at 12:00 PM EDT'],
  ['Mar 7, 2026 at 12pm New York time + 24 hours', 'Sun, Mar 8, 2026 at 1:00 PM EDT'],
  ['Nov 1, 2026 at 1:30am New York time in UTC', 'Sun, Nov 1, 2026 at 5:30 AM UTC'],
  ['Nov 1, 2026 at 1:30am New York time + 1 hour', 'Sun, Nov 1, 2026 at 1:30 AM EST'],
  // 1:30 AM doesn't exist in London on Mar 29; it moves forward to 2:30 BST
  ['Mar 29, 2026 at 1:30am London time in UTC', 'Sun, Mar 29, 2026 at 1:30 AM UTC'],
]);

// Named zones resolve skipped and repeated wall-clock times the same way as the
// local zone: like JavaScript's Date and Temporal, a skipped time moves forward
// and a repeated time picks the first occurrence (see zonedToMs() in datetime.ts).
describe('skipped and repeated times in named zones resolve like local time', () => {
  // the gap pushes 2:30 AM forward to 3:30 AM EDT, not back to 1:30 AM EST
  it('Mar 8, 2026 at 2:30am New York time moves forward to 3:30 AM EDT', () => {
    expect(calc('Mar 8, 2026 at 2:30am New York time in UTC', { now: OCT_15 })).toBe('Sun, Mar 8, 2026 at 7:30 AM UTC');
  });
  // the first 1:30 (BST), as New York and local times pick, not the second (GMT)
  it('Oct 25, 2026 at 1:30am London time is the first 1:30 (BST)', () => {
    expect(calc('Oct 25, 2026 at 1:30am London time in UTC', { now: OCT_15 })).toBe('Sun, Oct 25, 2026 at 12:30 AM UTC');
  });
});
