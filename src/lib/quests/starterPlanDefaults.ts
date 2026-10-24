import type { StarterTaskTemplate } from './starterPlan';

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
      emoji: '🙆',
      text: 'Stretch for 2 minutes',
      cadence: 'daily',
      moment: 'wake',
    },
    {
      id: 'walk-after-meal',
      emoji: '🚶',
      text: 'Walk for 5 minutes',
      cadence: 'daily',
      moment: 'evening',
    },
    {
      id: 'ten-squats',
      emoji: '🦵',
      text: 'Do 10 squats',
      cadence: 'daily',
      moment: 'morning',
    },
    {
      id: 'take-the-stairs',
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
      emoji: '🤗',
      text: 'Hug someone you love',
      cadence: 'daily',
      moment: 'morning',
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

export function defaultStarterTasksFor(
  ...labels: Array<string | undefined>
): StarterTaskTemplate[] {
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
    if (key && DEFAULTS[key]) return DEFAULTS[key].map((task) => ({ ...task }));
  }
  return [];
}

export const STARTER_PLAN_DEFAULT_SLUGS = Object.keys(DEFAULTS);
