import type { StarterTaskTemplate } from './starterPlan';

const DEFAULTS: Record<string, StarterTaskTemplate[]> = {
  productivity: [
    {
      id: 'top-three',
      text: 'Pick your top 3 for today',
      cadence: 'daily',
      startTime: '09:00',
      reminder: 'at_time',
      anchor: 'Right after you sit down, before you open email.',
    },
    {
      id: 'one-focus-session',
      text: 'One 25-minute focus session',
      cadence: 'weekdays',
      startTime: '10:00',
      reminder: 'at_time',
      anchor: 'Phone face down, timer on, one task.',
    },
    {
      id: 'close-the-day',
      text: 'Close the day in 5 minutes',
      cadence: 'weekdays',
      startTime: '17:30',
      reminder: 'at_time',
      anchor: 'Right before you shut the laptop.',
    },
    {
      id: 'weekly-reset',
      text: 'Plan the week ahead',
      cadence: 'custom',
      days: [0],
      startTime: '19:00',
      reminder: 'at_time',
      anchor: 'Sunday evening, right after dinner. 15 minutes.',
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
      anchor: 'Right after you get out of bed, before you touch the phone.',
    },
    {
      id: 'three-good-things',
      text: 'Write 3 good things from today',
      cadence: 'daily',
      startTime: '21:30',
      reminder: 'at_time',
      anchor: 'In bed, right after you set your alarm.',
    },
    {
      id: 'five-minute-sit',
      text: 'Sit quietly for 5 minutes',
      cadence: 'weekdays',
      startTime: '13:00',
      reminder: 'at_time',
      anchor: 'Right after lunch, before the next thing starts.',
    },
    {
      id: 'walk-outside',
      text: 'Take a walk outside',
      cadence: 'custom',
      days: [0, 6],
      startTime: '11:00',
      anchor: 'Weekend morning. Leave the phone on the table.',
    },
  ],
  fitness: [
    {
      id: 'morning-stretch',
      text: 'Stretch for 5 minutes',
      cadence: 'daily',
      startTime: '07:30',
      reminder: 'at_time',
      anchor: 'Next to the bed, before you get dressed.',
    },
    {
      id: 'walk-ten',
      text: 'Walk for 10 minutes',
      cadence: 'daily',
      startTime: '18:30',
      reminder: 'at_time',
      anchor: 'Right after you finish eating. Around the block is enough.',
    },
    {
      id: 'water-on-waking',
      text: 'Drink a glass of water when you wake up',
      cadence: 'daily',
      startTime: '07:00',
      reminder: 'at_time',
      anchor: 'Fill the glass tonight and leave it by the bed.',
    },
    {
      id: 'workout-three',
      text: 'Train for 20 minutes',
      cadence: 'custom',
      days: [1, 3, 5],
      startTime: '17:30',
      reminder: 'at_time',
      anchor: 'Bag packed the night before. Shoes on first.',
    },
  ],
  learning: [
    {
      id: 'read-ten-pages',
      text: 'Read 10 pages',
      cadence: 'daily',
      startTime: '21:00',
      reminder: 'at_time',
      anchor: 'Book on the pillow, phone charging in another room.',
    },
    {
      id: 'one-thing-learned',
      text: 'Write down one thing you learned',
      cadence: 'daily',
      startTime: '20:30',
      reminder: 'at_time',
      anchor: 'One line, right after you close the laptop.',
    },
    {
      id: 'practice-fifteen',
      text: 'Practice for 15 minutes',
      cadence: 'weekdays',
      startTime: '19:00',
      reminder: 'at_time',
      anchor: 'Same seat, same time, right after dinner.',
    },
    {
      id: 'deep-dive',
      text: 'Spend 30 minutes going deeper',
      cadence: 'custom',
      days: [6],
      startTime: '10:00',
      anchor: 'Saturday morning, coffee first, one topic only.',
    },
  ],
  relationships: [
    {
      id: 'ask-how-it-went',
      text: 'Ask someone how their day really went',
      cadence: 'daily',
      startTime: '19:30',
      reminder: 'at_time',
      anchor: 'At dinner, phones off the table.',
    },
    {
      id: 'message-someone',
      text: 'Message someone you miss',
      cadence: 'custom',
      days: [1, 4],
      startTime: '12:00',
      reminder: 'at_time',
      anchor: 'On your lunch break. One message is enough.',
    },
    {
      id: 'call-family',
      text: 'Call someone in your family',
      cadence: 'custom',
      days: [0],
      startTime: '18:00',
      reminder: 'at_time',
      anchor: 'Same time every Sunday, so nobody has to ask.',
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
      id: 'make-your-bed',
      text: 'Make your bed',
      cadence: 'daily',
      startTime: '07:30',
      reminder: 'at_time',
      anchor: 'Before you leave the bedroom.',
    },
    {
      id: 'two-minute-tidy',
      text: '2-minute tidy before bed',
      cadence: 'daily',
      startTime: '22:00',
      reminder: 'at_time',
      anchor: 'Set a 2-minute timer. Stop when it rings.',
    },
    {
      id: 'dishes-tonight',
      text: 'Leave the kitchen clean',
      cadence: 'daily',
      startTime: '20:30',
      reminder: 'at_time',
      anchor: 'Straight after eating, while you are still up.',
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
      id: 'capture-an-idea',
      text: 'Capture one idea',
      cadence: 'daily',
      startTime: '21:00',
      reminder: 'at_time',
      anchor: 'One line in your notes, right before bed.',
    },
    {
      id: 'make-something',
      text: 'Make something for 15 minutes',
      cadence: 'custom',
      days: [1, 3, 5],
      startTime: '19:00',
      reminder: 'at_time',
      anchor: 'Right after dinner, materials already out.',
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
      anchor: 'Take the closest-to-done thing and call it finished.',
    },
  ],
  cooking: [
    {
      id: 'add-a-vegetable',
      text: 'Add a vegetable to one meal',
      cadence: 'daily',
      startTime: '13:00',
      reminder: 'at_time',
      anchor: 'Whatever is already in the fridge.',
    },
    {
      id: 'cook-at-home',
      text: 'Cook one meal at home',
      cadence: 'custom',
      days: [1, 3, 5],
      startTime: '19:00',
      reminder: 'at_time',
      anchor: 'Something simple you already know by heart.',
    },
    {
      id: 'prep-lunch',
      text: 'Prep tomorrow’s lunch',
      cadence: 'weekdays',
      startTime: '21:00',
      reminder: 'at_time',
      anchor: 'Right after you clear dinner, while the kitchen is open.',
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
      reminder: 'at_time',
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
      text: 'Try something new for 30 minutes',
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
      anchor: 'Fill the glass tonight and leave it by the bed.',
    },
    {
      id: 'daylight',
      text: 'Step outside for 10 minutes of daylight',
      cadence: 'daily',
      startTime: '08:00',
      reminder: 'at_time',
      anchor: 'Within an hour of waking, coffee in hand.',
    },
    {
      id: 'check-the-list',
      text: 'Check your list before bed',
      cadence: 'daily',
      startTime: '21:45',
      reminder: 'at_time',
      anchor: 'Ten seconds. See what you actually did today.',
    },
    {
      id: 'phone-to-bed',
      text: 'Put your phone on its charger for the night',
      cadence: 'daily',
      startTime: '22:30',
      reminder: 'at_time',
      anchor: 'Charger in another room. Set it down and walk away.',
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
