import {
  appRepeatToNeutral,
  neutralToAppRepeat,
  neutralToRRule,
  parseRRule,
  countToEndDate,
  type AppRepeat,
} from '../src/lib/calendar/recurrence';
import { fingerprint } from '../src/lib/calendar/fingerprint';
import { reminderToMinutes, minutesToReminder } from '../src/lib/calendar/reminders';
import type { NeutralEvent } from '../src/lib/calendar/types';

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    console.log(`ok   ${name}`);
  } else {
    failures++;
    console.error(`FAIL ${name}`, detail ?? '');
  }
}

const cases: { name: string; repeat: AppRepeat; rrule: string; back: string }[] = [
  {
    name: 'daily',
    repeat: { repeatMode: 'daily', repeatStartDate: '2026-07-08' },
    rrule: 'FREQ=DAILY',
    back: 'daily',
  },
  {
    name: 'daily with end',
    repeat: { repeatMode: 'daily', repeatStartDate: '2026-07-08', repeatEndDate: '2026-08-01' },
    rrule: 'FREQ=DAILY;UNTIL=20260801T235959Z',
    back: 'daily',
  },
  {
    name: 'weekdays',
    repeat: { repeatMode: 'weekdays', repeatStartDate: '2026-07-08' },
    rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;WKST=SU',
    back: 'weekdays',
  },
  {
    name: 'weekend',
    repeat: { repeatMode: 'weekend', repeatStartDate: '2026-07-11' },
    rrule: 'FREQ=WEEKLY;BYDAY=SU,SA;WKST=SU',
    back: 'weekend',
  },
  {
    name: 'weekly single day',
    repeat: { repeatMode: 'weekly', dayOfWeek: 2, repeatStartDate: '2026-07-07' },
    rrule: 'FREQ=WEEKLY;BYDAY=TU;WKST=SU',
    back: 'weekly',
  },
  {
    name: 'monthly dom 15',
    repeat: { repeatMode: 'monthly', repeatDayOfMonth: 15, repeatStartDate: '2026-07-15' },
    rrule: 'FREQ=MONTHLY;BYMONTHDAY=15',
    back: 'monthly',
  },
  {
    name: 'custom every 2 weeks Mon+Thu',
    repeat: {
      repeatMode: 'custom',
      repeatRule: { freq: 'weekly', interval: 2, byWeekday: [1, 4] },
      repeatStartDate: '2026-07-06',
    },
    rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;WKST=SU',
    back: 'custom',
  },
  {
    name: 'custom every 3 days',
    repeat: {
      repeatMode: 'custom',
      repeatRule: { freq: 'daily', interval: 3 },
      repeatStartDate: '2026-07-08',
    },
    rrule: 'FREQ=DAILY;INTERVAL=3',
    back: 'custom',
  },
  {
    name: 'custom monthly 1st+15th every 2 months',
    repeat: {
      repeatMode: 'custom',
      repeatRule: { freq: 'monthly', interval: 2, byMonthday: [1, 15] },
      repeatStartDate: '2026-07-01',
    },
    rrule: 'FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=1,15',
    back: 'custom',
  },
];

for (const c of cases) {
  const neutral = appRepeatToNeutral(c.repeat);
  check(`${c.name}: toNeutral`, neutral !== null);
  if (!neutral) continue;

  const rrule = neutralToRRule(neutral, { allDay: false });
  check(`${c.name}: rrule`, rrule === c.rrule, { got: rrule, want: c.rrule });

  const parsed = parseRRule(rrule);
  check(`${c.name}: parse supported`, parsed.supported, parsed);
  if (!parsed.supported) continue;

  const app = neutralToAppRepeat(parsed.recurrence, c.repeat.repeatStartDate);
  check(`${c.name}: round-trip kind`, app?.kind === c.back, {
    got: app?.kind,
    want: c.back,
  });
  check(
    `${c.name}: round-trip end date`,
    (app?.repeatEndDate ?? undefined) === (c.repeat.repeatEndDate ?? undefined),
    { got: app?.repeatEndDate, want: c.repeat.repeatEndDate },
  );
}

// Inbound-only shapes
const seven = parseRRule('FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH,FR,SA');
check(
  'weekly all 7 days -> daily',
  seven.supported && neutralToAppRepeat(seven.recurrence, '2026-07-08')?.kind === 'daily',
);

const unsupported = [
  'FREQ=YEARLY',
  'FREQ=MONTHLY;BYDAY=2TU',
  'FREQ=WEEKLY;BYSETPOS=1;BYDAY=MO',
  'FREQ=DAILY;INTERVAL=500',
  'FREQ=HOURLY',
];
for (const r of unsupported) {
  const p = parseRRule(r);
  check(`unsupported: ${r}`, !p.supported, p);
}

const counted = parseRRule('FREQ=DAILY;COUNT=5');
check('COUNT parses', counted.supported && counted.count === 5);
if (counted.supported) {
  const end = countToEndDate(counted.recurrence, '2026-07-08', counted.count!);
  check('COUNT=5 daily end date', end === '2026-07-12', end);
}
const countedWeekly = parseRRule('FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4');
if (countedWeekly.supported) {
  const end = countToEndDate(countedWeekly.recurrence, '2026-07-06', countedWeekly.count!);
  check('COUNT=4 weekly Mon/Wed end', end === '2026-07-15', end);
}

// UNTIL parse both forms
for (const u of ['FREQ=DAILY;UNTIL=20260801T235959Z', 'FREQ=DAILY;UNTIL=20260801']) {
  const p = parseRRule(u);
  check(`UNTIL parse ${u}`, p.supported && p.recurrence.until === '2026-08-01', p);
}

// Fingerprint stability: field order and array order must not matter
const evA: NeutralEvent = {
  title: 'Gym',
  allDay: false,
  startDate: '2026-07-08',
  startTime: '10:30',
  endTime: '11:30',
  timezone: 'Asia/Jerusalem',
  recurrence: { freq: 'weekly', interval: 1, byWeekday: [4, 1] },
  exdates: ['2026-07-20', '2026-07-13'],
  reminderMinutes: 30,
};
const evB: NeutralEvent = {
  ...evA,
  recurrence: { freq: 'weekly', interval: 1, byWeekday: [1, 4] },
  exdates: ['2026-07-13', '2026-07-20'],
};
check('fingerprint order-insensitive', fingerprint(evA) === fingerprint(evB));
check(
  'fingerprint sensitive to title',
  fingerprint(evA) !== fingerprint({ ...evA, title: 'Gym 2' }),
);

// Reminder mapping
check('at_time -> 0', reminderToMinutes('at_time') === 0);
check('1h -> 60', reminderToMinutes('1h') === 60);
check('0 -> at_time', minutesToReminder(0) === 'at_time');
check('7 -> 5m (round down)', minutesToReminder(7) === '5m');
check('45 -> 30m', minutesToReminder(45) === '30m');
check('120 -> 1h (cap)', minutesToReminder(120) === '1h');
check('undefined -> undefined', minutesToReminder(undefined) === undefined);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll recurrence/fingerprint/reminder checks passed');
