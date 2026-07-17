export type FrogSpeechEvent = 'welcome' | 'tap' | 'catch' | 'quest_ready';

export type FrogFacts = {
  done: number;
  total: number;
  readyQuests: number;
  hungerPercent: number | null;
  streak: number;
  name: string | null;
  frogName: string | null;
  hour: number;
  weekday: number;
  isFirstVisitToday: boolean;
  tapCount: number;
};

export type FrogSpeechContext = Pick<
  FrogFacts,
  'hungerPercent' | 'streak' | 'name' | 'frogName'
>;

export function makeFacts(partial: Partial<FrogFacts>): FrogFacts {
  const now = new Date();
  return {
    done: 0,
    total: 0,
    readyQuests: 0,
    hungerPercent: null,
    streak: 0,
    name: null,
    frogName: null,
    hour: now.getHours(),
    weekday: now.getDay(),
    isFirstVisitToday: false,
    tapCount: 0,
    ...partial,
  };
}

type Rule = {
  tier: number;
  when?: (f: FrogFacts) => boolean;
  lines: string[];
};

const left = (f: FrogFacts) => f.total - f.done;
const isMorning = (f: FrogFacts) => f.hour >= 5 && f.hour < 11;
const isAfternoon = (f: FrogFacts) => f.hour >= 11 && f.hour < 17;
const isEvening = (f: FrogFacts) => f.hour >= 17 && f.hour < 22;
const isLateNight = (f: FrogFacts) => f.hour >= 22 || f.hour < 5;

const WELCOME_RULES: Rule[] = [
  {
    tier: 6,
    when: (f) => f.readyQuests > 0,
    lines: [
      'Psst. Your rewards\nare ready to claim! 🎁',
      'Quest complete!\nGo grab your prize.',
      "Something's waiting\non the quest board...",
    ],
  },
  {
    tier: 6,
    when: (f) => f.hungerPercent !== null && f.hungerPercent <= 20,
    lines: [
      "I'm not being dramatic.\nI AM starving.",
      '*stomach growls*\nYou heard that, right?',
      'Feed me a fly today?\nJust one. Please.',
      'Running on empty here.\nOne task = one fly!',
    ],
  },
  {
    tier: 5,
    when: (f) => f.total > 0 && f.done === f.total,
    lines: [
      "Everything's done!\nI'm just lounging now.",
      "Clean plate. Full frog.\nYou're amazing.",
      'Nothing left to do.\nNap with me?',
    ],
  },
  {
    tier: 5,
    when: (f) => f.total > 0 && f.done > 0 && left(f) > 0 && left(f) <= 2,
    lines: [
      'Only {left} left!\nFinish the plate?',
      "{left} more and we're free.\nLet's gooo.",
      'So close I can\ntaste it. Literally.',
    ],
  },
  {
    tier: 4,
    when: (f) => f.isFirstVisitToday && f.streak >= 3,
    lines: [
      "Day {streak}!\nWe're unstoppable.",
      "{streak} days in a row.\nThat's MY human.",
      'Streak day {streak}!\nStill hopping strong.',
    ],
  },
  {
    tier: 4,
    when: (f) => f.isFirstVisitToday && f.weekday === 1,
    lines: [
      "Monday again?!\nWe've got this.",
      'New week, new flies.\nHop to it!',
    ],
  },
  {
    tier: 3,
    when: (f) => f.isFirstVisitToday && isMorning(f),
    lines: [
      'Morning, {name}!\nFlies taste best early.',
      "You're up! Good.\nI was getting bored.",
      'Fresh morning,\nfresh flies. Ribbit!',
      '*yawns* Oh! Hi!\nBreakfast time?',
    ],
  },
  {
    tier: 3,
    when: (f) => f.isFirstVisitToday && isAfternoon(f),
    lines: [
      'Afternoon, {name}!\nSaved any flies for me?',
      'Perfect timing.\nI was getting peckish.',
      "Midday check-in!\nLove that for us.",
    ],
  },
  {
    tier: 3,
    when: (f) => f.isFirstVisitToday && isEvening(f),
    lines: [
      "Evening, {name}!\nLet's wrap up the day.",
      "You came back!\nThe day's not over yet.",
      'Dinner time?\nAsking for me.',
    ],
  },
  {
    tier: 3,
    when: (f) => f.isFirstVisitToday && isLateNight(f),
    lines: [
      'Up late, {name}?\nMe too. Obviously.',
      'The night shift!\nQuiet. I like it.',
      "Shhh... the pond's asleep.\nWe're not.",
    ],
  },
  {
    tier: 2,
    when: (f) => f.total === 0,
    lines: [
      'Empty list!\nAdd a fly or two?',
      "The menu's blank...\nChef? Hello?",
      'No tasks yet.\nMy belly is nervous.',
    ],
  },
  {
    tier: 1,
    lines: [
      "Hey, you're here!\nBest part of my day.",
      'Welcome back!\nThe pond missed you.',
      'Ribbit! Ready\nwhen you are.',
      'Oh good, backup\nhas arrived.',
      'Something is buzzing above...\nTry swiping me up.',
    ],
  },
];

const TAP_RULES: Rule[] = [
  {
    tier: 5,
    when: (f) => f.tapCount >= 15,
    lines: ['...', '*pretends to be a rock*', '*files a complaint*'],
  },
  {
    tier: 4,
    when: (f) => f.tapCount >= 10,
    lines: [
      '...fine. Continue.',
      'I live here.\nThis is my life now.',
      '*stares into the pond*',
      "You win.\nI'm a button now.",
    ],
  },
  {
    tier: 3,
    when: (f) => f.tapCount >= 6,
    lines: [
      'THE DISRESPECT.',
      'I am NOT a stress ball!',
      'Security! SECURITY!',
      'One more and I scream.\nRibbit-style.',
      'This is frog harassment.\nMild. But still.',
    ],
  },
  {
    tier: 2,
    when: (f) => f.tapCount >= 3,
    lines: [
      'Okay okay, I felt it.',
      'Do I look like a button?',
      'Poke a task instead!',
      'Hey! Watch the outfit.',
      "I'm starting to twitch.",
    ],
  },
  {
    tier: 1,
    lines: [
      'Hehe. That tickles!',
      'Boop received.',
      "Careful, I'm delicate.",
      'Yes? Can I help you?',
      '*happy ribbit*',
      'Ribbit! Hi!',
      'Did that buzz come from above?\nTry swiping me up.',
    ],
  },
];

const TAP_RARE_LINES = [
  "Between us?\nYou're my favorite human.",
  'I saw a dragonfly once.\nIt changed me.',
  'The pond speaks to me.\nIt says: do your tasks.',
  "I'm 87% tongue,\nyou know.",
  '{frog} the Great.\nThat is my full name.',
  'Psst... swipe me upward.\nI can hear a whole swarm.',
];

const CATCH_RULES: Rule[] = [
  {
    tier: 5,
    when: (f) => f.total >= 2 && f.done === f.total,
    lines: [
      'THE LAST ONE!\n*victory ribbit*',
      "That's the whole menu!\nWhat a feast.",
      'ALL DONE! I could cry.\nHappy frog tears.',
      'Day: conquered.\nBelly: full.',
    ],
  },
  {
    tier: 4,
    when: (f) => f.done === 1,
    lines: [
      'First fly of the day!\nAlways the sweetest.',
      "And we're off!\n*gulp*",
      'Breakfast is served!',
    ],
  },
  {
    tier: 4,
    when: (f) => f.total >= 4 && f.done === Math.ceil(f.total / 2),
    lines: [
      'Halfway there!\nStrong pace.',
      'Half the list, gone.\nJust like that.',
    ],
  },
  {
    tier: 1,
    lines: [
      '*gulp*',
      'Mm. Tasty.',
      'Nom.',
      'Delicious. Next?',
      'Down the hatch!',
      '*happy munch*',
      "Chef's kiss.",
      'Another one!',
    ],
  },
];

const QUEST_READY_RULES: Rule[] = [
  {
    tier: 1,
    lines: [
      'Reward unlocked!\nCheck the quest board 🎁',
      'You earned something!\nGo claim it.',
      "Quest complete!\nDon't leave it hanging.",
    ],
  },
];

const RULES: Record<FrogSpeechEvent, Rule[]> = {
  welcome: WELCOME_RULES,
  tap: TAP_RULES,
  catch: CATCH_RULES,
  quest_ready: QUEST_READY_RULES,
};

const RECENT_KEY = 'frog-speech:recent';
const RECENT_LIMIT = 24;

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((l) => typeof l === 'string') : [];
  } catch {
    return [];
  }
}

function recordRecent(line: string) {
  try {
    const next = [...readRecent().filter((l) => l !== line), line].slice(
      -RECENT_LIMIT,
    );
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {}
}

function lineIsUsable(line: string, f: FrogFacts): boolean {
  if (line.includes('{name}') && !f.name) return false;
  if (line.includes('{frog}') && !f.frogName) return false;
  if (line.includes('{streak}') && f.streak <= 0) return false;
  if (line.includes('{left}') && left(f) <= 0) return false;
  return true;
}

function fillLine(line: string, f: FrogFacts): string {
  return line
    .replace(/\{name\}/g, f.name ?? '')
    .replace(/\{frog\}/g, f.frogName ?? '')
    .replace(/\{streak\}/g, String(f.streak))
    .replace(/\{left\}/g, String(left(f)));
}

function pickFromPool(pool: string[], f: FrogFacts): string {
  const usable = pool.filter((l) => lineIsUsable(l, f));
  if (usable.length === 0) return '';
  const recent = readRecent();
  let candidates = usable.filter((l) => !recent.includes(l));
  if (candidates.length === 0) {
    const last = recent[recent.length - 1];
    candidates = usable.filter((l) => l !== last);
  }
  if (candidates.length === 0) candidates = usable;
  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  recordRecent(picked);
  return fillLine(picked, f);
}

export function pickFrogLine(
  event: FrogSpeechEvent,
  partial: Partial<FrogFacts>,
): string {
  const facts = makeFacts(partial);

  if (event === 'tap' && Math.random() < 0.04) {
    const rare = pickFromPool(TAP_RARE_LINES, facts);
    if (rare) return rare;
  }

  const eligible = RULES[event].filter((r) => !r.when || r.when(facts));
  if (eligible.length === 0) return '';
  const maxTier = Math.max(...eligible.map((r) => r.tier));
  const pool = eligible
    .filter((r) => r.tier === maxTier)
    .flatMap((r) => r.lines);
  const line = pickFromPool(pool, facts);
  if (line) return line;

  const fallback = RULES[event].filter((r) => !r.when);
  return pickFromPool(fallback.flatMap((r) => r.lines), facts);
}

const WELCOME_AT_KEY = 'frog-speech:welcome-at';
const WELCOME_DAY_KEY = 'frog-speech:welcome-day';
const WELCOME_COOLDOWN_MS = 15 * 60 * 1000;

export function consumeWelcomeSlot(): {
  show: boolean;
  isFirstVisitToday: boolean;
} {
  try {
    const now = Date.now();
    const today = new Date().toDateString();
    const lastAt = Number(localStorage.getItem(WELCOME_AT_KEY) ?? 0);
    const isFirstVisitToday = localStorage.getItem(WELCOME_DAY_KEY) !== today;
    if (!isFirstVisitToday && now - lastAt < WELCOME_COOLDOWN_MS) {
      return { show: false, isFirstVisitToday };
    }
    localStorage.setItem(WELCOME_AT_KEY, String(now));
    localStorage.setItem(WELCOME_DAY_KEY, today);
    return { show: true, isFirstVisitToday };
  } catch {
    return { show: true, isFirstVisitToday: false };
  }
}
