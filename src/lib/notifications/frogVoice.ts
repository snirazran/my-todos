/**
 * The frog's notification voice: warm underneath, dry on top. The frog is
 * always on the user's side; the sass lands on the task, the list, the clock
 * or the frog itself, never on the user. Routine nudges escalate with the
 * ignored streak: 0-1 is the full voice, 2-3 goes short and deadpan, 4 is an
 * honest, guilt-free heads-up that the frog goes quiet next (mute at 5).
 * Hard rules for any new copy:
 * the frog is the sender, so the title of a reminder is his name plus a mood
 * emoji (`frogTitle`) and the body is him talking to the user by first name
 * (`addressed`); the body is the frog speaking as "I", at most two short
 * sentences, naming what is at stake and the actual task, and ending on one
 * small next step; never judge the named task as easy or
 * small; every number or claim must come from real data (never invent
 * durations or promises); no guilt, no "don't forget", no "should"; "Lily Pad"
 * and "pad" only ever mean the shield, and "hop" is never a verb.
 *
 * Lines are grouped into buckets and handed out by `cursors`, a per-user
 * position saved after each send. A bucket is walked end to end before any
 * line repeats; buckets that fire daily hold 12+ lines so a sentence stays
 * away for about two weeks, the time a repeat takes to feel fresh again.
 * Bodies stay under ~120 characters including the name, so the stake and the
 * task show before either platform truncates.
 */

type Push = { title: string; body: string };

/** Per-user position in each bucket, persisted on notificationPrefs. */
export type CopyCursors = Record<string, number>;

/** A chosen line plus where to resume that bucket next time. */
export type VoiceLine = Push & { bucket: string; cursor: number; mood?: Mood };

type Ctx = {
  count: number;
  done: number;
  frog: string;
  name: string | null;
  task: string | null;
  owed: number;
  partner: string;
  minutes: number;
  league: string;
  n: number;
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
    done: partial.done ?? 0,
    frog: partial.frog ? shortFrogName(partial.frog) : 'Your frog',
    name: partial.name ?? null,
    task: partial.task ?? null,
    owed: partial.owed ?? 0,
    partner: partial.partner ?? 'A friend',
    minutes: partial.minutes ?? 0,
    league: partial.league ?? 'Lily',
    n: partial.n ?? 0,
  };
}

const others = (c: Ctx) =>
  c.count - 1 === 1 ? 'The other one' : `The other ${c.count - 1}`;

const tasks = (n: number) => `${n} task${n === 1 ? '' : 's'}`;

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

export const PUSH_VOICE_VARIANT = 'frog_sender_v1';

export type Mood =
  | 'happy'
  | 'nervous'
  | 'hungry'
  | 'proud'
  | 'party'
  | 'relief'
  | 'flies'
  | 'strong'
  | 'finish'
  | 'sleepy';

const MOOD_EMOJI: Record<Mood, string> = {
  happy: '🐸',
  nervous: '😬',
  hungry: '🍽️',
  proud: '🏆',
  party: '🎉',
  relief: '😅',
  flies: '🪰',
  strong: '💪',
  finish: '🏁',
  sleepy: '💤',
};

export type Speaker = {
  frog: string;
  name?: string | null;
  cursors?: CopyCursors;
};

type Say = (c: Ctx) => string;

export function frogTitle(frog: string | null | undefined, mood: Mood): string {
  const shown = frog?.trim() ? shortFrogName(frog) : 'Your frog';
  return `${shown} ${MOOD_EMOJI[mood]}`;
}

export function firstName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const first = raw.trim().split(/\s+/)[0] ?? '';
  if (!first || first.includes('@') || /\d/.test(first)) return null;
  return first.length > 20 ? null : first;
}

const KEEP_CAPITAL = ['I', "I'm", "I'd", "I'll", "I've", 'Lily', 'Leap'];

function lowerFirst(text: string): string {
  const word = /^[A-Z][a-z']*/.exec(text);
  if (!word || KEEP_CAPITAL.indexOf(word[0]) !== -1) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

export function addressed(name: string | null | undefined, text: string): string {
  return name ? `${name}, ${lowerFirst(text)}` : text;
}

function speak(
  bucket: string,
  mood: Mood,
  lines: Say[],
  ctx: Ctx,
  cursors?: CopyCursors,
): VoiceLine {
  const { index, cursor } = rotateIndex(bucket, lines.length, cursors);
  return {
    title: frogTitle(ctx.frog, mood),
    body: addressed(ctx.name, lines[index](ctx)),
    bucket,
    cursor,
    mood,
  };
}

const habits = (n: number) => `${n} habit${n === 1 ? '' : 's'}`;

const withTask = (c: Ctx, task: (t: string) => string, none: string) =>
  c.task ? task(c.task) : none;

const EVENING_LAST: Say[] = [
  (c) => withTask(c, (t) => `Just "${t}" left. Finish strong, then do absolutely nothing.`, 'One task left. Finish strong, then do absolutely nothing.'),
  (c) => withTask(c, (t) => `Only "${t}" stands between us and a perfect day. I'd hate for it to win.`, "Only one task stands between us and a perfect day. I'd hate for it to win."),
  (c) => withTask(c, (t) => `${c.done} done, only "${t}" to go. I'm already proud of today.`, `${c.done} done, one to go. I'm already proud of today.`),
  (c) => withTask(c, (t) => `"${t}" is the last one. Cross it off and the list is clear.`, 'One task left. Cross it off and the list is clear.'),
  (c) => withTask(c, (t) => `${tasks(c.done)} done today. "${t}" would make it a clean sweep.`, `${tasks(c.done)} done today. One more makes it a clean sweep.`),
  (c) => withTask(c, (t) => `Last one: "${t}". Then I do a tiny victory croak.`, 'Last one. Then I do a tiny victory croak.'),
  (c) => withTask(c, (t) => `Only "${t}" is left, and it looks lonely. Help it out.`, 'Only one task is left, and it looks lonely. Help it out.'),
  (c) => withTask(c, (t) => `"${t}" and you get bragging rights. I'll tell the pond.`, "One more and you get bragging rights. I'll tell the pond."),
];

const EVENING_BASE_ONE: Say[] = [
  (c) => withTask(c, (t) => `"${t}" is today's one. Then the evening is all yours.`, 'One task today. Then the evening is all yours.'),
  (c) => withTask(c, (t) => `Still time for "${t}". One task, one tick, one happy frog.`, 'Still time for your one task. One tick, one happy frog.'),
  (c) => withTask(c, (t) => `"${t}" is still open. One tick and I'll call it a great day.`, "One task is still open. One tick and I'll call it a great day."),
  (c) => withTask(c, (t) => `One before bed? "${t}" is right there.`, 'One before bed? Your one task is right there.'),
  (c) => withTask(c, (t) => `"${t}" made it to evening. Impressive, in its way. One tick ends its run.`, 'Your one task made it to evening. Impressive, in its way. One tick ends its run.'),
  (c) => withTask(c, (t) => `Just "${t}" today. Tick it and I'll croak in your honor.`, "Just one task today. Tick it and I'll croak in your honor."),
  (c) => withTask(c, (t) => `"${t}" is waiting. I'd do it myself, but no thumbs.`, "One task is waiting. I'd do it myself, but no thumbs."),
  (c) => withTask(c, (t) => `"${t}" tonight, or tomorrow. Your call. I'll be on my rock.`, "One task tonight, or tomorrow. Your call. I'll be on my rock."),
];

const EVENING_PROGRESS: Say[] = [
  (c) => withTask(c, (t) => `${tasks(c.done)} done already. "${t}" would make it ${c.done + 1}.`, `${tasks(c.done)} done already. One more makes it ${c.done + 1}.`),
  (c) => withTask(c, (t) => `${c.done} done, ${c.count} to go. I'd grab "${t}" next.`, `${c.done} done, ${c.count} to go. One more and we call it.`),
  (c) => withTask(c, (t) => `Good day so far: ${tasks(c.done)} finished. "${t}" is right there if you want one more.`, `Good day so far: ${tasks(c.done)} finished. One more is right there if you want it.`),
  (c) => withTask(c, (t) => `Momentum spotted. ${tasks(c.done)} done, and "${t}" is next in line.`, `Momentum spotted. ${tasks(c.done)} done, and the next one is right there.`),
  (c) => withTask(c, (t) => `Progress report: ${c.done} down. "${t}" would look great next to them.`, `Progress report: ${c.done} down. One more would look great next to them.`),
  (c) => withTask(c, (t) => `${tasks(c.done)} today. I'm impressed, and I'm hard to impress. "${t}" next?`, `${tasks(c.done)} today. I'm impressed, and I'm hard to impress. One more?`),
  (c) => withTask(c, (t) => `${c.done} down already. One more, maybe "${t}", then feet up.`, `${c.done} down already. One more, then feet up.`),
  (c) => withTask(c, (t) => `On a roll: ${tasks(c.done)} done. "${t}" keeps it rolling.`, `On a roll: ${tasks(c.done)} done. One more keeps it rolling.`),
];

const EVENING_BASE_MANY: Say[] = [
  (c) => withTask(c, (t) => `One before bed? "${t}", then feet up.`, 'One before bed? Pick any, then feet up.'),
  (c) => withTask(c, (t) => `Still time for one. "${t}" would make tonight count.`, 'Still time for one. Any one makes tonight count.'),
  (c) => withTask(c, (t) => `Pick "${t}" and call it a night. The rest can wait for morning.`, 'Pick one and call it a night. The rest can wait for morning.'),
  (c) => withTask(c, (t) => `"${t}" is a good place to start. ${others(c)} can wait.`, `Pick any one to start. ${others(c)} can wait.`),
  (c) => withTask(c, (t) => `One and done tonight? "${t}" would do it.`, 'One and done tonight? Any of them would do it.'),
  (c) => withTask(c, (t) => `The list is still here, and so am I. "${t}" would be a nice start.`, 'The list is still here, and so am I. One would be a nice start.'),
  (c) => withTask(c, (t) => `"${t}" tonight, and tomorrow starts one lighter.`, 'One tonight, and tomorrow starts one lighter.'),
  (c) => withTask(c, (t) => `I'd start with "${t}". I'm a frog, not a consultant, but still.`, "I'd start with whichever is closest. I'm a frog, not a consultant, but still."),
];

const EVENING_DRY_ONE: Say[] = [
  (c) => withTask(c, (t) => `"${t}". Do it and I'll say nothing more tonight.`, "One task. Do it and I'll say nothing more tonight."),
  (c) => withTask(c, (t) => `"${t}" is the last one. That's the whole croak.`, "One task left. That's the whole croak."),
  (c) => withTask(c, (t) => `"${t}". I'll be on my rock if you need me.`, "One task. I'll be on my rock if you need me."),
  (c) => withTask(c, (t) => `"${t}". One tap ends its reign.`, 'One task left. One tap ends its reign.'),
];

const EVENING_DRY_MANY: Say[] = [
  (c) => withTask(c, (t) => `"${t}" if you've got it in you. If not, tomorrow.`, "One if you've got it in you. If not, tomorrow."),
  (c) => withTask(c, (t) => `"${t}" is on top. That's the whole report.`, `${tasks(c.count)} open. That's the whole report.`),
  (c) => withTask(c, (t) => `"${t}" first, or not. Either way, sleep well.`, 'One, or none. Either way, sleep well.'),
  (c) => withTask(c, (t) => `"${t}" is still sitting there. So am I. We're very patient.`, "The list is still sitting there. So am I. We're very patient."),
];

function eveningQuietBody(c: Ctx): string {
  if (c.count === 1) {
    return withTask(c, (t) => `"${t}" is open. If this reminder misses too, I'll give you some quiet.`, "One task is still open. If this reminder misses too, I'll give you some quiet.");
  }
  return withTask(c, (t) => `${c.count} open, "${t}" first. If this reminder misses too, I'll ease off.`, `${c.count} still open. If this reminder misses too, I'll give you some quiet.`);
}

function eveningLastBody(c: Ctx): string {
  if (c.count === 1) {
    return withTask(c, (t) => `"${t}" is open. One more miss and I'll stop sending these.`, "One task is open. One more miss and I'll stop sending these.");
  }
  return withTask(c, (t) => `${c.count} open, starting with "${t}". One more miss and I'll ease off.`, `${c.count} open. One more miss and I'll stop sending these.`);
}

function honestQuestionBody(c: Ctx): string {
  if (c.count === 1) {
    return withTask(c, (t) => `Are these helping? If not, I'll ease off. Tonight it's just "${t}".`, "Are these helping? If not, I'll ease off. Tonight it's just one task.");
  }
  return withTask(c, (t) => `Are these helping? If not, I'll ease off. ${c.count} open, "${t}" first.`, `Are these helping? If not, I'll ease off. ${c.count} tasks are open.`);
}

const EVENING_FINAL: Say[] = [eveningQuietBody, eveningLastBody, honestQuestionBody];

const HUNGER: Say[] = [
  (c) => withTask(c, (t) => `My belly's empty. "${t}" would feed me. Any finished task does, honestly.`, "My belly's empty. Any finished task feeds me. I'm not picky."),
  (c) => withTask(c, (t) => `I'm hungry. Finishing "${t}" would feed me. Just putting that out there.`, "I'm hungry. One finished task and dinner is served."),
  (c) => withTask(c, (t) => `Dinner is running late. Tick off "${t}" and I eat. I'll act surprised.`, "Dinner is running late. Tick one thing off and I eat. I'll act surprised."),
  (c) => withTask(c, (t) => `That rumble was my stomach. "${t}" would settle it.`, 'That rumble was my stomach. One finished task settles it.'),
  (c) => withTask(c, (t) => `I'm staring at you. Politely. Hungrily. "${t}" would fix this.`, "I'm staring at you. Politely. Hungrily. One finished task fixes this."),
  (c) => withTask(c, (t) => `Snack time? Finish "${t}" and I eat. That's the whole deal.`, "Snack time? Finish any task and I eat. That's the whole deal."),
  (c) => withTask(c, (t) => `The fridge is empty. By fridge I mean my belly. "${t}" would feed me.`, 'The fridge is empty. By fridge I mean my belly. One task feeds me.'),
  (c) => withTask(c, (t) => `My belly has notes. Mainly: "${t}", please.`, 'My belly has notes. Mainly: one finished task, please.'),
  (c) => withTask(c, (t) => `Tummy status: empty. "${t}" counts as dinner. I'll be dramatic about it.`, "Tummy status: empty. Any finished task counts as dinner. I'll be dramatic about it."),
  (c) => withTask(c, (t) => `Running on empty here. Finish "${t}" and I'll do the happy wiggle.`, "Running on empty here. One task and I'll do the happy wiggle."),
  (c) => withTask(c, (t) => `I skipped lunch. Frogs don't have lunch, but still. "${t}" would feed me.`, "I skipped lunch. Frogs don't have lunch, but still. One task feeds me."),
  (c) => withTask(c, (t) => `A fly just went past and I missed it. "${t}" would make up for it.`, 'A fly just went past and I missed it. One finished task would make up for it.'),
];

const FAREWELL: Say[] = [
  () => "These reminders aren't helping, so I'll stop. Open the app anytime and I'm back.",
  () => "No more reminders for now. I'll be on my rock. Open the app and I'm back.",
  () => "I'll stop sending these. No hard feelings, I'm a frog. Open the app and I'm back.",
  () => "I'll pause the reminders. Open the app whenever and they pick up again.",
];

const FLIES_ONE: Say[] = [
  () => "A friend's finished task dropped a fly in your pond. It buzzes off at midnight.",
  () => "There's a fly in your pond, courtesy of a friend. Grab it before midnight.",
  () => 'A friend earned you a fly. Flies are famously bad at waiting, so grab it before midnight.',
  () => 'One fly from a friend is waiting in your pond until midnight.',
];

const FLIES_MANY: Say[] = [
  (c) => `Your friends put ${c.owed} flies in your pond. Midnight takes them back.`,
  (c) => `${c.owed} flies are waiting in your pond. Your friends earned them, you just collect.`,
  (c) => `The pond is buzzing: ${c.owed} flies from friends, yours until midnight.`,
  (c) => `Your friends have been busy. ${c.owed} flies for you, gone at midnight.`,
];

const LEAP_HOLD: Say[] = [
  (c) => `Finish ${habits(c.n)} tonight and we stay in the ${c.league} League. I believe in us.`,
  (c) => `Finishing ${habits(c.n)} tonight gets us out of the demotion zone. I'll be cheering.`,
  (c) => `The demotion zone is eyeing us. ${habits(c.n)} tonight and we keep our ${c.league} League spot.`,
  (c) => `${habits(c.n)} tonight and the demotion zone is behind us. Our ${c.league} League spot stays ours.`,
  (c) => `Quick league rescue: ${habits(c.n)} tonight keeps us in the ${c.league} League.`,
  (c) => `We're ${habits(c.n)} away from safe in the ${c.league} League. One evening does it.`,
];

const LEAP_PROMOTION: Say[] = [
  (c) => `Finishing ${habits(c.n)} tonight opens our gift. The ${c.league} League awaits.`,
  (c) => `The ${c.league} League is close. ${habits(c.n)} tonight opens our weekly gift.`,
  (c) => `Our gift is in sight: ${habits(c.n)} tonight and it opens.`,
  (c) => `${habits(c.n)} tonight and our gift opens. I'm ready to celebrate.`,
  (c) => `One good evening from our gift. Finishing ${habits(c.n)} opens it.`,
  (c) => `I can see the ${c.league} League from here. ${habits(c.n)} tonight opens our gift.`,
];

const LEAP_UP: Say[] = [
  (c) => `We made the ${c.league} League! Your habits did that. A better gift waits here every week.`,
  (c) => `Welcome to the ${c.league} League. Your habits got us here, and the weekly gift just got better.`,
  (c) => `Promoted! We're in the ${c.league} League now, with a better gift every week. Fancy.`,
];

const LEAP_COVERED: Say[] = [
  (c) => `A Lily Pad saved our spot. We stay in the ${c.league} League. Fresh week, clean slate.`,
  (c) => `We stay in the ${c.league} League, thanks to a Lily Pad. New week starts now.`,
  (c) => `Close call. A Lily Pad kept us in the ${c.league} League. Clean slate this week.`,
];

type RoutineOpts = {
  count: number;
  done?: number;
  exampleTask?: string | null;
  ignoredStreak?: number;
};

export function eveningMessage(speaker: Speaker, opts: RoutineOpts): VoiceLine {
  const ctx = makeCtx({
    count: opts.count,
    done: opts.done,
    frog: speaker.frog,
    name: speaker.name,
    task: shortTaskText(opts.exampleTask),
  });
  const register = registerFor(opts.ignoredStreak);
  if (register === 'final') return speak('f_e_final', 'happy', EVENING_FINAL, ctx, speaker.cursors);
  if (register === 'dry') {
    return ctx.count === 1
      ? speak('f_e_dry_one', 'happy', EVENING_DRY_ONE, ctx, speaker.cursors)
      : speak('f_e_dry_many', 'happy', EVENING_DRY_MANY, ctx, speaker.cursors);
  }
  if (ctx.count === 1) {
    return ctx.done > 0
      ? speak('f_e_last', 'finish', EVENING_LAST, ctx, speaker.cursors)
      : speak('f_e_base_one', 'happy', EVENING_BASE_ONE, ctx, speaker.cursors);
  }
  return ctx.done > 0
    ? speak('f_e_progress', 'happy', EVENING_PROGRESS, ctx, speaker.cursors)
    : speak('f_e_base_many', 'happy', EVENING_BASE_MANY, ctx, speaker.cursors);
}

export function hungerMessage(speaker: Speaker, exampleTask?: string | null): VoiceLine {
  const ctx = makeCtx({ frog: speaker.frog, name: speaker.name, task: shortTaskText(exampleTask) });
  return speak('f_hunger', 'hungry', HUNGER, ctx, speaker.cursors);
}

export function leapHoldMessage(speaker: Speaker, league: string, habitsLeft: number): VoiceLine {
  const ctx = makeCtx({ frog: speaker.frog, name: speaker.name, league, n: habitsLeft });
  return speak('f_leap_hold', 'strong', LEAP_HOLD, ctx, speaker.cursors);
}

export function leapPromotionMessage(speaker: Speaker, nextLeague: string, habitsLeft: number): VoiceLine {
  const ctx = makeCtx({ frog: speaker.frog, name: speaker.name, league: nextLeague, n: habitsLeft });
  return speak('f_leap_promotion', 'proud', LEAP_PROMOTION, ctx, speaker.cursors);
}

export function leapResultMessage(speaker: Speaker, outcome: 'up' | 'covered', league: string): VoiceLine {
  const ctx = makeCtx({ frog: speaker.frog, name: speaker.name, league });
  return outcome === 'up'
    ? speak('f_leap_up', 'party', LEAP_UP, ctx, speaker.cursors)
    : speak('f_leap_covered', 'relief', LEAP_COVERED, ctx, speaker.cursors);
}

export function farewellMessage(speaker: Speaker): VoiceLine {
  const ctx = makeCtx({ frog: speaker.frog, name: speaker.name });
  return speak('f_farewell', 'sleepy', FAREWELL, ctx, speaker.cursors);
}

export function friendFliesMessage(speaker: Speaker, owed: number): VoiceLine {
  const ctx = makeCtx({ frog: speaker.frog, name: speaker.name, owed });
  return owed === 1
    ? speak('f_flies_one', 'flies', FLIES_ONE, ctx, speaker.cursors)
    : speak('f_flies_many', 'flies', FLIES_MANY, ctx, speaker.cursors);
}

const bodyOnly = (bodies: string[]): Line[] =>
  bodies.map((body) => ({ title: () => '', body: () => body }));

const REMINDER_AT_TIME = bodyOnly([
  "It's time. I'd help, but no thumbs.",
  "Now's the moment. I believe in you.",
  "Starting now. I'll cheer from a safe distance.",
  "Right now. You've got this.",
  "It's go time. Small steps count.",
  "Right on time. I'm very punctual, for a frog.",
  'Time to start. Future you is already relieved.',
  'Now. Not later-now. Now-now.',
  "It's time. Go be great, or at least present.",
  'Starts now. Starting is the hardest part, so start.',
  "Right on schedule. Let's do this thing.",
  "Go time. I'll be here when you're done.",
  "It's now. I checked the clock twice.",
  'Starting time. Deep breath, then go.',
  "Now's good. Honestly, now's great.",
  'The moment has arrived. No pressure. Some pressure.',
]);

const REMINDER_HOUR = bodyOnly([
  'Starts in an hour. Future you says thanks for the heads-up.',
  'One hour out. Time to get ready, or at least to snack.',
  "In an hour. Wrap up what you're doing, then it's this.",
  'An hour from now. Consider this a gentle croak.',
  'One hour to go. No rush yet. Rush later, gently.',
  'Coming up in an hour. Plenty of time to prepare.',
  "An hour away. Early is an option, if you're feeling heroic.",
  "Starts in an hour. I'm counting down. Frogs love a countdown.",
]);

const REMINDER_MINUTES: Line[] = [
  (m: number) => `${m} minutes out. Stretch, sip some water, go.`,
  (m: number) => `Starts in ${m} minutes. I'm excited for you.`,
  (m: number) => `${m} minutes. Start wrapping up whatever this is.`,
  (m: number) => `${m} minutes to go. Good time to get moving.`,
  (m: number) => `In ${m} minutes. Ready when you are.`,
  (m: number) => `${m} minutes away. Deep breath. You've done harder things.`,
  (m: number) => `T-minus ${m} minutes. Very official. Very exciting.`,
  (m: number) => `${m} minutes left. Finish your thought, then this.`,
  (m: number) => `Starts in ${m} minutes. Just enough time to get set up.`,
  (m: number) => `${m} minutes. Time to look busy, then be busy.`,
].map((body) => ({ title: () => '', body: (c: Ctx) => body(c.minutes) }));

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
    title: task ? `You both did "${task}"` : 'You both finished your shared task',
    body: pick([
      'Bonus flies for both of you. Teamwork works. Who knew.',
      `Bonus flies all around. ${partnerName} and you make it look easy.`,
      `Both halves done. ${partnerName} held up their end, and so did you.`,
      'Bonus flies for the pair of you. My favorite kind of day.',
      'Double finish, bonus flies. You two are a menace to to-do lists.',
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
      'Your half is still open. Your move.',
      `${partnerName} set the pace. Your half is ready when you are.`,
      `${partnerName} went first. The other half is yours.`,
      'Half the team is done. The other half is reading this.',
      `${partnerName} did their part. Your turn, whenever you're ready.`,
    ]),
  };
}

export function wishlistDealMessage(opts: {
  itemName: string;
  discountPercent: number;
  dealPrice: string;
  fullPrice: string;
}): Push {
  const { itemName, discountPercent, dealPrice, fullPrice } = opts;
  return {
    title: `${itemName} is ${discountPercent}% off today`,
    body: pick([
      `The one you're saving for. ${dealPrice} flies instead of ${fullPrice}.`,
      `Your wishlist called. It's ${dealPrice} flies today, down from ${fullPrice}.`,
      `${dealPrice} flies instead of ${fullPrice}. I'd pounce, personally.`,
      `Straight off your wishlist: ${dealPrice} flies, not ${fullPrice}.`,
    ]),
  };
}

export function wishlistInShopMessage(opts: { itemName: string }): Push {
  return {
    title: `${opts.itemName} is in the shop today`,
    body: pick([
      "The one you're saving for is in the Special collection. It's gone at the next refresh.",
      'Your wishlist called. It made the Special collection today.',
      "I spotted it on the shelf. I'd pounce, personally.",
      'Straight off your wishlist and into the shop. Just for today.',
    ]),
  };
}

type TimerPhase = 'focus' | 'break';

export type TimerPhaseEndType =
  | 'timer_complete'
  | 'break_started'
  | 'break_complete';

const FOCUS_DONE_BODIES = [
  'Nice work. Take a break, you earned it.',
  'You stayed focused longer than I ever have. Break time.',
  "That's a whole session. Stand up, wiggle a bit.",
  'Session done. Your brain deserves a snack. So do I.',
];

const BREAK_STARTED_BODIES = [
  "Your break has started. Look at something that isn't a screen.",
  "Break's running. Stretch, sip, stare at a wall. Your call.",
  "Your break already started. I'll ring when it's over.",
  "You focused. Now you rest. That's the deal.",
];

const BREAK_DONE_BODIES = [
  'Ready for another round? Start whenever you are.',
  'Back to it? No rush. Okay, a little rush.',
  "Rested? Mostly? Good enough. Start when you're ready.",
  "One more focus session? I'll be right here.",
];

export function timerPhaseEndMessage(
  phase: TimerPhase,
  autoStartBreak: boolean,
): Push & { type: TimerPhaseEndType } {
  if (phase === 'focus' && autoStartBreak) {
    return {
      type: 'break_started',
      title: 'Focus done, break time',
      body: pick(BREAK_STARTED_BODIES),
    };
  }
  if (phase === 'focus') {
    return {
      type: 'timer_complete',
      title: 'Focus done',
      body: pick(FOCUS_DONE_BODIES),
    };
  }
  return {
    type: 'break_complete',
    title: "Break's over",
    body: pick(BREAK_DONE_BODIES),
  };
}

/** The ringing alert for a finished phase, naming any flies left to collect. */
export function timerFinishedAlert(
  phase: TimerPhase,
  fliesCaught: number,
): Push {
  if (phase === 'focus' && fliesCaught > 0) {
    return {
      title: 'Focus done',
      body: `Nice focus. ${fliesCaught} ${fliesCaught === 1 ? 'fly' : 'flies'} caught. Tap Done to collect.`,
    };
  }
  const { title, body } = timerPhaseEndMessage(phase, false);
  return { title, body };
}
