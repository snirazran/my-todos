export type WrapUpBeat =
  | 'open'
  | 'short'
  | 'long'
  | 'later'
  | 'subjectDone'
  | 'otherDone'
  | 'breakIdea';

const LINES: Record<WrapUpBeat, string[]> = {
  open: [
    "*RIBBIT!*\nThat's how it's done.",
    'I watched the whole time.\n*proud croak*',
    'Look at that focus.\nThe pond is impressed.',
    '*happy hop*\nThat one counts.',
    '{task} felt that.\n*smirks*',
    '{task} never saw\nyou coming.',
    'Focus mode: complete.\n*stretches all four legs*',
    "That was a real sitting.\nI'm taking notes.",
    '*slow clap*\nWell, slow webbed clap.',
    'The clock gave up first.\n*RIBBIT!*',
    'I kept the pond quiet.\nYou did the rest.',
    "Ding! Time's up.\nYou showed up for it.",
    'Deep breath. You did that.\n*proud croak*',
  ],
  short: [
    'Short and sweet.\nIt still counts.',
    'A quick one!\nStarting is the hard part.',
    'Tiny round, real progress.\nI saw it.',
    "*cracks knuckles*\nI don't have knuckles.",
    'Quick dip in the pond.\nRefreshing, right?',
  ],
  long: [
    'That was a marathon.\nMy legs fell asleep.',
    '*slow clap*\nThat was a deep one.',
    'So much focus.\nI need a nap after that.',
    '{task} got the\nfull treatment.',
    'Long haul, done.\n*bows respectfully*',
  ],
  later: [
    "Welcome back!\nLet's wrap up that focus.",
    'Before I forget:\nnice focus earlier!',
    'Quick check-in\non your last focus.',
    "Back already?\nLet's close that one out.",
  ],
  subjectDone: [
    '*GULP!*\nOff the list it goes.',
    'Done and done.\n*happy croak*',
    '{task}\nnever stood a chance.',
    'One less thing.\nThe list looks lighter.',
    "*RIBBIT!*\nThat's a wrap.",
    'Finished!\n*does a little hop*',
  ],
  otherDone: [
    "Bonus round!\nThat one's done too.",
    'Two for one.\n*impressed croak*',
    'Wait, that too?\n*slow clap*',
    'Look at the list shrink.\n*happy hop*',
  ],
  breakIdea: [
    "Stretch break?\nI'll stretch too. *boing*",
    "Go refill your water.\nI'll guard the pond.",
    'Rest your eyes. Look at\nsomething far away.',
    'Stand up, shake it out.\nFrogs do it all the time.',
    'A few slow breaths?\nIn… and out.',
    "Short walk? Anywhere.\nI'll be right here.",
  ],
};

const RECENT_KEY = 'focus-wrapup:recent';
const RECENT_LIMIT = 8;
const TASK_CHARS = 20;

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function recordRecent(line: string) {
  try {
    const next = [...readRecent().filter((l) => l !== line), line].slice(-RECENT_LIMIT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {}
}

function shortTask(task: string): string {
  const trimmed = task.trim();
  if (trimmed.length <= TASK_CHARS) return trimmed;
  return `${trimmed.slice(0, TASK_CHARS - 1).trimEnd()}…`;
}

export function openingBeat(focusSeconds: number, later: boolean): WrapUpBeat {
  if (later) return 'later';
  if (focusSeconds < 5 * 60) return 'short';
  if (focusSeconds >= 45 * 60) return 'long';
  return 'open';
}

export function pickWrapUpLine(beat: WrapUpBeat, task: string | null): string {
  const pool = LINES[beat].filter((line) => !line.includes('{task}') || !!task);
  const recent = readRecent();
  const fresh = pool.filter((line) => !recent.includes(line));
  const candidates = fresh.length > 0 ? fresh : pool;
  const picked = candidates[Math.floor(Math.random() * candidates.length)] ?? '';
  recordRecent(picked);
  return task ? picked.replace(/\{task\}/g, shortTask(task)) : picked;
}
