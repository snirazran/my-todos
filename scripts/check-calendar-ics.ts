import { buildVEVENT, parseVEVENT, expandInstances } from '../src/lib/calendar/apple/ics';
import { fingerprint } from '../src/lib/calendar/fingerprint';
import type { NeutralEvent } from '../src/lib/calendar/types';

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`ok   ${name}`);
  else {
    failures++;
    console.error(`FAIL ${name}`, detail ?? '');
  }
}

const tz = 'Asia/Jerusalem';

const cases: { name: string; event: NeutralEvent }[] = [
  {
    name: 'timed one-off with reminder',
    event: {
      title: 'Dentist, with commas; and semis',
      notes: 'Bring insurance card\nSecond line',
      allDay: false,
      startDate: '2026-07-10',
      startTime: '09:30',
      endTime: '10:15',
      timezone: tz,
      reminderMinutes: 30,
    },
  },
  {
    name: 'all-day one-off',
    event: {
      title: 'Trip day',
      allDay: true,
      startDate: '2026-07-12',
      timezone: tz,
    },
  },
  {
    name: 'weekly recurring with exdates + until',
    event: {
      title: 'Gym',
      allDay: false,
      startDate: '2026-07-06',
      startTime: '18:00',
      endTime: '19:00',
      timezone: tz,
      recurrence: { freq: 'weekly', interval: 1, byWeekday: [1, 4], until: '2026-09-30' },
      exdates: ['2026-07-13', '2026-07-20'],
      reminderMinutes: 0,
    },
  },
  {
    name: 'monthly recurring all-day',
    event: {
      title: 'Rent',
      allDay: true,
      startDate: '2026-08-01',
      timezone: tz,
      recurrence: { freq: 'monthly', interval: 1, byMonthday: [1] },
    },
  },
];

for (const c of cases) {
  const ics = buildVEVENT(c.event, 'test-uid-1@local', fingerprint(c.event));
  const parsed = parseVEVENT(ics, tz);
  check(`${c.name}: parses`, parsed.kind === 'event', parsed);
  if (parsed.kind !== 'event') continue;
  check(
    `${c.name}: fingerprint round-trips`,
    fingerprint(parsed.neutral) === fingerprint(c.event),
    { got: parsed.neutral, want: c.event },
  );
  check(`${c.name}: uid`, 'uid' in parsed && parsed.uid === 'test-uid-1@local');
}

// long line folding round trip
const longTitle = 'A'.repeat(200) + ' end';
const longEvent: NeutralEvent = {
  title: longTitle,
  allDay: true,
  startDate: '2026-07-15',
  timezone: tz,
};
const foldedIcs = buildVEVENT(longEvent, 'uid-2@local', fingerprint(longEvent));
const foldedParsed = parseVEVENT(foldedIcs, tz);
check(
  'folded long title round-trips',
  foldedParsed.kind === 'event' && foldedParsed.neutral.title === longTitle,
);

// expansion of an unsupported-for-app rule (2nd Tuesday monthly)
const secondTuesday = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Test//EN',
  'BEGIN:VEVENT',
  'UID:x@y',
  'DTSTAMP:20260701T000000Z',
  'SUMMARY:Board meeting',
  'DTSTART:20260714T100000',
  'DTEND:20260714T110000',
  'RRULE:FREQ=MONTHLY;BYDAY=2TU',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');
const stParsed = parseVEVENT(secondTuesday, tz);
check('2nd tuesday: unsupported', stParsed.kind === 'unsupported-recurrence', stParsed);
const instances = expandInstances(secondTuesday, '2026-07-01', '2026-10-31', tz);
check(
  '2nd tuesday: expands correctly',
  JSON.stringify(instances.map((i) => i.date)) ===
    JSON.stringify(['2026-07-14', '2026-08-11', '2026-09-08', '2026-10-13']),
  instances,
);

// inbound UTC-timestamped event from another client converts to user tz
const utcEvent = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Other//EN',
  'BEGIN:VEVENT',
  'UID:z@y',
  'DTSTAMP:20260701T000000Z',
  'SUMMARY:Call',
  'DTSTART:20260710T070000Z',
  'DTEND:20260710T073000Z',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');
const utcParsed = parseVEVENT(utcEvent, tz);
check(
  'UTC event converts to user tz wall time',
  utcParsed.kind === 'event' &&
    utcParsed.neutral.startDate === '2026-07-10' &&
    utcParsed.neutral.startTime === '10:00' &&
    utcParsed.neutral.endTime === '10:30',
  utcParsed,
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll ICS checks passed');
