/**
 * The frog's notification voice: warm underneath, dry on top. The frog is
 * always on the user's side; the sass lands on the task, the list, the clock
 * or the frog itself, never on the user. Routine nudges escalate with the
 * ignored streak: 0-1 is the full voice, 2-3 goes short and deadpan, 4 is an
 * honest, guilt-free heads-up that the frog goes quiet next (mute at 5).
 * Hard rules for any new copy:
 * the title carries the news and reads fine alone (one phrase, no trailing
 * period); the body is the frog speaking as "I", at most two short sentences,
 * ending on one small next step; every number or claim must come from real
 * data (never invent durations or promises); name the actual task when one is
 * relevant; no guilt, no "don't forget", no "should"; "Lily Pad" and "pad"
 * only ever mean the shield, and "hop" is never a verb.
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
    partner: partial.partner ?? 'A friend',
    minutes: partial.minutes ?? 0,
  };
}

const others = (c: Ctx) =>
  c.count - 1 === 1 ? 'The other one' : `The other ${c.count - 1}`;

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
        ? `Just "${c.task}". Do it and the rest of the day is yours.`
        : 'Just one. Do it and the rest of the day is yours.',
  },
  {
    title: () => "Today's list is one line long",
    body: (c) =>
      c.task
        ? `"${c.task}". You've got this. I've survived herons.`
        : "Just one task. You've got this. I've survived herons.",
  },
  {
    title: () => 'A one-task kind of day',
    body: (c) =>
      c.task
        ? `"${c.task}", then you're free. I like those odds.`
        : "One task, then you're free. I like those odds.",
  },
  {
    title: () => 'Short list this morning',
    body: (c) =>
      c.task
        ? `Only "${c.task}". I'd do it before the day gets ideas.`
        : "Only one task. I'd do it before the day gets ideas.",
  },
  {
    title: () => 'The whole list: one task',
    body: (c) =>
      c.task
        ? `"${c.task}". I checked twice, out of suspicion.`
        : 'I checked twice, out of suspicion.',
  },
  {
    title: () => 'One task, then nothing',
    body: (c) =>
      c.task
        ? `"${c.task}" first. After that, the day owes you a nap.`
        : 'Do it first. After that, the day owes you a nap.',
  },
  {
    title: () => 'Easy mode today',
    body: (c) =>
      c.task
        ? `Just "${c.task}". I'll be cheering quietly from the pond.`
        : "Just one task. I'll be cheering quietly from the pond.",
  },
  {
    title: () => 'Morning! Just the one',
    body: (c) =>
      c.task
        ? `"${c.task}" is all. Get it done early and coast.`
        : 'One task is all. Get it done early and coast.',
  },
  {
    title: (c) => `${c.frog} read today's list`,
    body: (c) =>
      c.task
        ? `It's just "${c.task}". Honestly, we've got this.`
        : "It's one task. Honestly, we've got this.",
  },
  {
    title: () => 'Rare sighting: a short list',
    body: (c) =>
      c.task
        ? `Only "${c.task}" today. Enjoy it, these don't last.`
        : "Only one task today. Enjoy it, these don't last.",
  },
  {
    title: () => 'One task between you and smug',
    body: (c) =>
      c.task
        ? `"${c.task}". Finish it and be insufferable about it.`
        : 'Finish it and be insufferable about it.',
  },
  {
    title: () => 'Suspiciously short list',
    body: (c) =>
      c.task
        ? `Just "${c.task}". I'm not complaining. Go get it.`
        : "One task. I'm not complaining. Go get it.",
  },
];

const MORNING_BASE_MANY: Line[] = [
  {
    title: (c) => `${c.count} tasks today`,
    body: (c) =>
      c.task
        ? `Start with "${c.task}". I'll handle the cheering.`
        : "Start with the smallest. I'll handle the cheering.",
  },
  {
    title: (c) => `Morning! ${c.count} on the list`,
    body: (c) =>
      c.task
        ? `"${c.task}" looks like the easy one. I'd start there.`
        : "The smallest one looks easy. I'd start there.",
  },
  {
    title: (c) => `${c.count} tasks, I counted twice`,
    body: (c) =>
      c.task
        ? `"${c.task}" keeps staring at me. Please deal with it.`
        : 'One of them keeps staring at me. Please deal with it.',
  },
  {
    title: () => 'Your list woke up before you',
    body: (c) =>
      c.task
        ? `${c.count} waiting. "${c.task}" is a good way in.`
        : `${c.count} waiting. The smallest is a good way in.`,
  },
  {
    title: (c) => `${c.count} today, one at a time`,
    body: (c) =>
      c.task
        ? `Do "${c.task}" and ignore the rest for now. That's allowed.`
        : "Do one and ignore the rest for now. That's allowed.",
  },
  {
    title: (c) => `${c.count} things, one morning`,
    body: (c) =>
      c.task
        ? `"${c.task}" first. Momentum is real, apparently.`
        : 'Smallest first. Momentum is real, apparently.',
  },
  {
    title: (c) => `${c.count} before tonight`,
    body: (c) =>
      c.task
        ? `"${c.task}" now, while the world is still quiet.`
        : 'Start now, while the world is still quiet.',
  },
  {
    title: (c) => `${c.frog} read your list`,
    body: (c) =>
      c.task
        ? `${c.count} tasks. Strong list. "${c.task}" looks like a warm-up.`
        : `${c.count} tasks. Strong list. Start with a warm-up.`,
  },
  {
    title: (c) => `Morning briefing: ${c.count} tasks`,
    body: (c) =>
      c.task
        ? `Recommended opener: "${c.task}". The frog has spoken.`
        : 'Recommended opener: the smallest one. The frog has spoken.',
  },
  {
    title: (c) => `${c.count} tasks, zero panic`,
    body: (c) =>
      c.task
        ? `Start with "${c.task}". Then the next one. That's the whole trick.`
        : "Start with one. Then the next. That's the whole trick.",
  },
  {
    title: () => 'Good morning, list-haver',
    body: (c) =>
      c.task
        ? `${c.count} today. I'd open with "${c.task}" and see how we feel.`
        : `${c.count} today. I'd open with the smallest and see how we feel.`,
  },
  {
    title: (c) => `Today has ${c.count} tasks for you`,
    body: (c) =>
      c.task
        ? `"${c.task}" makes a good first bite. Frogs start small.`
        : 'Take a small first bite. Frogs always do.',
  },
  {
    title: () => 'Rise and shine, gently',
    body: (c) =>
      c.task
        ? `${c.count} on today's list. "${c.task}" is a soft start.`
        : `${c.count} on today's list. Pick a soft start.`,
  },
  {
    title: () => 'The plan for today, by me',
    body: (c) =>
      c.task
        ? `Step one: "${c.task}". Step two: feel great about it.`
        : 'Step one: the smallest task. Step two: feel great about it.',
  },
];

const MORNING_DRY_ONE: Line[] = [
  {
    title: () => 'One task today',
    body: (c) =>
      c.task
        ? `"${c.task}". I'll keep this short. I know you're busy.`
        : "I'll keep this short. I know you're busy.",
  },
  {
    title: () => 'Morning, one task',
    body: (c) =>
      c.task
        ? `"${c.task}". That's the whole message. Brevity is my gift.`
        : "That's the whole message. Brevity is my gift.",
  },
  {
    title: () => 'Just checking in',
    body: (c) =>
      c.task
        ? `"${c.task}" is today's only task. No pressure. Mild pressure.`
        : 'One task today. No pressure. Mild pressure.',
  },
  {
    title: () => 'The list, briefly',
    body: (c) =>
      c.task
        ? `One item: "${c.task}". I'm told it's very doable.`
        : "One item. I'm told it's very doable.",
  },
  {
    title: () => 'Quick one',
    body: (c) =>
      c.task
        ? `"${c.task}". That's it. I'll go back to my rock now.`
        : "One task. That's it. I'll go back to my rock now.",
  },
  {
    title: () => 'Same small list',
    body: (c) =>
      c.task
        ? `"${c.task}" is waiting, and so, quietly, am I.`
        : 'One task is waiting, and so, quietly, am I.',
  },
  {
    title: () => 'Just the one',
    body: (c) =>
      c.task
        ? `"${c.task}". I'll be over here being patient. It's my thing.`
        : "I'll be over here being patient. It's my thing.",
  },
];

const MORNING_DRY_MANY: Line[] = [
  {
    title: () => 'Me again',
    body: (c) =>
      c.task
        ? `${c.count} on the list. "${c.task}" is a fine start. Your call.`
        : `${c.count} on the list. Start anywhere, or don't. Your call.`,
  },
  {
    title: (c) => `${c.count} tasks today`,
    body: (c) =>
      c.task
        ? `Keeping it short: "${c.task}" first. Back to my rock.`
        : 'Keeping it short: smallest first. Back to my rock.',
  },
  {
    title: () => 'The short version',
    body: (c) =>
      c.task
        ? `${c.count} tasks. Start with "${c.task}". That's all I've got.`
        : `${c.count} tasks. Start anywhere. That's all I've got.`,
  },
  {
    title: (c) => `Morning report: ${c.count}`,
    body: (c) =>
      c.task
        ? `"${c.task}" is on top. Loyal, that one.`
        : 'All present and accounted for. Very loyal.',
  },
  {
    title: (c) => `${c.count} on today's list`,
    body: (c) =>
      c.task
        ? `No speech today. Just "${c.task}", whenever you're ready.`
        : "No speech today. Just the list, whenever you're ready.",
  },
  {
    title: () => 'A brief croak',
    body: (c) =>
      c.task
        ? `${c.count} tasks. "${c.task}" is a decent start. Your call.`
        : `${c.count} tasks. Pick any. Your call.`,
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
        ? `${c.count} tasks today. I did my part. "${c.task}" is yours.`
        : `${c.count} tasks today. I did my part. The rest is yours.`,
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

const EVENING_BASE_ONE: Line[] = [
  {
    title: () => 'One task left',
    body: (c) =>
      c.task
        ? `"${c.task}" thinks it survived the day. Surprise it.`
        : 'The last task thinks it survived the day. Surprise it.',
  },
  {
    title: () => 'One thing between you and done',
    body: (c) =>
      c.task
        ? `"${c.task}". Then the evening is all yours.`
        : 'One task. Then the evening is all yours.',
  },
  {
    title: () => 'Still one open',
    body: (c) =>
      c.task
        ? `"${c.task}" can still be beaten before bed.`
        : 'One task, and still time to beat it before bed.',
  },
  {
    title: () => 'Last one of the day',
    body: (c) =>
      c.task
        ? `"${c.task}". Clear it and tomorrow starts clean.`
        : 'Clear the last task and tomorrow starts clean.',
  },
  {
    title: () => 'So close',
    body: (c) =>
      c.task
        ? `Just "${c.task}" left. Finish strong, then do absolutely nothing.`
        : 'One task left. Finish strong, then do absolutely nothing.',
  },
  {
    title: () => 'Down to the last one',
    body: (c) =>
      c.task
        ? `"${c.task}" is all that's left. I'm already proud of today.`
        : "One task is all that's left. I'm already proud of today.",
  },
  {
    title: () => 'The final boss',
    body: (c) =>
      c.task
        ? `It's "${c.task}". Not very scary, as bosses go.`
        : 'One task. Not very scary, as bosses go.',
  },
  {
    title: () => 'One left, then smugness',
    body: (c) =>
      c.task
        ? `"${c.task}". Finish it and we both get to feel smug.`
        : 'Finish the last task and we both get to feel smug.',
  },
  {
    title: () => 'Evening! One to go',
    body: (c) =>
      c.task
        ? `"${c.task}" is the last one. Then pajamas, guilt-free.`
        : 'The last task, then pajamas, guilt-free.',
  },
  {
    title: () => 'Almost a perfect day',
    body: (c) =>
      c.task
        ? `Only "${c.task}" stands in the way. I'd hate for it to win.`
        : "Only one task stands in the way. I'd hate for it to win.",
  },
  {
    title: () => "Tonight's to-do: one",
    body: (c) =>
      c.task
        ? `"${c.task}", then the couch. In that order, ideally.`
        : 'One task, then the couch. In that order, ideally.',
  },
  {
    title: () => 'Tomorrow-you says hi',
    body: (c) =>
      c.task
        ? `They'd love "${c.task}" done tonight. Just passing it on.`
        : "They'd love the last task done tonight. Just passing it on.",
  },
];

const EVENING_BASE_MANY: Line[] = [
  {
    title: (c) => `${c.count} left, still doable`,
    body: (c) =>
      c.task
        ? `One more tonight and we sleep happy. "${c.task}" is right there.`
        : 'One more tonight and we sleep happy.',
  },
  {
    title: (c) => `${c.count} still open`,
    body: (c) =>
      c.task
        ? `No judgment. Just a frog, a list, and "${c.task}" looking easy.`
        : 'No judgment. Just a frog, a list, and one easy-looking task.',
  },
  {
    title: () => 'Evening check-in',
    body: (c) =>
      c.task
        ? `${c.count} open. "${c.task}" is the one I'd close out tonight.`
        : `${c.count} open. I'd close out the smallest one tonight.`,
  },
  {
    title: (c) => `${c.count} to go, no stress`,
    body: (c) =>
      c.task
        ? `Pick "${c.task}" and call it a night. One counts.`
        : 'Pick one and call it a night. One counts.',
  },
  {
    title: () => 'One more and we call it',
    body: (c) =>
      c.task
        ? `${c.count} left. "${c.task}" counts as the one.`
        : `${c.count} left. Any of them counts as the one.`,
  },
  {
    title: () => "The day isn't over yet",
    body: (c) =>
      c.task
        ? `${c.count} open, and "${c.task}" is right there. Just saying.`
        : `${c.count} open, and one is right there. Just saying.`,
  },
  {
    title: () => 'Quick win before bed?',
    body: (c) =>
      c.task
        ? `Knock out "${c.task}", then feet up. ${others(c)} can wait.`
        : 'Knock one out, then feet up. The rest can wait.',
  },
  {
    title: (c) => `${c.count} tasks, one evening`,
    body: (c) =>
      c.task
        ? `Do "${c.task}" and let the rest wait for morning. They're used to it.`
        : "Do one and let the rest wait for morning. They're used to it.",
  },
  {
    title: () => 'Your list is getting cocky',
    body: (c) =>
      c.task
        ? `${c.count} still open. Knock "${c.task}" off and humble it.`
        : `${c.count} still open. Knock one off and humble it.`,
  },
  {
    title: () => 'Before the couch claims you',
    body: (c) =>
      c.task
        ? `${c.count} left. Clear "${c.task}" and the couch is yours.`
        : `${c.count} left. Clear one and the couch is yours.`,
  },
  {
    title: (c) => `Evening report from ${c.frog}`,
    body: (c) =>
      c.task
        ? `${c.count} open. I'd pick off "${c.task}", then rest.`
        : `${c.count} open. I'd pick off the smallest, then rest.`,
  },
  {
    title: (c) => `Still ${c.count} on the list`,
    body: (c) =>
      c.task
        ? `"${c.task}" first. Then the pond goes quiet for the night.`
        : 'Pick one. Then the pond goes quiet for the night.',
  },
  {
    title: () => 'Not over till the frog sleeps',
    body: (c) =>
      c.task
        ? `${c.count} left, and I'm still up. "${c.task}", maybe?`
        : `${c.count} left, and I'm still up. One more, maybe?`,
  },
  {
    title: () => 'A little one before bed?',
    body: (c) =>
      c.task
        ? `"${c.task}". ${c.count} are open, but one is plenty.`
        : `${c.count} are open, but one is plenty.`,
  },
];

const EVENING_DRY_ONE: Line[] = [
  {
    title: () => 'One left',
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
    title: () => 'Evening count: one',
    body: (c) =>
      c.task
        ? `"${c.task}". No speech. You know where it lives.`
        : 'One task. No speech. You know where it lives.',
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
    title: (c) => `${c.count} still open`,
    body: (c) =>
      c.task
        ? `"${c.task}" is a good start. I'd do it myself, but no thumbs.`
        : "I'd do one myself, but no thumbs.",
  },
  {
    title: (c) => `Evening count: ${c.count}`,
    body: (c) =>
      c.task
        ? `"${c.task}" is still sitting there. So am I. We're very patient.`
        : "They're still sitting there. So am I. We're very patient.",
  },
  {
    title: (c) => `${c.count} left, for the record`,
    body: (c) =>
      c.task
        ? `"${c.task}" leads the pack. No further comment.`
        : 'Just the number. No further comment.',
  },
  {
    title: (c) => `The evening tally: ${c.count}`,
    body: (c) =>
      c.task
        ? `"${c.task}" is right on top. That's the report.`
        : "That's the whole report.",
  },
  {
    title: () => 'Quick one tonight',
    body: (c) =>
      c.task
        ? `${c.count} left. "${c.task}" if you've got it in you. If not, tomorrow.`
        : `${c.count} left. One if you've got it in you. If not, tomorrow.`,
  },
  {
    title: () => 'Not a lecture',
    body: (c) =>
      c.task
        ? `Just ${c.count} open tasks and a frog who believes you can do "${c.task}".`
        : `Just ${c.count} open tasks and a frog who believes in you.`,
  },
  {
    title: () => 'Short and sweet',
    body: (c) =>
      c.task
        ? `${c.count} to go. "${c.task}" first, or don't. Either way, goodnight.`
        : `${c.count} to go. One, or none. Either way, goodnight.`,
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
    body: () => 'One finished task and dinner is served.',
  },
  {
    title: (c) => `${c.frog}'s belly is empty`,
    body: () => "Any task feeds me. Small ones count. I'm not picky.",
  },
  {
    title: () => 'Dinner is running late',
    body: () => "Tick one thing off and I eat. I'll act surprised.",
  },
  {
    title: () => 'A small, hungry update',
    body: () => 'My belly is empty. One finished task fixes that.',
  },
  {
    title: (c) => `${c.frog} is staring at you`,
    body: () => 'Politely. Hungrily. One finished task feeds me.',
  },
  {
    title: () => 'Feed the frog?',
    body: () =>
      'Any finished task does it. Even a tiny one. Especially a tiny one.',
  },
  {
    title: () => 'Rumble from the pond',
    body: () => 'That was my stomach. One task and it settles down.',
  },
  {
    title: (c) => `${c.frog} would like a snack`,
    body: () => "Finish anything today and I'm fed. I'll be dramatic about it.",
  },
  {
    title: () => 'Tummy status: empty',
    body: () => 'One finished task feeds me. Any task at all.',
  },
  {
    title: () => 'Running on empty here',
    body: () => "One task feeds me. I'll do the happy wiggle and everything.",
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
    title: () => 'Your friends have been busy',
    body: () =>
      'Their wins dropped a fly in your pond. Claim it before midnight.',
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
      `Don't leave ${partnerName} hanging. Your half is waiting.`,
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
