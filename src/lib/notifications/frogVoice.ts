/**
 * The frog's notification voice: warm underneath, dry on top. The frog is
 * always on the user's side; the sass lands on the task, the list, the clock
 * or the frog itself, never on the user. Routine nudges escalate with the
 * ignored streak: 0-1 is the full voice, 2-3 goes short and deadpan, 4 is an
 * honest, guilt-free heads-up that the frog goes quiet next (mute at 5).
 * Hard rules for any new copy:
 * the title is a short hook in the frog's voice that reads fine alone (one
 * phrase, no trailing period, never a count of open tasks); the body is the
 * frog speaking as "I", at most two short sentences, naming the actual task
 * and ending on one small next step; never judge the named task as easy or
 * small; every number or claim must come from real data (never invent
 * durations or promises); no guilt, no "don't forget", no "should"; "Lily Pad"
 * and "pad" only ever mean the shield, and "hop" is never a verb.
 *
 * Lines are grouped into buckets and handed out by `cursors`, a per-user
 * position saved after each send. A bucket is walked end to end before any
 * line repeats; buckets that fire daily hold 12+ lines so a sentence stays
 * away for about two weeks, the time a repeat takes to feel fresh again.
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
  done: number;
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
    done: partial.done ?? 0,
    frog: partial.frog ? shortFrogName(partial.frog) : 'Your frog',
    task: partial.task ?? null,
    owed: partial.owed ?? 0,
    partner: partial.partner ?? 'A friend',
    minutes: partial.minutes ?? 0,
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

const MORNING_BASE_ONE: Line[] = [
  {
    title: () => 'The list is tiny today',
    body: (c) =>
      c.task
        ? `Just "${c.task}". I checked twice. Suspicious, but I'll allow it.`
        : "Just one task. I checked twice. Suspicious, but I'll allow it.",
  },
  {
    title: () => 'One and done?',
    body: (c) =>
      c.task
        ? `"${c.task}", then the day is all yours. I like those odds.`
        : 'One task, then the day is all yours. I like those odds.',
  },
  {
    title: () => 'Easy mode unlocked',
    body: (c) =>
      c.task
        ? `Only "${c.task}" today. Do it early and coast.`
        : 'Only one task today. Do it early and coast.',
  },
  {
    title: () => 'Good news from the pond',
    body: (c) =>
      c.task
        ? `Today's whole list is "${c.task}". That's it. Go be smug.`
        : "Today's whole list is one task. That's it. Go be smug.",
  },
  {
    title: () => 'Morning! I have a plan',
    body: (c) =>
      c.task
        ? `Step one: "${c.task}". Step two: there is no step two.`
        : 'Step one: the one task. Step two: there is no step two.',
  },
  {
    title: () => 'Short list, big energy',
    body: (c) =>
      c.task
        ? `"${c.task}" is all that stands between you and a free day.`
        : 'One task stands between you and a free day.',
  },
  {
    title: (c) => `${c.frog} read your list`,
    body: (c) =>
      c.task
        ? `It's just "${c.task}". Honestly, we've got this.`
        : "It's one task. Honestly, we've got this.",
  },
  {
    title: () => 'Psst. Only one today',
    body: (c) =>
      c.task
        ? `"${c.task}". I'll be cheering quietly from my rock.`
        : "One task. I'll be cheering quietly from my rock.",
  },
  {
    title: () => 'A one-task kind of day ☀️',
    body: (c) =>
      c.task
        ? `"${c.task}" first, then the day owes you a nap.`
        : 'Do it first, then the day owes you a nap.',
  },
  {
    title: () => "Today's list: bite-sized",
    body: (c) =>
      c.task
        ? `Just "${c.task}". Frogs love a bite-sized thing.`
        : 'Just one task. Frogs love a bite-sized thing.',
  },
  {
    title: () => 'Quick one, then freedom',
    body: (c) =>
      c.task
        ? `"${c.task}". After that, I officially declare the day yours.`
        : 'One task. After that, I officially declare the day yours.',
  },
  {
    title: () => 'One task between you and smug',
    body: (c) =>
      c.task
        ? `"${c.task}". Finish it and be insufferable about it.`
        : 'Finish it and be insufferable about it.',
  },
  {
    title: () => 'Ribbit. That means hi',
    body: (c) =>
      c.task
        ? `Today it's just "${c.task}". I believe in you. Loudly.`
        : 'Just one task today. I believe in you. Loudly.',
  },
  {
    title: () => 'Rare sighting: a short list',
    body: (c) =>
      c.task
        ? `Only "${c.task}" today. Enjoy it, these don't last.`
        : "Only one task today. Enjoy it, these don't last.",
  },
];

const MORNING_BASE_MANY: Line[] = [
  {
    title: () => 'I have a plan',
    body: (c) =>
      c.task
        ? `Start with "${c.task}". That's the plan. I'm a frog, not a consultant.`
        : "Start with the smallest. That's the plan. I'm a frog, not a consultant.",
  },
  {
    title: () => 'Rise and croak ☀️',
    body: (c) =>
      c.task
        ? `"${c.task}" first. ${others(c)} can wait their turn.`
        : `Pick one to start. ${others(c)} can wait their turn.`,
  },
  {
    title: () => 'Morning! Your opener',
    body: (c) =>
      c.task
        ? `"${c.task}". One tick in and the day already looks better.`
        : 'The smallest one. One tick in and the day already looks better.',
  },
  {
    title: () => 'Small start, big day',
    body: (c) =>
      c.task
        ? `Do "${c.task}" and the rest gets easier. Momentum is real, apparently.`
        : 'Do one small thing and the rest gets easier. Momentum is real, apparently.',
  },
  {
    title: () => 'Your list woke up first',
    body: (c) =>
      c.task
        ? `It's already pointing at "${c.task}". I'd humor it.`
        : "It's already waiting. I'd humor it with the smallest one.",
  },
  {
    title: () => "Today's warm-up",
    body: (c) =>
      c.task
        ? `"${c.task}". One tick and you're warmed up.`
        : "Pick the smallest. One tick and you're warmed up.",
  },
  {
    title: () => 'Frog-approved first move',
    body: (c) =>
      c.task
        ? `"${c.task}". Strongly recommended by one (1) frog.`
        : 'The smallest one. Strongly recommended by one (1) frog.',
  },
  {
    title: (c) => `${c.frog} made you a plan`,
    body: (c) =>
      c.task
        ? `Step one: "${c.task}". Step two: feel great about it.`
        : 'Step one: the smallest task. Step two: feel great about it.',
  },
  {
    title: () => 'One at a time, okay?',
    body: (c) =>
      c.task
        ? `"${c.task}" first. The rest can wait. That's allowed.`
        : "Smallest first. The rest can wait. That's allowed.",
  },
  {
    title: () => 'Before the day gets ideas',
    body: (c) =>
      c.task
        ? `Get "${c.task}" done early. Then the day can do what it wants.`
        : 'Get one done early. Then the day can do what it wants.',
  },
  {
    title: () => 'Morning briefing 🐸',
    body: (c) =>
      c.task
        ? `Top pick: "${c.task}". The frog has spoken.`
        : 'Top pick: the smallest one. The frog has spoken.',
  },
  {
    title: () => 'Good morning, list-haver',
    body: (c) =>
      c.task
        ? `I'd open with "${c.task}" and see how we feel.`
        : "I'd open with the smallest one and see how we feel.",
  },
  {
    title: () => "Today's first bite",
    body: (c) =>
      c.task
        ? `"${c.task}". Frogs never swallow the whole pond at once.`
        : 'Something small. Frogs never swallow the whole pond at once.',
  },
  {
    title: () => 'No panic, just a plan',
    body: (c) =>
      c.task
        ? `"${c.task}" first. Then the next one. That's the whole trick.`
        : "One first. Then the next. That's the whole trick.",
  },
  {
    title: () => 'Quiet morning, good timing',
    body: (c) =>
      c.task
        ? `"${c.task}" now, while the world is still quiet.`
        : 'Start one now, while the world is still quiet.',
  },
  {
    title: () => 'First tick of the day',
    body: (c) =>
      c.task
        ? `"${c.task}" is up. One tick and we're rolling.`
        : "The smallest one is up. One tick and we're rolling.",
  },
];

const MORNING_DRY_ONE: Line[] = [
  {
    title: () => 'Keeping this short',
    body: (c) =>
      c.task
        ? `Today: "${c.task}". That's the whole message.`
        : "One task today. That's the whole message.",
  },
  {
    title: () => 'A small croak',
    body: (c) =>
      c.task
        ? `"${c.task}" is today's only task. No pressure. Mild pressure.`
        : 'One task today. No pressure. Mild pressure.',
  },
  {
    title: () => 'Brevity is my gift',
    body: (c) =>
      c.task
        ? `"${c.task}". Back to my rock now.`
        : 'One task today. Back to my rock now.',
  },
  {
    title: () => 'Just the one',
    body: (c) =>
      c.task
        ? `"${c.task}". I'll be over here being patient. It's my thing.`
        : "One task. I'll be over here being patient. It's my thing.",
  },
  {
    title: () => 'Hi, briefly',
    body: (c) =>
      c.task
        ? `One item on the list: "${c.task}". Your call.`
        : 'One item on the list. Your call.',
  },
  {
    title: () => 'Still here, still green',
    body: (c) =>
      c.task
        ? `"${c.task}" is waiting, and so, quietly, am I.`
        : 'One task is waiting, and so, quietly, am I.',
  },
  {
    title: () => 'Low-key reminder',
    body: (c) =>
      c.task
        ? `"${c.task}". Whenever you're ready. Frogs have time.`
        : "One task. Whenever you're ready. Frogs have time.",
  },
];

const MORNING_DRY_MANY: Line[] = [
  {
    title: () => 'Me again',
    body: (c) =>
      c.task
        ? `"${c.task}" is a fine start. Or not. Your call.`
        : "Start anywhere, or don't. Your call.",
  },
  {
    title: () => 'The short version',
    body: (c) =>
      c.task
        ? `Start with "${c.task}". That's all I've got.`
        : "Start with the smallest. That's all I've got.",
  },
  {
    title: () => 'A brief croak',
    body: (c) =>
      c.task
        ? `"${c.task}" first, if you're up for it. Back to my rock.`
        : "Smallest first, if you're up for it. Back to my rock.",
  },
  {
    title: () => 'Not nagging, just informing',
    body: (c) =>
      c.task
        ? `${c.count} on today's list, led by "${c.task}".`
        : `${c.count} on today's list. That's the whole update.`,
  },
  {
    title: () => 'Low-effort reminder',
    body: (c) =>
      c.task
        ? `I did my part. "${c.task}" is yours.`
        : 'I did my part. The list is yours.',
  },
  {
    title: () => 'No speech today',
    body: (c) =>
      c.task
        ? `Just "${c.task}", whenever you're ready.`
        : "Just the list, whenever you're ready.",
  },
  {
    title: () => 'Quick hello',
    body: (c) =>
      c.task
        ? `"${c.task}" is on top today. Loyal, that one.`
        : 'Your list is here. Loyal, that thing.',
  },
  {
    title: () => 'Small nudge, no lecture',
    body: (c) =>
      c.task
        ? `"${c.task}" whenever it suits you. The day is long.`
        : 'One whenever it suits you. The day is long.',
  },
];

function morningQuietBody(c: Ctx): string {
  if (c.count === 1) {
    return c.task
      ? `Today: "${c.task}". If this reminder misses too, I'll give you some quiet.`
      : "One task today. If this reminder misses too, I'll give you some quiet.";
  }
  return c.task
    ? `${c.count} today, "${c.task}" first. If this reminder misses too, I'll ease off.`
    : `${c.count} tasks today. If this reminder misses too, I'll give you some quiet.`;
}

function morningLastCroakBody(c: Ctx): string {
  if (c.count === 1) {
    return c.task
      ? `"${c.task}" is open. One more miss and I'll stop sending these.`
      : "One task open. One more miss and I'll stop sending these.";
  }
  return c.task
    ? `${c.count} open, "${c.task}" among them. One more miss and I'll ease off.`
    : `${c.count} open. One more miss and I'll stop sending these.`;
}

function honestQuestionBody(c: Ctx): string {
  if (c.count === 1) {
    return c.task
      ? `Are these helping? If not, I'll ease off. Today it's just "${c.task}".`
      : "Are these helping? If not, I'll ease off. Today it's just one task.";
  }
  return c.task
    ? `Are these helping? If not, I'll ease off. ${c.count} open, "${c.task}" first.`
    : `Are these helping? If not, I'll ease off. ${c.count} tasks are open.`;
}

const MORNING_FINAL: Line[] = [
  { title: () => "I'll go quiet soon", body: morningQuietBody },
  { title: () => 'Last croak for a while', body: morningLastCroakBody },
  { title: () => 'Quick, honest question', body: honestQuestionBody },
];

const EVENING_LAST: Line[] = [
  {
    title: () => 'So close',
    body: (c) =>
      c.task
        ? `Just "${c.task}" left. Finish strong, then do absolutely nothing.`
        : 'One task left. Finish strong, then do absolutely nothing.',
  },
  {
    title: () => 'Almost a perfect day',
    body: (c) =>
      c.task
        ? `Only "${c.task}" stands in the way. I'd hate for it to win.`
        : "Only one task stands in the way. I'd hate for it to win.",
  },
  {
    title: () => 'Down to the last one',
    body: (c) =>
      c.task
        ? `${c.done} done, only "${c.task}" to go. I'm already proud of today.`
        : `${c.done} done, one to go. I'm already proud of today.`,
  },
  {
    title: () => 'I can taste a perfect day',
    body: (c) =>
      c.task
        ? `Only "${c.task}" left. Tastes like flies, if you're wondering.`
        : "One task left. Tastes like flies, if you're wondering.",
  },
  {
    title: () => 'Finish line, spotted',
    body: (c) =>
      c.task
        ? `"${c.task}" is the last one. Cross it and the list is clear.`
        : 'One task left. Cross it and the list is clear.',
  },
  {
    title: () => 'The final boss 🐸',
    body: (c) =>
      c.task
        ? `${c.done} down, and now "${c.task}". One tick and the credits roll.`
        : `${c.done} down, one to go. One tick and the credits roll.`,
  },
  {
    title: () => 'One left, then smugness',
    body: (c) =>
      c.task
        ? `"${c.task}". Finish it and we both get to feel smug.`
        : 'Finish the last task and we both get to feel smug.',
  },
  {
    title: () => 'Clean sweep incoming',
    body: (c) =>
      c.task
        ? `"${c.task}" is the only one left. Clear it and the whole list is done.`
        : 'One task left. Clear it and the whole list is done.',
  },
  {
    title: () => 'Look at you go',
    body: (c) =>
      c.task
        ? `${tasks(c.done)} done today. "${c.task}" would make it a clean sweep.`
        : `${tasks(c.done)} done today. One more makes it a clean sweep.`,
  },
  {
    title: () => 'Last one, then glory',
    body: (c) =>
      c.task
        ? `"${c.task}". Then I do a tiny victory croak.`
        : 'One task. Then I do a tiny victory croak.',
  },
  {
    title: () => 'The list is almost empty',
    body: (c) =>
      c.task
        ? `Only "${c.task}" is left. It looks lonely. Help it out.`
        : 'Only one task is left. It looks lonely. Help it out.',
  },
  {
    title: () => 'One more, then bragging rights',
    body: (c) =>
      c.task
        ? `"${c.task}", and you can tell everyone. I'll tell the pond.`
        : "Finish the last one and tell everyone. I'll tell the pond.",
  },
];

const EVENING_BASE_ONE: Line[] = [
  {
    title: () => 'One tick from done',
    body: (c) =>
      c.task
        ? `"${c.task}". Then the evening is all yours.`
        : 'One task. Then the evening is all yours.',
  },
  {
    title: () => 'The last one standing',
    body: (c) =>
      c.task
        ? `"${c.task}" thinks it survived the day. Surprise it.`
        : 'Your one task thinks it survived the day. Surprise it.',
  },
  {
    title: () => 'Pajamas are on hold',
    body: (c) =>
      c.task
        ? `"${c.task}" first. Then pajamas, guilt-free.`
        : 'One task first. Then pajamas, guilt-free.',
  },
  {
    title: () => 'Tomorrow-you says hi',
    body: (c) =>
      c.task
        ? `They'd love "${c.task}" done tonight. Just passing it on.`
        : "They'd love today's task done tonight. Just passing it on.",
  },
  {
    title: () => 'Before the couch claims you',
    body: (c) =>
      c.task
        ? `"${c.task}", then the couch. In that order, ideally.`
        : 'One task, then the couch. In that order, ideally.',
  },
  {
    title: () => 'Last call from the pond',
    body: (c) =>
      c.task
        ? `"${c.task}" is still open. Clear it and tomorrow starts clean.`
        : 'One task is still open. Clear it and tomorrow starts clean.',
  },
  {
    title: () => 'Psst. Still time',
    body: (c) =>
      c.task
        ? `"${c.task}". I'm staying up for this one.`
        : "One task. I'm staying up for this one.",
  },
  {
    title: () => "Tonight's one job",
    body: (c) =>
      c.task
        ? `"${c.task}". One tick and we both sleep happy.`
        : 'One task. One tick and we both sleep happy.',
  },
  {
    title: () => 'Quick one before bed?',
    body: (c) =>
      c.task
        ? `"${c.task}". Then lights out, no regrets.`
        : 'One task. Then lights out, no regrets.',
  },
  {
    title: () => 'Late-night special 🌙',
    body: (c) =>
      c.task
        ? `"${c.task}", served fresh. Pairs well with an early night.`
        : 'One task, served fresh. Pairs well with an early night.',
  },
  {
    title: () => 'The evening has one job',
    body: (c) =>
      c.task
        ? `"${c.task}". Do that and the evening can relax.`
        : 'One task. Do that and the evening can relax.',
  },
  {
    title: () => 'One task, zero speeches',
    body: (c) =>
      c.task
        ? `"${c.task}". That's my whole pitch. Goodnight-ish.`
        : "One task. That's my whole pitch. Goodnight-ish.",
  },
];

const EVENING_PROGRESS: Line[] = [
  {
    title: () => 'Good day so far',
    body: (c) =>
      c.task
        ? `${tasks(c.done)} done already. "${c.task}" would make it ${c.done + 1}.`
        : `${tasks(c.done)} done already. One more makes it ${c.done + 1}.`,
  },
  {
    title: () => 'Progress report 🐸',
    body: (c) =>
      c.task
        ? `${c.done} done, ${c.count} to go. I'd grab "${c.task}" next.`
        : `${c.done} done, ${c.count} to go. One more and we call it.`,
  },
  {
    title: () => 'Momentum spotted',
    body: (c) =>
      c.task
        ? `${tasks(c.done)} finished. "${c.task}" is right there if you want one more.`
        : `${tasks(c.done)} finished. One more is right there if you want it.`,
  },
  {
    title: () => 'One more for the road?',
    body: (c) =>
      c.task
        ? `You did ${c.done} today. "${c.task}" would be a nice encore.`
        : `You did ${c.done} today. One more would be a nice encore.`,
  },
  {
    title: () => 'The pond is impressed',
    body: (c) =>
      c.task
        ? `${c.done} done today. "${c.task}" next, then feet up.`
        : `${c.done} done today. One more, then feet up.`,
  },
  {
    title: () => 'On a roll',
    body: (c) =>
      c.task
        ? `${c.done} down. "${c.task}" while you're warmed up?`
        : `${c.done} down. One more while you're warmed up?`,
  },
  {
    title: () => 'Finish strong?',
    body: (c) =>
      c.task
        ? `Today's score: ${c.done}. "${c.task}" would round it out.`
        : `Today's score: ${c.done}. One more would round it out.`,
  },
  {
    title: () => "I've been keeping count",
    body: (c) =>
      c.task
        ? `${c.done} done today. Very proud. "${c.task}" next?`
        : `${c.done} done today. Very proud. One more?`,
  },
  {
    title: () => 'Encore?',
    body: (c) =>
      c.task
        ? `${tasks(c.done)} done. "${c.task}" is the obvious sequel.`
        : `${tasks(c.done)} done. One more is the obvious sequel.`,
  },
  {
    title: (c) => `Evening report from ${c.frog}`,
    body: (c) =>
      c.task
        ? `${c.done} done, ${c.count} open. I'd pick off "${c.task}", then rest.`
        : `${c.done} done, ${c.count} open. I'd pick off one more, then rest.`,
  },
  {
    title: () => 'Victory lap available',
    body: (c) =>
      c.task
        ? `${c.done} done. "${c.task}" makes it a lap. Your call.`
        : `${c.done} done. One more makes it a lap. Your call.`,
  },
  {
    title: () => 'Today went well',
    body: (c) =>
      c.task
        ? `${tasks(c.done)} done. Clear "${c.task}" and the rest can wait for morning.`
        : `${tasks(c.done)} done. One more and the rest can wait for morning.`,
  },
];

const EVENING_BASE_MANY: Line[] = [
  {
    title: () => 'Quick win before bed?',
    body: (c) =>
      c.task
        ? `Knock out "${c.task}", then feet up. ${others(c)} can wait.`
        : 'Knock one out, then feet up. The rest can wait.',
  },
  {
    title: () => 'Still time for one',
    body: (c) =>
      c.task
        ? `"${c.task}" is right there. One counts. One totally counts.`
        : 'Any one of them. One counts. One totally counts.',
  },
  {
    title: () => 'One and done tonight?',
    body: (c) =>
      c.task
        ? `Pick "${c.task}" and call it a night. The rest can wait for morning.`
        : 'Pick one and call it a night. The rest can wait for morning.',
  },
  {
    title: () => "The day isn't over yet",
    body: (c) =>
      c.task
        ? `"${c.task}" is right there. Just saying.`
        : 'One task is right there. Just saying.',
  },
  {
    title: () => 'Your list is getting cocky',
    body: (c) =>
      c.task
        ? `Knock "${c.task}" off and humble it.`
        : 'Knock one off and humble it.',
  },
  {
    title: () => 'Pre-pajama mission',
    body: (c) =>
      c.task
        ? `"${c.task}". One tick, then pajamas. The rest can wait.`
        : 'Any one. One tick, then pajamas. The rest can wait.',
  },
  {
    title: () => 'Not over till the frog sleeps',
    body: (c) =>
      c.task
        ? `And I'm still up. "${c.task}", maybe?`
        : "And I'm still up. Just one, maybe?",
  },
  {
    title: () => 'A little one before bed?',
    body: (c) =>
      c.task
        ? `"${c.task}". One is plenty tonight.`
        : 'Any one. One is plenty tonight.',
  },
  {
    title: () => 'No judgment, just a frog',
    body: (c) =>
      c.task
        ? `Just me, a list, and "${c.task}". One tick is plenty.`
        : "Just me, a list, and one tick. That's plenty.",
  },
  {
    title: () => 'Evening plan, by me',
    body: (c) =>
      c.task
        ? `Step one: "${c.task}". Step two: sleep like a champion.`
        : 'Step one: any task. Step two: sleep like a champion.',
  },
  {
    title: () => 'Up for grabs',
    body: (c) =>
      c.task
        ? `"${c.task}". One tick and I'm a happy frog.`
        : "Any task. One tick and I'm a happy frog.",
  },
  {
    title: () => 'Sneak one in?',
    body: (c) =>
      c.task
        ? `"${c.task}" before bed. ${others(c)} won't even notice.`
        : "One before bed. The rest won't even notice.",
  },
  {
    title: () => 'Goodnight-ish 🌙',
    body: (c) =>
      c.task
        ? `One tick on "${c.task}" and then it's a real goodnight.`
        : "One tick and then it's a real goodnight.",
  },
  {
    title: () => 'Lighter tomorrow, maybe?',
    body: (c) =>
      c.task
        ? `"${c.task}" tonight, and tomorrow starts one lighter.`
        : 'One tonight, and tomorrow starts one lighter.',
  },
];

const EVENING_DRY_ONE: Line[] = [
  {
    title: () => 'Short and sweet',
    body: (c) =>
      c.task
        ? `"${c.task}". Do it and I'll say nothing more tonight.`
        : "One task. Do it and I'll say nothing more tonight.",
  },
  {
    title: () => 'Still one open',
    body: (c) =>
      c.task
        ? `"${c.task}" made it to evening. Impressive, in its way.`
        : 'The last task made it to evening. Impressive, in its way.',
  },
  {
    title: () => 'Undefeated since morning',
    body: (c) =>
      c.task
        ? `"${c.task}". I admire its stubbornness. I'd still beat it.`
        : "The last task. I admire its stubbornness. I'd still beat it.",
  },
  {
    title: () => 'Last one, no speech',
    body: (c) =>
      c.task
        ? `"${c.task}". You know where it lives.`
        : 'One task. You know where it lives.',
  },
  {
    title: () => 'The lone survivor',
    body: (c) =>
      c.task
        ? `"${c.task}". One tap ends its reign.`
        : 'One task left. One tap ends its reign.',
  },
  {
    title: () => 'Brief, as usual',
    body: (c) =>
      c.task
        ? `"${c.task}" is the last one. That's the whole croak.`
        : "One task left. That's the whole croak.",
  },
  {
    title: () => 'Just one, just saying',
    body: (c) =>
      c.task
        ? `"${c.task}". I'll be on my rock if you need me.`
        : "One task. I'll be on my rock if you need me.",
  },
];

const EVENING_DRY_MANY: Line[] = [
  {
    title: () => 'No thumbs, sadly',
    body: (c) =>
      c.task
        ? `"${c.task}" is a good start. I'd do it myself, but no thumbs.`
        : "I'd do one myself, but no thumbs.",
  },
  {
    title: () => 'Patient frog report',
    body: (c) =>
      c.task
        ? `"${c.task}" is still sitting there. So am I. We're very patient.`
        : "The list is still sitting there. So am I. We're very patient.",
  },
  {
    title: () => 'For the record',
    body: (c) =>
      c.task
        ? `"${c.task}" leads the pack. No further comment.`
        : `${tasks(c.count)} open. No further comment.`,
  },
  {
    title: () => 'Pond update',
    body: (c) =>
      c.task
        ? `"${c.task}" is on top. That's the whole report.`
        : `${tasks(c.count)} open. That's the whole report.`,
  },
  {
    title: () => 'Quick one tonight',
    body: (c) =>
      c.task
        ? `"${c.task}" if you've got it in you. If not, tomorrow.`
        : "One if you've got it in you. If not, tomorrow.",
  },
  {
    title: () => 'Not a lecture',
    body: (c) =>
      c.task
        ? `Just a frog who thinks "${c.task}" doesn't stand a chance.`
        : "Just a frog who believes in you. That's all.",
  },
  {
    title: () => 'Either way, goodnight',
    body: (c) =>
      c.task
        ? `"${c.task}" first, or not. Either way, sleep well.`
        : 'One, or none. Either way, sleep well.',
  },
];

function eveningQuietBody(c: Ctx): string {
  if (c.count === 1) {
    return c.task
      ? `"${c.task}" is open. If this reminder misses too, I'll give you some quiet.`
      : "One task still open. If this reminder misses too, I'll give you some quiet.";
  }
  return c.task
    ? `${c.count} open, "${c.task}" first. If this reminder misses too, I'll ease off.`
    : `${c.count} still open. If this reminder misses too, I'll give you some quiet.`;
}

function eveningLastBody(c: Ctx): string {
  if (c.count === 1) {
    return c.task
      ? `"${c.task}" is open. One more miss and I'll stop sending these.`
      : "One task is open. One more miss and I'll stop sending these.";
  }
  return c.task
    ? `${c.count} open, starting with "${c.task}". One more miss and I'll ease off.`
    : `${c.count} open. One more miss and I'll stop sending these.`;
}

const EVENING_FINAL: Line[] = [
  { title: () => 'Before I go quiet', body: eveningQuietBody },
  { title: () => 'The last croak for a while', body: eveningLastBody },
  { title: () => 'Quick, honest question', body: honestQuestionBody },
];

const HUNGER: Line[] = [
  {
    title: (c) => `${c.frog} is hungry`,
    body: (c) =>
      c.task
        ? `Finishing "${c.task}" would feed me. Just putting that out there.`
        : 'One finished task and dinner is served.',
  },
  {
    title: (c) => `${c.frog}'s belly is empty`,
    body: (c) =>
      c.task
        ? `Any task feeds me. "${c.task}" would do nicely.`
        : "Any task feeds me. Small ones count. I'm not picky.",
  },
  {
    title: () => 'Dinner is running late',
    body: (c) =>
      c.task
        ? `Tick off "${c.task}" and I eat. I'll act surprised.`
        : "Tick one thing off and I eat. I'll act surprised.",
  },
  {
    title: () => 'Rumble from the pond',
    body: (c) =>
      c.task
        ? `That was my stomach. "${c.task}" would settle it.`
        : 'That was my stomach. One task settles it.',
  },
  {
    title: (c) => `${c.frog} is staring at you`,
    body: (c) =>
      c.task
        ? `Politely. Hungrily. "${c.task}" would fix this.`
        : 'Politely. Hungrily. One finished task feeds me.',
  },
  {
    title: () => 'Feed the frog?',
    body: (c) =>
      c.task
        ? `Finish "${c.task}" and I'm fed. Any task works, honestly.`
        : 'Any finished task does it. Even a tiny one. Especially a tiny one.',
  },
  {
    title: (c) => `${c.frog} would like a snack`,
    body: (c) =>
      c.task
        ? `"${c.task}" counts as dinner. I'll be dramatic about it.`
        : "Finish anything today and I'm fed. I'll be dramatic about it.",
  },
  {
    title: () => 'Tummy status: empty',
    body: (c) =>
      c.task
        ? `One finished task feeds me. "${c.task}", maybe?`
        : 'One finished task feeds me. Any task at all.',
  },
  {
    title: () => 'Running on empty here',
    body: (c) =>
      c.task
        ? `Finish "${c.task}" and I'll do the happy wiggle.`
        : "One task feeds me. I'll do the happy wiggle and everything.",
  },
  {
    title: () => 'My belly has notes',
    body: (c) =>
      c.task
        ? `Mainly: "${c.task}", please. Any finished task feeds me.`
        : 'Mainly: one task, please. Any finished task feeds me.',
  },
  {
    title: () => 'Snack time? 🪰',
    body: (c) =>
      c.task
        ? `Finish "${c.task}" and I eat. That's the whole deal.`
        : "Finish any task and I eat. That's the whole deal.",
  },
  {
    title: () => 'The fridge is empty',
    body: (c) =>
      c.task
        ? `By fridge I mean my belly. "${c.task}" would feed me.`
        : 'By fridge I mean my belly. One finished task feeds me.',
  },
];

const FAREWELL: Line[] = [
  {
    title: (c) => `${c.frog} is going quiet`,
    body: () =>
      "These reminders aren't helping, so I'll stop. Open the app anytime and I'm back.",
  },
  {
    title: () => "I'll give you some quiet",
    body: () =>
      "No more reminders for now. I'll be on my rock. Open the app and I'm back.",
  },
  {
    title: () => 'Taking the hint',
    body: () =>
      "I'll stop sending these. No hard feelings, I'm a frog. Open the app and I'm back.",
  },
  {
    title: () => 'Signing off for now',
    body: () =>
      "I'll pause the reminders. Open the app whenever and they pick up again.",
  },
];

const FLIES_ONE: Line[] = [
  {
    title: () => 'A friend earned you a fly',
    body: () => "It's in your pond until midnight, then it buzzes off.",
  },
  {
    title: () => "There's a fly in your pond",
    body: () => 'A friend put it there. Grab it before midnight.',
  },
  {
    title: () => 'Free fly, courtesy of a friend',
    body: () => 'Yours until midnight. Flies are famously bad at waiting.',
  },
  {
    title: () => 'A friend caught you one',
    body: () => 'One fly is waiting in your pond. It leaves at midnight.',
  },
  {
    title: () => 'Your pond got a visitor',
    body: () => "A friend's win dropped a fly in it. Claim it before midnight.",
  },
  {
    title: () => 'Fly delivery',
    body: () =>
      "A friend's finished task sent a fly your way. Gone at midnight.",
  },
];

const FLIES_MANY: Line[] = [
  {
    title: (c) => `Friends earned you ${c.owed} flies`,
    body: () => "They're gone at midnight. Claim them before they buzz off.",
  },
  {
    title: (c) => `${c.owed} flies in your pond`,
    body: () => 'Your friends put them there. Midnight takes them back.',
  },
  {
    title: (c) => `Your pond is buzzing: ${c.owed} flies`,
    body: () => 'All yours until midnight, and not a minute after.',
  },
  {
    title: (c) => `${c.owed} flies waiting for you`,
    body: () => 'Your friends earned them. You just collect. Before midnight.',
  },
  {
    title: (c) => `Great friends, ${c.owed} flies`,
    body: () =>
      'Their finished tasks filled your pond. Claim them before midnight.',
  },
  {
    title: () => 'Your friends have been busy',
    body: (c) => `${c.owed} flies landed in your pond. Midnight is the deadline.`,
  },
];

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

type RoutineOpts = {
  count: number;
  done?: number;
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
    done: opts.done,
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
  if (ctx.count === 1) {
    return ctx.done > 0
      ? rotate('e_last', EVENING_LAST, ctx, opts.cursors)
      : rotate('e_base_one', EVENING_BASE_ONE, ctx, opts.cursors);
  }
  return ctx.done > 0
    ? rotate('e_progress', EVENING_PROGRESS, ctx, opts.cursors)
    : rotate('e_base_many', EVENING_BASE_MANY, ctx, opts.cursors);
}

export function hungerMessage(
  frog: string,
  cursors?: CopyCursors,
  exampleTask?: string | null,
): VoiceLine {
  return rotate(
    'hunger',
    HUNGER,
    makeCtx({ frog, task: shortTaskText(exampleTask) }),
    cursors,
  );
}

const habits = (n: number) => `${n} habit${n === 1 ? '' : 's'}`;

const LEAP_HOLD: ((league: string, n: number) => Push)[] = [
  (league, n) => ({
    title: `Stay in the ${league} League?`,
    body: `Finish ${habits(n)} tonight to leave the demotion zone. I'll be cheering.`,
  }),
  (league, n) => ({
    title: `Keep your ${league} League spot`,
    body: `Finish ${habits(n)} tonight to leave the demotion zone. You've got this.`,
  }),
  (league, n) => ({
    title: 'Out of the demotion zone tonight?',
    body: `Finish ${habits(n)} to stay in the ${league} League. I believe in you.`,
  }),
  (league, n) => ({
    title: 'Quick league rescue?',
    body: `Finish ${habits(n)} tonight and you stay in the ${league} League.`,
  }),
];

const LEAP_PROMOTION: ((next: string, n: number) => Push)[] = [
  (next, n) => ({
    title: `The ${next} League is close`,
    body: `Finish ${habits(n)} tonight to reach the promotion zone. So close.`,
  }),
  (next, n) => ({
    title: 'Promotion zone in sight',
    body: `Finish ${habits(n)} tonight and you're in. The ${next} League awaits.`,
  }),
  (next, n) => ({
    title: `Next stop: ${next} League`,
    body: `Finish ${habits(n)} tonight to reach the promotion zone. I'm ready to celebrate.`,
  }),
  (next, n) => ({
    title: 'A promotion, maybe?',
    body: `Finish ${habits(n)} tonight to reach the promotion zone for the ${next} League.`,
  }),
];

export function leapHoldMessage(
  league: string,
  habitsLeft: number,
  cursors?: CopyCursors,
): VoiceLine {
  const { index, bucket, cursor } = rotateIndex(
    'leap_hold',
    LEAP_HOLD.length,
    cursors,
  );
  return { ...LEAP_HOLD[index](league, habitsLeft), bucket, cursor };
}

export function leapPromotionMessage(
  nextLeague: string,
  habitsLeft: number,
  cursors?: CopyCursors,
): VoiceLine {
  const { index, bucket, cursor } = rotateIndex(
    'leap_promotion',
    LEAP_PROMOTION.length,
    cursors,
  );
  return { ...LEAP_PROMOTION[index](nextLeague, habitsLeft), bucket, cursor };
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
