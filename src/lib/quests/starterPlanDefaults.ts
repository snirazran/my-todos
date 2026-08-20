import type { StarterTaskTemplate } from './starterPlan';

const DEFAULTS: Record<string, StarterTaskTemplate[]> = {
  productivity: [
    {
      id: 'top-three',
      text: 'Pick your top 3 for today',
      cadence: 'daily',
      startTime: '09:00',
      reminder: 'at_time',
      anchor: 'First thing, before you open anything else.',
    },
    {
      id: 'one-focus-session',
      text: 'One 25-minute focus session',
      cadence: 'weekdays',
      startTime: '10:00',
      reminder: 'at_time',
      anchor: 'Phone face down, one task, timer on.',
    },
    {
      id: 'close-the-day',
      text: 'Close the day in 5 minutes',
      cadence: 'weekdays',
      startTime: '18:00',
      reminder: 'at_time',
      anchor: 'Tidy the list and set tomorrow before you log off.',
    },
    {
      id: 'weekly-reset',
      text: 'Plan the week ahead',
      cadence: 'custom',
      days: [0],
      startTime: '19:00',
      reminder: 'at_time',
      anchor: 'Sunday evening, 15 minutes, whole week in view.',
    },
    {
      id: 'inbox-sweep',
      text: 'Clear your inbox',
      cadence: 'custom',
      days: [5],
      startTime: '16:00',
      anchor: 'Friday afternoon, so Monday starts clean.',
    },
  ],
  mindfulness: [
    {
      id: 'ten-breaths',
      text: 'Take 10 slow breaths',
      cadence: 'daily',
      startTime: '08:00',
      reminder: 'at_time',
      anchor: 'Right after you get out of bed, before the phone.',
    },
    {
      id: 'three-good-things',
      text: 'Write 3 good things from today',
      cadence: 'daily',
      startTime: '21:30',
      reminder: 'at_time',
      anchor: 'In bed, once the lights are low.',
    },
    {
      id: 'five-minute-sit',
      text: 'Sit quietly for 5 minutes',
      cadence: 'weekdays',
      startTime: '13:00',
      anchor: 'After lunch, before the next thing starts.',
    },
    {
      id: 'walk-without-phone',
      text: 'Take a walk without your phone',
      cadence: 'custom',
      days: [0, 6],
      startTime: '11:00',
      anchor: 'Weekend morning, no headphones, just outside.',
    },
  ],
  fitness: [
    {
      id: 'walk-ten',
      text: 'Walk for 10 minutes',
      cadence: 'daily',
      startTime: '18:00',
      reminder: 'at_time',
      anchor: 'Right after dinner, around the block is enough.',
    },
    {
      id: 'morning-stretch',
      text: 'Stretch for 5 minutes',
      cadence: 'daily',
      startTime: '07:30',
      reminder: 'at_time',
      anchor: 'Next to the bed, before you get dressed.',
    },
    {
      id: 'workout-three',
      text: 'Train for 20 minutes',
      cadence: 'custom',
      days: [1, 3, 5],
      startTime: '17:30',
      reminder: 'at_time',
      anchor: 'Shoes on first — that is the hardest part.',
    },
    {
      id: 'water-on-waking',
      text: 'Drink a glass of water when you wake up',
      cadence: 'daily',
      startTime: '07:00',
      anchor: 'Leave the glass by the sink tonight.',
    },
  ],
  learning: [
    {
      id: 'read-ten-pages',
      text: 'Read 10 pages',
      cadence: 'daily',
      startTime: '21:00',
      reminder: 'at_time',
      anchor: 'Book on the pillow, phone in the other room.',
    },
    {
      id: 'practice-fifteen',
      text: 'Practice for 15 minutes',
      cadence: 'weekdays',
      startTime: '19:00',
      reminder: 'at_time',
      anchor: 'Same seat, same time — that is what makes it stick.',
    },
    {
      id: 'one-thing-learned',
      text: 'Write down one thing you learned',
      cadence: 'weekdays',
      startTime: '20:30',
      anchor: 'One line is plenty.',
    },
    {
      id: 'deep-dive',
      text: 'Spend an hour going deeper',
      cadence: 'custom',
      days: [6],
      startTime: '10:00',
      anchor: 'Saturday morning, one topic, no multitasking.',
    },
  ],
  relationships: [
    {
      id: 'message-someone',
      text: 'Message someone you miss',
      cadence: 'custom',
      days: [1, 4],
      startTime: '12:00',
      reminder: 'at_time',
      anchor: 'One message. It does not have to be deep.',
    },
    {
      id: 'ask-how-it-went',
      text: 'Ask someone how their day really went',
      cadence: 'daily',
      startTime: '19:30',
      anchor: 'At dinner, phones off the table.',
    },
    {
      id: 'call-family',
      text: 'Call someone in your family',
      cadence: 'custom',
      days: [0],
      startTime: '18:00',
      reminder: 'at_time',
      anchor: 'Sunday call — same time every week.',
    },
    {
      id: 'plan-something',
      text: 'Plan something with a friend',
      cadence: 'custom',
      days: [3],
      startTime: '20:00',
      anchor: 'Pick a day and send it. Details later.',
    },
  ],
  home: [
    {
      id: 'two-minute-tidy',
      text: '2-minute tidy before bed',
      cadence: 'daily',
      startTime: '22:00',
      reminder: 'at_time',
      anchor: 'Set a timer. Stop when it rings.',
    },
    {
      id: 'make-your-bed',
      text: 'Make your bed',
      cadence: 'daily',
      startTime: '07:30',
      anchor: 'Before you leave the bedroom.',
    },
    {
      id: 'dishes-tonight',
      text: 'Leave the kitchen clean',
      cadence: 'daily',
      startTime: '20:30',
      anchor: 'Straight after eating, while you are already up.',
    },
    {
      id: 'one-room-reset',
      text: 'Reset one room for 15 minutes',
      cadence: 'custom',
      days: [6],
      startTime: '11:00',
      anchor: 'One room, one timer, music on.',
    },
  ],
  creativity: [
    {
      id: 'make-something',
      text: 'Make something for 15 minutes',
      cadence: 'custom',
      days: [1, 3, 5],
      startTime: '19:00',
      reminder: 'at_time',
      anchor: 'Bad work counts. Starting is the whole point.',
    },
    {
      id: 'capture-an-idea',
      text: 'Capture one idea',
      cadence: 'daily',
      startTime: '21:00',
      anchor: 'Whatever caught your eye today.',
    },
    {
      id: 'study-what-you-love',
      text: 'Study one thing you love',
      cadence: 'custom',
      days: [0],
      startTime: '17:00',
      anchor: 'Look closely at how someone else did it.',
    },
    {
      id: 'finish-something-small',
      text: 'Finish one small piece',
      cadence: 'custom',
      days: [6],
      startTime: '15:00',
      anchor: 'Done beats perfect.',
    },
  ],
  cooking: [
    {
      id: 'cook-at-home',
      text: 'Cook one meal at home',
      cadence: 'custom',
      days: [1, 3, 5],
      startTime: '19:00',
      reminder: 'at_time',
      anchor: 'Something simple you already know how to make.',
    },
    {
      id: 'add-a-vegetable',
      text: 'Add a vegetable to one meal',
      cadence: 'daily',
      startTime: '13:00',
      anchor: 'Whatever is already in the fridge.',
    },
    {
      id: 'plan-the-meals',
      text: 'Plan this week’s meals',
      cadence: 'custom',
      days: [0],
      startTime: '17:00',
      reminder: 'at_time',
      anchor: 'Three dinners is enough to start.',
    },
    {
      id: 'prep-lunch',
      text: 'Prep tomorrow’s lunch',
      cadence: 'weekdays',
      startTime: '21:00',
      anchor: 'While the kitchen is still open.',
    },
  ],
  hobbies: [
    {
      id: 'hobby-twenty',
      text: 'Spend 20 minutes on your hobby',
      cadence: 'custom',
      days: [2, 4],
      startTime: '19:30',
      reminder: 'at_time',
      anchor: 'Gear out and ready the night before.',
    },
    {
      id: 'protect-an-evening',
      text: 'Keep Friday evening for fun',
      cadence: 'custom',
      days: [5],
      startTime: '19:00',
      anchor: 'Nothing productive allowed.',
    },
    {
      id: 'play-something',
      text: 'Play something you love',
      cadence: 'custom',
      days: [6],
      startTime: '16:00',
      anchor: 'The thing you never make time for.',
    },
    {
      id: 'try-something-new',
      text: 'Try something new for an hour',
      cadence: 'custom',
      days: [0],
      startTime: '14:00',
      anchor: 'Being bad at it is the fun part.',
    },
  ],
  habits: [
    {
      id: 'water-first',
      text: 'Drink a glass of water when you wake up',
      cadence: 'daily',
      startTime: '07:00',
      reminder: 'at_time',
      anchor: 'Leave the glass by the sink tonight.',
    },
    {
      id: 'daylight',
      text: 'Step outside for daylight',
      cadence: 'daily',
      startTime: '08:30',
      anchor: 'Five minutes out the door, coffee in hand.',
    },
    {
      id: 'no-screens',
      text: 'No screens 30 minutes before bed',
      cadence: 'daily',
      startTime: '22:30',
      reminder: 'at_time',
      anchor: 'Charge the phone outside the bedroom.',
    },
    {
      id: 'check-the-list',
      text: 'Check your list before bed',
      cadence: 'daily',
      startTime: '21:45',
      anchor: 'Ten seconds. See what you actually did today.',
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
