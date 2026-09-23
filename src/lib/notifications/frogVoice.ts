/**
 * The frog's notification voice. Two registers, mixed across variants:
 * caring coach and dry, lightly dark humor. Routine nudges escalate with
 * the ignored streak: 0-1 mixes both registers, 2-3 goes dry only, 4 is
 * the driest and truthfully warns the frog goes quiet next (mute at 5).
 * Hard rules for any new copy:
 * the frog speaks as "I"; every number or claim must come from real data
 * (never invent durations or promises); name the actual task when one is
 * relevant; one register per message, never both mushed together.
 *
 * Lines are grouped into buckets and handed out by `cursors`, a per-user
 * position saved after each send. A bucket is walked end to end before any
 * line repeats, so the same sentence cannot come back two nights running.
 * Titles stay under ~40 characters and bodies under ~100 so nothing is
 * truncated on either platform.
 */

type Push = { title: string; body: string };

/** Per-user position in each bucket, persisted on notificationPrefs. */
export type CopyCursors = Record<string, number>;

/** A chosen line plus where to resume that bucket next time. */
export type VoiceLine = Push & { bucket: string; cursor: number };

type Ctx = {
  count: number;
  frog: string;
  task: string | null;
  owed: number;
  partner: string;
  minutes: number;
};

type Line = { title: (c: Ctx) => string; body: (c: Ctx) => string };

type Register = 'base' | 'dry' | 'final';

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

function registerFor(ignoredStreak: number | undefined): Register {
  const s = ignoredStreak ?? 0;
  if (s >= 4) return 'final';
  if (s >= 2) return 'dry';
  return 'base';
}

export function shortTaskText(
  text: string | null | undefined,
  max = 30,
): string | null {
  const t = text?.trim();
  if (!t) return null;
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

function shortFrogName(name: string): string {
  return shortTaskText(name, 20) ?? 'Your frog';
}

function makeCtx(partial: Partial<Ctx> = {}): Ctx {
  return {
    count: partial.count ?? 0,
    frog: partial.frog ? shortFrogName(partial.frog) : 'Your frog',
    task: partial.task ?? null,
    owed: partial.owed ?? 0,
    partner: partial.partner ?? 'Your buddy',
    minutes: partial.minutes ?? 0,
  };
}

/**
 * Take the next line in a bucket. An unseen bucket starts at a random offset
 * so two users never open on the same sentence.
 */
function rotate(
  bucket: string,
  lines: Line[],
  ctx: Ctx,
  cursors?: CopyCursors,
): VoiceLine {
  const stored = cursors?.[bucket];
  const at =
    typeof stored === 'number' && Number.isFinite(stored) && stored >= 0
      ? Math.floor(stored)
      : Math.floor(Math.random() * lines.length);
  const line = lines[at % lines.length];
  return {
    title: line.title(ctx),
    body: line.body(ctx),
    bucket,
    cursor: (at + 1) % lines.length,
  };
}

/**
 * The same rotation for copy that lives outside this module: returns which
 * option to use and where that bucket resumes.
 */
export function rotateIndex(
  bucket: string,
  length: number,
  cursors?: CopyCursors,
): { index: number; bucket: string; cursor: number } {
  const stored = cursors?.[bucket];
  const at =
    typeof stored === 'number' && Number.isFinite(stored) && stored >= 0
      ? Math.floor(stored)
      : Math.floor(Math.random() * length);
  return { index: at % length, bucket, cursor: (at + 1) % length };
}

const MORNING_BASE_ONE: Line[] = [
  {
    title: () => 'One task today',
    body: (c) =>
      c.task
        ? `Just "${c.task}". Do it and the rest of the day is ours.`
        : 'Just one. Do it and the rest of the day is ours.',
  },
  {
    title: (c) => `${c.frog} checked your list`,
    body: (c) =>
      c.task
        ? `One task: "${c.task}". Practically done already.`
        : 'One task. Practically done already.',
  },
  {
    title: () => 'A one-task day',
    body: (c) =>
      c.task
        ? `"${c.task}" is the whole thing. I'll be here when it's done.`
        : "That's the whole thing. I'll be here when it's done.",
  },
  {
    title: () => 'Short list this morning',
    body: (c) =>
      c.task
        ? `"${c.task}", then you're free. I like those odds.`
        : "One item, then you're free. I like those odds.",
  },
  {
    title: () => 'Just the one',
    body: (c) =>
      c.task
        ? `"${c.task}". Get it early and the day owes you nothing.`
        : 'Get it early and the day owes you nothing.',
  },
  {
    title: () => 'Today asks for one thing',
    body: (c) =>
      c.task
        ? `"${c.task}". That's it. That's the list.`
        : "That's it. That's the list.",
  },
  {
    title: (c) => `${c.frog} is on lookout`,
    body: (c) =>
      c.task
        ? `One task — "${c.task}". Finish it and I'll catch us something.`
        : "One task. Finish it and I'll catch us something.",
  },
  {
    title: () => 'The pond is quiet',
    body: (c) =>
      c.task
        ? `One task on the list: "${c.task}". Perfect morning for it.`
        : 'One task on the list. Perfect morning for it.',
  },
];

const MORNING_BASE_MANY: Line[] = [
  {
    title: (c) => `Today: ${c.count} tasks`,
    body: (c) =>
      c.task
        ? `Start with "${c.task}". I'll handle the cheering.`
        : "Start with the smallest. I'll handle the cheering.",
  },
  {
    title: (c) => `Morning — ${c.count} on the list`,
    body: (c) =>
      c.task
        ? `"${c.task}" looks like the easy one. I'd eat that first.`
        : "The smallest one looks edible. I'd start there.",
  },
  {
    title: (c) => `${c.count} tasks. I counted twice.`,
    body: (c) =>
      c.task
        ? `"${c.task}" is the one staring at us. Blink first.`
        : 'One of them is staring at us. Blink first.',
  },
  {
    title: () => 'Your list is up before you',
    body: (c) =>
      c.task
        ? `${c.count} waiting. "${c.task}" is closest to the water.`
        : `${c.count} waiting. Pick whichever is closest.`,
  },
  {
    title: (c) => `${c.count} today`,
    body: (c) =>
      c.task
        ? `Do "${c.task}" and ignore the rest for now. That's allowed.`
        : "Do one and ignore the rest for now. That's allowed.",
  },
  {
    title: (c) => `${c.count} things, one morning`,
    body: (c) =>
      c.task
        ? `"${c.task}" first. Momentum is a real thing, apparently.`
        : 'Smallest first. Momentum is a real thing, apparently.',
  },
  {
    title: () => 'The list is awake',
    body: (c) =>
      c.task
        ? `${c.count} on it. "${c.task}" is the one I'd hop at.`
        : `${c.count} on it. I'd hop at the shortest one.`,
  },
  {
    title: (c) => `${c.count} before tonight`,
    body: (c) =>
      c.task
        ? `"${c.task}" now, while the pond is still quiet.`
        : 'Start now, while the pond is still quiet.',
  },
  {
    title: (c) => `${c.frog} read your list`,
    body: (c) =>
      c.task
        ? `${c.count} tasks. "${c.task}" is the one worth beating.`
        : `${c.count} tasks. One of them is worth beating.`,
  },
];

const MORNING_DRY_ONE: Line[] = [
  {
    title: () => 'One task today',
    body: (c) =>
      c.task
        ? `"${c.task}". That's the whole list. I'll wait.`
        : "That's the whole list. I'll wait.",
  },
  {
    title: () => 'Morning. One task.',
    body: (c) =>
      c.task ? `"${c.task}". I've said my piece.` : "I've said my piece.",
  },
  {
    title: () => 'Still just the one',
    body: (c) =>
      c.task
        ? `"${c.task}" has been there a while. No notes.`
        : 'It has been there a while. No notes.',
  },
  {
    title: () => 'One item',
    body: (c) =>
      c.task
        ? `"${c.task}". I'm told this is achievable.`
        : "I'm told this is achievable.",
  },
  {
    title: () => 'One. That is the number.',
    body: (c) =>
      c.task
        ? `"${c.task}". Do with that what you like.`
        : 'Do with that what you like.',
  },
  {
    title: () => 'A single task',
    body: (c) =>
      c.task
        ? `"${c.task}". I've done my part, which is this.`
        : "I've done my part, which is this.",
  },
];

const MORNING_DRY_MANY: Line[] = [
  {
    title: () => 'Me again',
    body: (c) =>
      c.task
        ? `${c.count} on the list. Start with "${c.task}" or don't.`
        : `${c.count} on the list. Start anywhere or don't.`,
  },
  {
    title: (c) => `${c.count} tasks today`,
    body: (c) =>
      c.task
        ? `"${c.task}" is up first. I've done my part, which is this.`
        : 'I counted them. The rest is on you.',
  },
  {
    title: (c) => `${c.count}. I counted.`,
    body: (c) =>
      c.task
        ? `"${c.task}" included. The rest is on you.`
        : 'The rest is on you.',
  },
  {
    title: (c) => `Morning. ${c.count} tasks.`,
    body: (c) =>
      c.task
        ? `"${c.task}" is still there. Loyal, that one.`
        : 'They are all still there. Loyal, that lot.',
  },
  {
    title: (c) => `${c.count} on the list`,
    body: (c) =>
      c.task
        ? `"${c.task}" hasn't moved. I'm just noting it.`
        : "Nothing has moved. I'm just noting it.",
  },
  {
    title: (c) => `The list stands at ${c.count}`,
    body: (c) =>
      c.task
        ? `"${c.task}" leads. No pressure, no expectations.`
        : 'No pressure, no expectations.',
  },
];

function morningCroaksBody(c: Ctx): string {
  if (c.count === 1) {
    return c.task
      ? `One task: "${c.task}". Ignore this one too and I go quiet.`
      : 'One task today. Ignore this one too and I go quiet.';
  }
  return c.task
    ? `${c.count} today, starting with "${c.task}". Ignore this and I go quiet.`
    : `${c.count} tasks today. Ignore this one too and I go quiet.`;
}

function morningLastCroakBody(c: Ctx): string {
  if (c.count === 1) {
    return c.task
      ? `"${c.task}" is still open. One more miss and I stop sending these.`
      : 'One task still open. One more miss and I stop sending these.';
  }
  return c.task
    ? `${c.count} open, "${c.task}" among them. One more miss and I stop.`
    : `${c.count} open. One more miss and I stop sending these.`;
}

const MORNING_FINAL: Line[] = [
  { title: () => 'Almost out of croaks', body: morningCroaksBody },
  { title: () => 'Last croak before quiet', body: morningLastCroakBody },
];

const EVENING_BASE_ONE: Line[] = [
  {
    title: () => 'One task from a clear list',
    body: (c) =>
      c.task
        ? `It's "${c.task}". Go get it — I'll get the flies ready.`
        : "Go get it — I'll get the flies ready.",
  },
  {
    title: () => 'One little task left',
    body: (c) =>
      c.task
        ? `"${c.task}" thinks it survived the day. Surprise it.`
        : 'It thinks it survived the day. Surprise it.',
  },
  {
    title: () => 'One thing between you and done',
    body: (c) =>
      c.task
        ? `"${c.task}". Then the evening is entirely yours.`
        : 'Then the evening is entirely yours.',
  },
  {
    title: () => 'Still one open',
    body: (c) =>
      c.task
        ? `"${c.task}" is small enough to finish before bed.`
        : "It's small enough to finish before bed.",
  },
  {
    title: () => 'Last one of the day',
    body: (c) =>
      c.task
        ? `"${c.task}". Clear it and tomorrow starts empty.`
        : 'Clear it and tomorrow starts empty.',
  },
  {
    title: () => 'One left on the pad',
    body: (c) =>
      c.task
        ? `"${c.task}". I'd rather not carry it into tomorrow.`
        : "I'd rather not carry it into tomorrow.",
  },
  {
    title: (c) => `${c.frog} is counting one`,
    body: (c) =>
      c.task
        ? `"${c.task}" is all that's left. Finish strong.`
        : "That's all that's left. Finish strong.",
  },
];

const EVENING_BASE_MANY: Line[] = [
  {
    title: (c) => `${c.count} left — still doable`,
    body: (c) =>
      c.task
        ? `One more tonight and we sleep happy. "${c.task}" is right there.`
        : 'One more tonight and we sleep happy.',
  },
  {
    title: () => 'About tonight…',
    body: (c) =>
      c.task
        ? `${c.count} tasks hoped you forgot them. Prove "${c.task}" wrong.`
        : `${c.count} tasks hoped you forgot them. Prove one wrong.`,
  },
  {
    title: (c) => `${c.count} still open`,
    body: (c) =>
      c.task
        ? `I'm not judging. I'm watching "${c.task}" not happen.`
        : "I'm not judging. I'm just watching.",
  },
  {
    title: () => 'Evening check',
    body: (c) =>
      c.task
        ? `${c.count} open. "${c.task}" is the one I'd close out.`
        : `${c.count} open. Close out the smallest one.`,
  },
  {
    title: (c) => `${c.count} to go`,
    body: (c) =>
      c.task
        ? `Tomorrow you would rather "${c.task}" was already done.`
        : 'Tomorrow you would rather one of these was already done.',
  },
  {
    title: () => 'One more and we call it',
    body: (c) =>
      c.task
        ? `${c.count} left. "${c.task}" counts as the one.`
        : `${c.count} left. Any of them counts as the one.`,
  },
  {
    title: (c) => `Still ${c.count} on the list`,
    body: (c) =>
      c.task
        ? `"${c.task}" first. Then the pond goes quiet for the night.`
        : 'Pick one. Then the pond goes quiet for the night.',
  },
  {
    title: () => 'The day is not over yet',
    body: (c) =>
      c.task
        ? `${c.count} open, and "${c.task}" takes the least effort.`
        : `${c.count} open. Take the one with the least effort.`,
  },
];

const EVENING_DRY_ONE: Line[] = [
  {
    title: () => 'One left',
    body: (c) =>
      c.task
        ? `"${c.task}". Do it and I'll say nothing more tonight.`
        : "Do it and I'll say nothing more tonight.",
  },
  {
    title: () => 'Still one open',
    body: (c) =>
      c.task
        ? `"${c.task}" made it to evening. Impressive, in its way.`
        : 'It made it to evening. Impressive, in its way.',
  },
  {
    title: () => 'One task, still standing',
    body: (c) =>
      c.task
        ? `"${c.task}". Undefeated since this morning.`
        : 'Undefeated since this morning.',
  },
  {
    title: () => 'The one survivor',
    body: (c) =>
      c.task
        ? `"${c.task}". I admire its persistence.`
        : 'I admire its persistence.',
  },
  {
    title: () => 'Evening count: one',
    body: (c) =>
      c.task
        ? `"${c.task}". Same as this morning. No change to report.`
        : 'Same as this morning. No change to report.',
  },
];

const EVENING_DRY_MANY: Line[] = [
  {
    title: (c) => `${c.count} still open`,
    body: (c) =>
      c.task
        ? `"${c.task}" among them. I'd start there. I'm a frog, though.`
        : 'The list does not do itself. I checked.',
  },
  {
    title: (c) => `Evening count: ${c.count}`,
    body: (c) =>
      c.task
        ? `"${c.task}" is still sitting there. So am I.`
        : 'Still sitting there. So am I. Lily pads are patient.',
  },
  {
    title: (c) => `${c.count} unchanged`,
    body: (c) =>
      c.task
        ? `"${c.task}" has now outlasted the whole day.`
        : 'They have now outlasted the whole day.',
  },
  {
    title: () => 'Same list, later light',
    body: (c) =>
      c.task
        ? `${c.count} open, "${c.task}" included. Just the facts.`
        : `${c.count} open. Just the facts.`,
  },
  {
    title: (c) => `${c.count} left, for the record`,
    body: (c) =>
      c.task
        ? `"${c.task}" leads the pack. I have no further comment.`
        : 'I have no further comment.',
  },
  {
    title: () => 'The tally, unasked for',
    body: (c) =>
      c.task
        ? `${c.count} open. "${c.task}" is not one of the hard ones.`
        : `${c.count} open. None of them are the hard ones.`,
  },
];

function eveningQuietBody(c: Ctx): string {
  if (c.count === 1) {
    return c.task
      ? `"${c.task}" is still open. One more ignored croak and I stop.`
      : 'One task still open. One more ignored croak and I stop.';
  }
  return c.task
    ? `${c.count} still open, "${c.task}" included. Ignore this and I go quiet.`
    : `${c.count} still open. One more ignored croak and I stop.`;
}

function eveningLastBody(c: Ctx): string {
  if (c.count === 1) {
    return c.task
      ? `"${c.task}" is open. Ignore this and I stop sending these.`
      : 'One task is open. Ignore this and I stop sending these.';
  }
  return c.task
    ? `${c.count} open, starting with "${c.task}". Then I go quiet.`
    : `${c.count} open. Ignore this and I go quiet.`;
}

const EVENING_FINAL: Line[] = [
  { title: () => 'Before I go quiet', body: eveningQuietBody },
  { title: () => 'The last one for a while', body: eveningLastBody },
];

const HUNGER: Line[] = [
  {
    title: (c) => `${c.frog} is hungry`,
    body: () =>
      "One task and dinner's served. Otherwise I take a fly from your jar tonight.",
  },
  {
    title: (c) => `${c.frog} hasn't eaten`,
    body: () =>
      'Finish anything today and I eat. Otherwise a fly goes missing from your jar.',
  },
  {
    title: () => 'My belly is empty',
    body: () =>
      'One task feeds me. Skip it and I help myself to a fly from your jar.',
  },
  {
    title: (c) => `${c.frog} is eyeing your jar`,
    body: () =>
      "One finished task and I leave it alone tonight. Otherwise I'm taking one.",
  },
  {
    title: () => 'Dinner is late',
    body: () =>
      "Tick one thing off and I'm fed. Otherwise tonight's meal comes from your jar.",
  },
  {
    title: (c) => `${c.frog} needs feeding`,
    body: () =>
      'Any task will do. Otherwise a fly comes out of the jar. Nothing personal.',
  },
];

const FAREWELL: Line[] = [
  {
    title: (c) => `${c.frog} will stop croaking`,
    body: () =>
      "These nudges aren't landing, so I'll go quiet. Open the app and I'm right back.",
  },
  {
    title: (c) => `${c.frog} is going quiet`,
    body: () =>
      "You've heard enough from me. Open the app whenever and I'll start again.",
  },
  {
    title: () => 'Signing off for now',
    body: (c) => `${c.frog} will stop sending these. Open the app and I'm back.`,
  },
];

const FLIES_ONE: Line[] = [
  {
    title: () => 'A friend earned you a fly',
    body: () => 'It expires at midnight. Claim it before it buzzes off.',
  },
  {
    title: () => 'There is a fly in the pond',
    body: () => 'A friend put it there. Gone at midnight if you leave it.',
  },
  {
    title: () => 'Someone fed the pond',
    body: () => 'One fly, yours until midnight. Then it buzzes off.',
  },
  {
    title: () => 'A friend caught you one',
    body: () => 'One fly waiting. It does not survive midnight.',
  },
];

const FLIES_MANY: Line[] = [
  {
    title: (c) => `Friends earned you ${c.owed} flies`,
    body: () => "They're gone at midnight. Claim them before they buzz off.",
  },
  {
    title: (c) => `${c.owed} flies in the pond`,
    body: () => 'Your friends put them there. Midnight takes them back.',
  },
  {
    title: (c) => `The pond is busy — ${c.owed} flies`,
    body: () => 'All yours until midnight, and not a minute after.',
  },
  {
    title: (c) => `${c.owed} flies waiting on you`,
    body: () => 'Friends earned them. Claim them before midnight.',
  },
];

const bodyOnly = (bodies: string[]): Line[] =>
  bodies.map((body) => ({ title: () => '', body: () => body }));

const REMINDER_AT_TIME = bodyOnly([
  "Starts now. I'd help, but — no thumbs.",
  "It's time. I believe in you. Mostly.",
  'Now o’clock. Hop to it.',
  'This is the moment. No notes, just go.',
  'Starting now. I will be watching from the pad.',
  'Right now. The pond has cleared its schedule.',
]);

const REMINDER_HOUR = bodyOnly([
  'One hour out. Future you already says thanks.',
  "Starts in an hour. Finish what you're doing — then it's us.",
  'An hour from now. Plenty of time to dread it properly.',
  'One hour. Consider this your gentle warning croak.',
]);

const REMINDER_MINUTES: Line[] = [
  {
    title: () => '',
    body: (c) => `${c.minutes} minutes out. Stretch, hydrate, hop.`,
  },
  {
    title: () => '',
    body: (c) => `Starts in ${c.minutes} minutes. I'm excited. And judging.`,
  },
  {
    title: () => '',
    body: (c) => `${c.minutes} minutes. Wrap up whatever this is.`,
  },
  {
    title: () => '',
    body: (c) => `${c.minutes} minutes to go. I'd start moving now.`,
  },
  {
    title: () => '',
    body: (c) => `In ${c.minutes} minutes. The pad is ready when you are.`,
  },
];

type RoutineOpts = {
  count: number;
  frog: string;
  exampleTask?: string | null;
  ignoredStreak?: number;
  cursors?: CopyCursors;
};

export function morningMessage(opts: RoutineOpts): VoiceLine {
  const ctx = makeCtx({
    count: opts.count,
    frog: opts.frog,
    task: shortTaskText(opts.exampleTask),
  });
  const register = registerFor(opts.ignoredStreak);
  if (register === 'final')
    return rotate('m_final', MORNING_FINAL, ctx, opts.cursors);
  if (register === 'dry') {
    return ctx.count === 1
      ? rotate('m_dry_one', MORNING_DRY_ONE, ctx, opts.cursors)
      : rotate('m_dry_many', MORNING_DRY_MANY, ctx, opts.cursors);
  }
  return ctx.count === 1
    ? rotate('m_base_one', MORNING_BASE_ONE, ctx, opts.cursors)
    : rotate('m_base_many', MORNING_BASE_MANY, ctx, opts.cursors);
}

export function eveningMessage(opts: RoutineOpts): VoiceLine {
  const ctx = makeCtx({
    count: opts.count,
    frog: opts.frog,
    task: shortTaskText(opts.exampleTask),
  });
  const register = registerFor(opts.ignoredStreak);
  if (register === 'final')
    return rotate('e_final', EVENING_FINAL, ctx, opts.cursors);
  if (register === 'dry') {
    return ctx.count === 1
      ? rotate('e_dry_one', EVENING_DRY_ONE, ctx, opts.cursors)
      : rotate('e_dry_many', EVENING_DRY_MANY, ctx, opts.cursors);
  }
  return ctx.count === 1
    ? rotate('e_base_one', EVENING_BASE_ONE, ctx, opts.cursors)
    : rotate('e_base_many', EVENING_BASE_MANY, ctx, opts.cursors);
}

export function hungerMessage(frog: string, cursors?: CopyCursors): VoiceLine {
  return rotate('hunger', HUNGER, makeCtx({ frog }), cursors);
}

export function farewellMessage(
  frog: string,
  cursors?: CopyCursors,
): VoiceLine {
  return rotate('farewell', FAREWELL, makeCtx({ frog }), cursors);
}

export function friendFliesMessage(
  owed: number,
  cursors?: CopyCursors,
): VoiceLine {
  const ctx = makeCtx({ owed });
  return owed === 1
    ? rotate('flies_one', FLIES_ONE, ctx, cursors)
    : rotate('flies_many', FLIES_MANY, ctx, cursors);
}

/** Body for a scheduled task's reminder; the task's own text is the title. */
export function taskReminderLine(
  reminder: string,
  cursors?: CopyCursors,
): { body: string; bucket: string; cursor: number } {
  if (reminder === 'at_time') {
    const line = rotate('rt_now', REMINDER_AT_TIME, makeCtx(), cursors);
    return { body: line.body, bucket: line.bucket, cursor: line.cursor };
  }
  if (reminder === '1h') {
    const line = rotate('rt_hour', REMINDER_HOUR, makeCtx(), cursors);
    return { body: line.body, bucket: line.bucket, cursor: line.cursor };
  }
  const minutes = Number.parseInt(reminder, 10);
  if (!Number.isFinite(minutes)) {
    return { body: 'Starts soon. Get set.', bucket: 'rt_soon', cursor: 0 };
  }
  const line = rotate(
    'rt_minutes',
    REMINDER_MINUTES,
    makeCtx({ minutes }),
    cursors,
  );
  return { body: line.body, bucket: line.bucket, cursor: line.cursor };
}

export function buddyBothFinishedMessage(
  partnerName: string,
  taskText?: string | null,
): Push {
  const task = shortTaskText(taskText);
  return {
    title: task
      ? `You both did "${task}"`
      : `You and ${partnerName} both finished`,
    body: pick([
      "Bonus flies for both of you. I'll pretend I never doubted.",
      `Bonus flies, both sides. You and ${partnerName} make it look easy.`,
      'Bonus flies all round. Two frogs fed, metaphorically.',
      `Both halves done. ${partnerName} held up their end, and so did you.`,
      'Bonus flies for the pair of you. My favourite kind of day.',
    ]),
  };
}

export function buddyPartnerFinishedMessage(
  partnerName: string,
  taskText?: string | null,
): Push {
  const task = shortTaskText(taskText);
  return {
    title: task
      ? `${partnerName} did "${task}"`
      : `${partnerName} finished your shared task`,
    body: pick([
      "Your half's still open. Your move.",
      `Don't leave ${partnerName} hanging. Your move.`,
      `${partnerName} went first. The other half is yours.`,
      'One side done, one side waiting. Guess which is which.',
      `${partnerName} is done and watching. No pressure.`,
    ]),
  };
}
