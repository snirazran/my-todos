import type {
  StarterBarrier,
  StarterBarrierSet,
  StarterProfile,
  StarterTaskTemplate,
} from './starterPlan';

export const STARTER_BASICS: StarterTaskTemplate[] = [
  {
    id: 'water-first',
    emoji: '💧',
    text: 'Drink a glass of water',
    cadence: 'daily',
    moment: 'wake',
  },
  {
    id: 'make-your-bed',
    emoji: '🛏️',
    text: 'Make your bed',
    cadence: 'daily',
    moment: 'morning',
  },
];

const PROFILE_EASY_WINS: Record<
  'exhale' | 'windDown' | 'standUp' | 'curtains',
  StarterTaskTemplate
> = {
  exhale: {
    id: 'ew-long-exhale',
    emoji: '🌬️',
    text: 'Take 3 slow breaths with a long exhale',
    cadence: 'daily',
    moment: 'day',
    group: 'breathing',
    reason: 'For stressful moments',
  },
  windDown: {
    id: 'ew-phone-wind-down',
    emoji: '🔌',
    text: 'Put your phone on its charger 30 minutes before bed',
    cadence: 'daily',
    moment: 'night',
    group: 'phone-charger',
    reason: 'For better nights',
  },
  standUp: {
    id: 'ew-stand-stretch',
    emoji: '🙆',
    text: 'Stand up and stretch for 1 minute',
    cadence: 'daily',
    moment: 'day',
    group: 'stretch',
    movement: true,
    reason: 'For more movement',
  },
  curtains: {
    id: 'ew-open-curtains',
    emoji: '☀️',
    text: 'Open your curtains right after you wake up',
    cadence: 'daily',
    moment: 'wake',
    group: 'daylight',
    reason: 'For brighter mornings',
  },
};

export function starterEasyWinsFor(profile: StarterProfile): StarterTaskTemplate[] {
  const wins: StarterTaskTemplate[] = [];
  if (profile.overwhelm === 'weekly') wins.push(PROFILE_EASY_WINS.exhale);
  if (profile.sleep === 'under-5' || profile.sleep === '5-7') wins.push(PROFILE_EASY_WINS.windDown);
  if (profile.activity === 'sitting') wins.push(PROFILE_EASY_WINS.standUp);
  if (profile.sleep === 'over-9') wins.push(PROFILE_EASY_WINS.curtains);
  return [...wins, ...STARTER_BASICS].map((task) => ({ ...task }));
}

export const GENTLE_MOVE_TASK: StarterTaskTemplate = {
  id: 'gentle-move',
  emoji: '🌱',
  text: 'Move in a way that feels good for 1 minute',
  cadence: 'daily',
  moment: 'morning',
  group: 'stretch',
};

const DEFAULTS: Record<string, StarterTaskTemplate[]> = {
  productivity: [
    {
      id: 'top-three',
      emoji: '🎯',
      text: 'Pick your top 3 for today',
      cadence: 'daily',
      moment: 'morning',
    },
    {
      id: 'plan-tomorrow',
      emoji: '📝',
      text: "Write tomorrow's to-do list",
      cadence: 'daily',
      moment: 'night',
    },
    {
      id: 'focus-ten',
      emoji: '⏱️',
      text: 'Focus on one task for 10 minutes',
      cadence: 'daily',
      moment: 'day',
    },
    {
      id: 'two-minute-task',
      emoji: '✅',
      text: 'Finish one 2-minute task',
      cadence: 'daily',
      moment: 'day',
    },
  ],
  mindfulness: [
    {
      id: 'slow-breaths',
      group: 'breathing',
      emoji: '🌬️',
      text: 'Take 5 slow breaths',
      cadence: 'daily',
      moment: 'wake',
    },
    {
      id: 'one-good-thing',
      emoji: '✨',
      text: 'Write down one good thing from today',
      cadence: 'daily',
      moment: 'night',
    },
    {
      id: 'step-outside',
      emoji: '🌤️',
      text: 'Step outside for 2 minutes',
      cadence: 'daily',
      moment: 'day',
    },
    {
      id: 'quiet-minute',
      emoji: '🧘',
      text: 'Sit quietly for 1 minute',
      cadence: 'daily',
      moment: 'evening',
    },
  ],
  fitness: [
    {
      id: 'morning-stretch',
      group: 'stretch',
      movement: true,
      emoji: '🙆',
      text: 'Stretch for 2 minutes',
      cadence: 'daily',
      moment: 'wake',
    },
    {
      id: 'walk-after-meal',
      movement: true,
      emoji: '🚶',
      text: 'Walk for 5 minutes',
      cadence: 'daily',
      moment: 'evening',
    },
    {
      id: 'ten-squats',
      movement: true,
      emoji: '🦵',
      text: 'Do 10 squats',
      cadence: 'daily',
      moment: 'morning',
    },
    {
      id: 'take-the-stairs',
      movement: true,
      emoji: '🪜',
      text: 'Take the stairs once',
      cadence: 'daily',
      moment: 'day',
    },
  ],
  learning: [
    {
      id: 'read-five',
      emoji: '📖',
      text: 'Read 5 pages',
      cadence: 'daily',
      moment: 'night',
    },
    {
      id: 'learn-five',
      emoji: '🧠',
      text: 'Learn something for 5 minutes',
      cadence: 'daily',
      moment: 'morning',
    },
    {
      id: 'one-thing-learned',
      emoji: '💡',
      text: 'Write down one thing you learned',
      cadence: 'daily',
      moment: 'evening',
    },
  ],
  relationships: [
    {
      id: 'kind-message',
      emoji: '💬',
      text: 'Send someone a kind message',
      cadence: 'daily',
      moment: 'day',
    },
    {
      id: 'ask-their-day',
      company: true,
      emoji: '🗣️',
      text: 'Ask someone how their day really went',
      cadence: 'daily',
      moment: 'evening',
    },
    {
      id: 'say-thanks',
      emoji: '🙏',
      text: 'Thank someone out loud',
      cadence: 'daily',
      moment: 'day',
    },
    {
      id: 'hug-someone',
      company: true,
      emoji: '🤗',
      text: 'Hug someone you love',
      cadence: 'daily',
      moment: 'morning',
    },
    {
      id: 'small-chat',
      emoji: '👋',
      text: 'Have a quick chat with someone you pass',
      cadence: 'daily',
      moment: 'day',
    },
  ],
  home: [
    {
      id: 'two-minute-tidy',
      emoji: '🧺',
      text: 'Tidy up for 2 minutes',
      cadence: 'daily',
      moment: 'night',
    },
    {
      id: 'kitchen-clean',
      emoji: '🍽️',
      text: 'Leave the kitchen clean',
      cadence: 'daily',
      moment: 'evening',
    },
    {
      id: 'clear-one-surface',
      emoji: '🧽',
      text: 'Clear one surface',
      cadence: 'daily',
      moment: 'morning',
    },
  ],
  creativity: [
    {
      id: 'capture-an-idea',
      emoji: '💭',
      text: 'Write down one idea',
      cadence: 'daily',
      moment: 'night',
    },
    {
      id: 'make-ten',
      emoji: '🎨',
      text: 'Make something for 10 minutes',
      cadence: 'daily',
      moment: 'evening',
    },
    {
      id: 'one-photo',
      emoji: '📸',
      text: 'Take a photo of something beautiful',
      cadence: 'daily',
      moment: 'day',
    },
    {
      id: 'two-minute-doodle',
      emoji: '✏️',
      text: 'Doodle for 2 minutes',
      cadence: 'daily',
      moment: 'day',
    },
  ],
  cooking: [
    {
      id: 'add-a-vegetable',
      emoji: '🥦',
      text: 'Add a vegetable to one meal',
      cadence: 'daily',
      moment: 'day',
    },
    {
      id: 'fruit-with-breakfast',
      emoji: '🍎',
      text: 'Eat a piece of fruit',
      cadence: 'daily',
      moment: 'morning',
    },
    {
      id: 'decide-tomorrows-dinner',
      emoji: '🍳',
      text: "Decide tomorrow's dinner",
      cadence: 'daily',
      moment: 'evening',
    },
  ],
  hobbies: [
    {
      id: 'hobby-ten',
      emoji: '🎸',
      text: 'Spend 10 minutes on your hobby',
      cadence: 'daily',
      moment: 'evening',
    },
    {
      id: 'just-for-fun',
      emoji: '🎲',
      text: 'Do one thing just for fun',
      cadence: 'daily',
      moment: 'evening',
    },
    {
      id: 'one-song',
      emoji: '🎧',
      text: 'Listen to a song you love',
      cadence: 'daily',
      moment: 'morning',
    },
  ],
  habits: [
    {
      id: 'daylight',
      group: 'daylight',
      emoji: '☀️',
      text: 'Get 5 minutes of daylight',
      cadence: 'daily',
      moment: 'morning',
    },
    {
      id: 'floss-one-tooth',
      emoji: '🦷',
      text: 'Floss one tooth',
      cadence: 'daily',
      moment: 'night',
    },
    {
      id: 'phone-on-charger',
      group: 'phone-charger',
      emoji: '🔌',
      text: 'Put your phone on its charger',
      cadence: 'daily',
      moment: 'night',
    },
    {
      id: 'check-tomorrow',
      emoji: '📋',
      text: "Check tomorrow's list",
      cadence: 'daily',
      moment: 'night',
    },
  ],
};

const barrier = (
  id: string,
  emoji: string,
  label: string,
  reason: string,
  task: Omit<StarterTaskTemplate, 'cadence'>,
): StarterBarrier => ({ id, emoji, label, reason, task: { ...task, cadence: 'daily' } });

const BARRIERS: Record<string, StarterBarrierSet> = {
  productivity: {
    title: 'What gets in the way of getting things done?',
    options: [
      barrier('put-off', '⏳', 'I put things off', 'For the task you keep avoiding', {
        id: 'b-two-minutes-avoided',
        emoji: '⏱️',
        text: "Do 2 minutes of the task you're avoiding",
        moment: 'day',
      }),
      barrier('distracted', '📱', 'I get distracted', 'For when focus slips', {
        id: 'b-phone-face-down',
        emoji: '📵',
        text: 'Put your phone face down while you work',
        moment: 'day',
      }),
      barrier('stuck', '🌀', "I don't know where to start", 'For a clear start', {
        id: 'b-first-step',
        emoji: '✏️',
        text: 'Write the first step of one task',
        moment: 'morning',
      }),
      barrier('forget', '🤔', 'I forget things', 'For when things slip your mind', {
        id: 'b-list-after-breakfast',
        emoji: '📋',
        text: 'Check your list right after breakfast',
        moment: 'morning',
      }),
    ],
  },
  mindfulness: {
    title: 'What makes it hard to slow down?',
    options: [
      barrier('rushing', '🏃', "I'm always rushing", 'For rushed mornings', {
        id: 'b-breaths-before-up',
        group: 'breathing',
        emoji: '🌬️',
        text: 'Take 3 slow breaths before you get up',
        moment: 'wake',
      }),
      barrier('busy-mind', '🌀', "My mind won't switch off", 'For a busy mind', {
        id: 'b-brain-dump',
        emoji: '📝',
        text: "Write down what's on your mind before bed",
        moment: 'night',
      }),
      barrier('restless', '⚡', 'Sitting still feels hard', 'No sitting needed', {
        id: 'b-slow-sip',
        emoji: '☕',
        text: 'Savor the first sip of your morning drink',
        moment: 'morning',
      }),
      barrier('not-sure', '🤷', "I'm not sure how", 'An easy way in', {
        id: 'b-drop-shoulders',
        emoji: '💆',
        text: 'Drop your shoulders and unclench your jaw',
        moment: 'day',
      }),
    ],
  },
  fitness: {
    title: 'What gets in the way of moving more?',
    options: [
      barrier('no-time', '⏰', "I don't have time", 'For busy days', {
        id: 'b-walk-and-talk',
        movement: true,
        emoji: '🚶',
        text: 'Walk during one phone call',
        moment: 'day',
      }),
      barrier('low-energy', '🔋', "I'm low on energy", 'For low-energy days', {
        id: 'b-wake-stretch',
        group: 'stretch',
        movement: true,
        emoji: '🙆',
        text: 'Stretch for 1 minute after you wake up',
        moment: 'wake',
      }),
      barrier('chore', '😑', 'Exercise feels like a chore', 'Fun counts too', {
        id: 'b-dance',
        movement: true,
        emoji: '💃',
        text: 'Dance to one song',
        moment: 'evening',
      }),
      barrier('no-plan', '🤷', "I don't know where to start", 'No plan needed', {
        id: 'b-brush-squats',
        movement: true,
        emoji: '🦵',
        text: 'Do 5 squats after brushing your teeth',
        moment: 'morning',
      }),
    ],
  },
  learning: {
    title: 'What makes learning hard to keep up?',
    options: [
      barrier('no-time', '⏰', "I don't have time", 'For busy days', {
        id: 'b-one-page',
        emoji: '📖',
        text: 'Read 1 page before bed',
        moment: 'night',
      }),
      barrier('motivation', '🔋', 'I lose motivation', 'Follow your curiosity', {
        id: 'b-look-it-up',
        emoji: '💡',
        text: "Look up one thing you're curious about",
        moment: 'day',
      }),
      barrier('focus', '📱', 'I lose focus', 'For when focus slips', {
        id: 'b-phone-free-learning',
        emoji: '📵',
        text: 'Learn for 5 minutes with your phone in another room',
        moment: 'day',
      }),
      barrier('forget', '🧠', 'I forget what I learn', 'For things you want to keep', {
        id: 'b-teach-back',
        emoji: '🗣️',
        text: 'Explain one thing you learned out loud',
        moment: 'evening',
      }),
    ],
  },
  relationships: {
    title: 'What makes staying close to people hard?',
    options: [
      barrier('drift', '🌊', 'I lose touch with people', 'For people you miss', {
        id: 'b-send-photo',
        emoji: '📸',
        text: 'Send a photo to someone you miss',
        moment: 'day',
      }),
      barrier('busy', '⏰', "I'm too busy", 'For busy days', {
        id: 'b-say-hi',
        emoji: '💬',
        text: 'Text someone just to say hi',
        moment: 'day',
      }),
      barrier('awkward', '🙈', 'Reaching out feels awkward', 'An easy way in', {
        id: 'b-reply-friend',
        emoji: '↩️',
        text: 'Reply to one message from a friend',
        moment: 'day',
      }),
      barrier('phone', '📱', 'My phone gets in the way', 'For more time together', {
        id: 'b-phone-free-meal',
        emoji: '🍽️',
        text: 'Put your phone away during one meal',
        moment: 'evening',
      }),
    ],
  },
  home: {
    title: 'What makes keeping your home tidy hard?',
    options: [
      barrier('put-off', '⏳', 'I put chores off', 'For chores you put off', {
        id: 'b-dishes-after-eating',
        emoji: '🍽️',
        text: 'Wash your dishes right after you eat',
        moment: 'evening',
      }),
      barrier('piles-up', '🧺', 'Mess piles up fast', 'For mess that piles up', {
        id: 'b-five-things',
        emoji: '🧺',
        text: 'Put 5 things back where they belong',
        moment: 'evening',
      }),
      barrier('stuck', '🌀', "I don't know where to start", 'Start small', {
        id: 'b-clear-surface',
        emoji: '🧹',
        text: 'Clear off one small surface',
        moment: 'day',
      }),
      barrier('let-go', '🤔', "It's hard to let things go", 'One thing at a time', {
        id: 'b-donate-one',
        emoji: '🛍️',
        text: "Put one thing you don't use in a donate bag",
        moment: 'day',
      }),
    ],
  },
  creativity: {
    title: 'What gets in the way of creating?',
    options: [
      barrier('no-time', '⏰', "I don't have time", 'For busy days', {
        id: 'b-make-two',
        emoji: '🎨',
        text: 'Make something for 2 minutes',
        moment: 'evening',
      }),
      barrier('not-good-enough', '😬', "I worry it won't be good enough", 'Messy counts', {
        id: 'b-messy-sketch',
        emoji: '✏️',
        text: 'Make one quick, messy sketch',
        moment: 'evening',
      }),
      barrier('no-ideas', '💭', 'I run out of ideas', 'For when ideas run dry', {
        id: 'b-save-inspiration',
        emoji: '📌',
        text: 'Save one thing that inspires you',
        moment: 'day',
      }),
      barrier('motivation', '🔋', 'I lose motivation', 'Small steps keep it going', {
        id: 'b-add-one-thing',
        emoji: '🧩',
        text: 'Add one small thing to a project',
        moment: 'evening',
      }),
    ],
  },
  cooking: {
    title: 'What makes eating well hard?',
    options: [
      barrier('no-time', '⏰', "I don't have time to cook", 'For busy days', {
        id: 'b-prep-one',
        emoji: '🥕',
        text: 'Prep one ingredient for tomorrow',
        moment: 'evening',
      }),
      barrier('convenience', '🍪', "I grab whatever's quick", 'Easy to grab', {
        id: 'b-fruit-in-sight',
        emoji: '🍎',
        text: 'Put a piece of fruit where you can see it',
        moment: 'morning',
      }),
      barrier('no-ideas', '🤷', "I don't know what to make", 'For when ideas run dry', {
        id: 'b-save-recipe',
        emoji: '📖',
        text: "Save one recipe you'd like to try",
        moment: 'day',
      }),
      barrier('cost', '💸', 'Healthy food feels pricey', 'Easy on your wallet', {
        id: 'b-pack-snack',
        emoji: '🥜',
        text: 'Pack a snack from home for tomorrow',
        moment: 'evening',
      }),
    ],
  },
  hobbies: {
    title: 'What keeps you from your hobbies?',
    options: [
      barrier('no-time', '⏰', "I don't have time", 'For busy days', {
        id: 'b-hobby-break',
        emoji: '☕',
        text: 'Do your hobby during one break',
        moment: 'day',
      }),
      barrier('tired', '🔋', "I'm too tired by evening", 'For tired evenings', {
        id: 'b-hobby-after-dinner',
        emoji: '🎨',
        text: 'Do 2 minutes of your hobby after dinner',
        moment: 'evening',
      }),
      barrier('phone', '📱', 'My phone takes over', 'For scroll-heavy evenings', {
        id: 'b-swap-scroll',
        emoji: '🔄',
        text: 'Swap 10 minutes of scrolling for your hobby',
        moment: 'evening',
      }),
      barrier('guilty', '😅', 'Fun feels like wasted time', 'Rest counts too', {
        id: 'b-guilt-free-hobby',
        emoji: '🎸',
        text: 'Spend 2 guilt-free minutes on your hobby',
        moment: 'evening',
      }),
    ],
  },
  habits: {
    title: 'What makes habits hard to keep?',
    options: [
      barrier('forget', '🤔', 'I forget', 'For when things slip your mind', {
        id: 'b-list-after-breakfast',
        emoji: '📋',
        text: 'Check your list right after breakfast',
        moment: 'morning',
      }),
      barrier('fade', '📉', 'I start strong, then stop', 'Tiny on purpose', {
        id: 'b-floss-one',
        emoji: '🦷',
        text: 'Floss one tooth',
        moment: 'night',
      }),
      barrier('all-over', '🔀', 'Every day looks different', 'One steady anchor', {
        id: 'b-charger-before-bed',
        group: 'phone-charger',
        emoji: '🔌',
        text: 'Put your phone on its charger before bed',
        moment: 'night',
      }),
      barrier('motivation', '🔋', 'I lose motivation', 'For a brighter start', {
        id: 'b-daylight',
        group: 'daylight',
        emoji: '☀️',
        text: 'Get 5 minutes of daylight after you wake up',
        moment: 'morning',
      }),
    ],
  },
};

const ALIASES: Record<string, string> = {
  work: 'productivity',
  focus: 'productivity',
  mindfulnesses: 'mindfulness',
  mind: 'mindfulness',
  calm: 'mindfulness',
  wellness: 'mindfulness',
  health: 'fitness',
  sport: 'fitness',
  sports: 'fitness',
  exercise: 'fitness',
  movement: 'fitness',
  study: 'learning',
  learn: 'learning',
  school: 'learning',
  social: 'relationships',
  friends: 'relationships',
  family: 'relationships',
  house: 'home',
  chores: 'home',
  cleaning: 'home',
  creative: 'creativity',
  art: 'creativity',
  making: 'creativity',
  cook: 'cooking',
  food: 'cooking',
  kitchen: 'cooking',
  eating: 'cooking',
  hobby: 'hobbies',
  fun: 'hobbies',
  play: 'hobbies',
  habit: 'habits',
  routine: 'habits',
  routines: 'habits',
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-');
}

function resolveDefaultKey(labels: Array<string | undefined>): string | undefined {
  const keys = Object.keys(DEFAULTS);
  const resolve = (slug: string): string | undefined => {
    if (!slug) return undefined;
    if (DEFAULTS[slug]) return slug;
    if (ALIASES[slug] && DEFAULTS[ALIASES[slug]]) return ALIASES[slug];
    return keys.find(
      (key) =>
        (slug.length >= 5 && key.startsWith(slug.slice(0, 5))) ||
        (key.length >= 5 && slug.startsWith(key.slice(0, 5))),
    );
  };

  for (const label of labels) {
    if (!label) continue;
    const slug = slugify(label);
    const key = resolve(slug) ?? slug.split('-').map(resolve).find(Boolean);
    if (key) return key;
  }
  return undefined;
}

export function defaultStarterTasksFor(
  ...labels: Array<string | undefined>
): StarterTaskTemplate[] {
  const key = resolveDefaultKey(labels);
  return key && DEFAULTS[key] ? DEFAULTS[key].map((task) => ({ ...task })) : [];
}

export function defaultBarriersFor(
  ...labels: Array<string | undefined>
): StarterBarrierSet | null {
  const key = resolveDefaultKey(labels);
  return key && BARRIERS[key] ? BARRIERS[key] : null;
}

const AREA_PRESENTATION: Record<string, { emoji: string; label: string }> = {
  productivity: { emoji: '🎯', label: 'Get things done' },
  mindfulness: { emoji: '🧘', label: 'Slow down and be present' },
  fitness: { emoji: '👟', label: 'Be more active' },
  learning: { emoji: '📚', label: 'Learn something new' },
  relationships: { emoji: '💞', label: 'Stay close to people I care about' },
  home: { emoji: '🏡', label: 'Make my space feel like home' },
  creativity: { emoji: '🎨', label: 'Make more of my own stuff' },
  cooking: { emoji: '🍳', label: 'Cook more and eat better' },
  hobbies: { emoji: '🎲', label: 'Make room for fun' },
  habits: { emoji: '🌱', label: 'Build habits that stick' },
};

export function defaultAreaPresentationFor(
  ...labels: Array<string | undefined>
): { emoji: string; label: string } | null {
  const key = resolveDefaultKey(labels);
  return key && AREA_PRESENTATION[key] ? AREA_PRESENTATION[key] : null;
}

export const STARTER_PLAN_DEFAULT_SLUGS = Object.keys(DEFAULTS);
