export type IdeaMoment = 'morning' | 'day' | 'evening' | 'night' | 'any';

export type IdeaCategoryId =
  | 'easy'
  | 'move'
  | 'food'
  | 'sleep'
  | 'calm'
  | 'focus'
  | 'home'
  | 'people'
  | 'selfcare'
  | 'money'
  | 'learn'
  | 'unplug';

export type IdeaCategory = {
  id: IdeaCategoryId;
  label: string;
  tagName: string;
  color: string;
  tagAliases: string[];
};

export type HabitIdea = {
  id: string;
  categoryId: IdeaCategoryId;
  emoji: string;
  text: string;
  when: IdeaMoment;
  weekly?: boolean;
};

export const IDEA_CATEGORIES: IdeaCategory[] = [
  {
    id: 'easy',
    label: 'Easy wins',
    tagName: 'Easy wins',
    color: '#22c55e',
    tagAliases: ['easy wins', 'basics', 'habits', 'daily'],
  },
  {
    id: 'move',
    label: 'Move',
    tagName: 'Movement',
    color: '#f97316',
    tagAliases: ['movement', 'fitness', 'exercise', 'workout', 'sport', 'gym', 'health'],
  },
  {
    id: 'food',
    label: 'Eat & drink',
    tagName: 'Food',
    color: '#84cc16',
    tagAliases: ['food', 'nutrition', 'cooking', 'eating', 'diet', 'meals'],
  },
  {
    id: 'sleep',
    label: 'Sleep',
    tagName: 'Sleep',
    color: '#6366f1',
    tagAliases: ['sleep', 'rest', 'bedtime', 'night'],
  },
  {
    id: 'calm',
    label: 'Calm',
    tagName: 'Calm',
    color: '#14b8a6',
    tagAliases: ['calm', 'mindfulness', 'mind', 'meditation', 'mental health', 'wellbeing'],
  },
  {
    id: 'focus',
    label: 'Focus',
    tagName: 'Focus',
    color: '#ef4444',
    tagAliases: ['focus', 'productivity', 'work', 'study', 'school', 'career'],
  },
  {
    id: 'home',
    label: 'Home',
    tagName: 'Home',
    color: '#06b6d4',
    tagAliases: ['home', 'house', 'chores', 'cleaning', 'tidy'],
  },
  {
    id: 'people',
    label: 'People',
    tagName: 'People',
    color: '#ec4899',
    tagAliases: ['people', 'relationships', 'family', 'friends', 'social', 'connection'],
  },
  {
    id: 'selfcare',
    label: 'Self-care',
    tagName: 'Self-care',
    color: '#f59e0b',
    tagAliases: ['self-care', 'self care', 'selfcare', 'hygiene', 'me time', 'personal'],
  },
  {
    id: 'money',
    label: 'Money',
    tagName: 'Money',
    color: '#eab308',
    tagAliases: ['money', 'finance', 'finances', 'budget', 'savings'],
  },
  {
    id: 'learn',
    label: 'Learn',
    tagName: 'Learning',
    color: '#a855f7',
    tagAliases: ['learning', 'learn', 'reading', 'growth', 'skills', 'creativity', 'hobbies'],
  },
  {
    id: 'unplug',
    label: 'Unplug',
    tagName: 'Unplug',
    color: '#3b82f6',
    tagAliases: ['unplug', 'screen time', 'digital', 'phone', 'offline'],
  },
];

type Row = [emoji: string, text: string, when: IdeaMoment, weekly?: boolean];

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

const group = (categoryId: IdeaCategoryId, rows: Row[]): HabitIdea[] =>
  rows.map(([emoji, text, when, weekly]) => ({
    id: `${categoryId}-${slug(text)}`,
    categoryId,
    emoji,
    text,
    when,
    weekly: weekly || undefined,
  }));

export const HABIT_IDEAS: HabitIdea[] = [
  ...group('easy', [
    ['💧', 'Drink a glass of water', 'morning'],
    ['🛏️', 'Make your bed', 'morning'],
    ['🪟', 'Open a window for fresh air', 'morning'],
    ['🧼', 'Wash your face', 'morning'],
    ['👕', 'Get dressed for the day', 'morning'],
    ['🙆', 'Stand up and stretch', 'day'],
    ['🌤️', 'Step outside for one minute', 'day'],
    ['✅', 'Finish one tiny task', 'day'],
    ['🌬️', 'Take three slow breaths', 'any'],
    ['🎵', 'Play one song you love', 'evening'],
    ['🧺', 'Put one thing back where it belongs', 'evening'],
    ['🪥', 'Brush your teeth before bed', 'night'],
  ]),
  ...group('move', [
    ['🚶', 'Walk for 10 minutes after a meal', 'day'],
    ['🙆', 'Stretch for two minutes after waking up', 'morning'],
    ['🦵', 'Do 10 squats while the kettle boils', 'morning'],
    ['🪜', 'Take the stairs once today', 'day'],
    ['📞', 'Walk while you take a phone call', 'day'],
    ['⏰', 'Stand up once every hour', 'day'],
    ['💪', 'Do five push-ups', 'any'],
    ['💃', 'Dance to one song', 'evening'],
    ['🧘', 'Do five minutes of yoga', 'evening'],
    ['🏋️', 'Do a 20-minute workout', 'evening'],
    ['🚲', 'Walk or bike one short trip', 'day'],
    ['🤸', 'Move for one minute in a way that feels good', 'any'],
    ['👟', "Lay out tomorrow's workout clothes", 'night'],
  ]),
  ...group('food', [
    ['🥛', 'Drink water with every meal', 'day'],
    ['🚰', 'Fill your water bottle', 'morning'],
    ['🍳', 'Eat breakfast with some protein', 'morning'],
    ['🍎', 'Eat one piece of fruit', 'day'],
    ['🥦', 'Add a vegetable to one meal', 'day'],
    ['🥜', 'Pack a healthy snack', 'morning'],
    ['🍽️', 'Eat one meal at the table', 'evening'],
    ['🥗', 'Fill half your dinner plate with vegetables', 'evening'],
    ['🍲', 'Cook one meal at home', 'evening'],
    ['🐢', 'Eat one meal slowly', 'day'],
    ['🫖', 'Swap one sugary drink for water or tea', 'day'],
    ['🗓️', "Decide tomorrow's dinner", 'evening'],
    ['🛒', 'Plan your meals for the week', 'day', true],
  ]),
  ...group('sleep', [
    ['⏰', 'Get up at the same time every day', 'morning'],
    ['☀️', 'Get 10 minutes of daylight after waking up', 'morning'],
    ['☕', 'Switch to decaf after 2 pm', 'day'],
    ['💡', 'Dim the lights an hour before bed', 'night'],
    ['📵', 'Put your phone down 30 minutes before bed', 'night'],
    ['🔌', 'Charge your phone outside the bedroom', 'night'],
    ['📝', "Write tomorrow's to-do list before bed", 'night'],
    ['📖', 'Read a few pages in bed', 'night'],
    ['🛁', 'Take a warm shower before bed', 'night'],
    ['🌡️', 'Cool your bedroom before you sleep', 'night'],
    ['🛌', 'Be in bed by your bedtime', 'night'],
    ['🌙', 'Start winding down at the same time each night', 'evening'],
  ]),
  ...group('calm', [
    ['🌬️', 'Breathe slowly for one minute', 'any'],
    ['🧘', 'Meditate for two minutes', 'morning'],
    ['☕', 'Savor the first sip of your morning drink', 'morning'],
    ['😌', 'Relax your shoulders and unclench your jaw', 'day'],
    ['🌳', 'Spend 10 minutes in nature', 'day'],
    ['🪟', 'Look out the window for one minute', 'day'],
    ['🫶', 'Name how you feel right now', 'any'],
    ['🧩', 'Do one thing at a time for 10 minutes', 'day'],
    ['🎧', 'Listen to calming music for five minutes', 'evening'],
    ['📓', "Write down what's on your mind", 'evening'],
    ['🙏', "Name three things you're grateful for", 'night'],
    ['✨', 'Write down one good thing from today', 'night'],
  ]),
  ...group('focus', [
    ['🎯', 'Pick your top three for today', 'morning'],
    ['🐸', 'Do your hardest task first', 'morning'],
    ['🧹', 'Clear your desk before you start', 'morning'],
    ['⏱️', 'Focus for 25 minutes, then take a break', 'day'],
    ['📱', 'Put your phone in another room while you work', 'day'],
    ['✍️', 'Write down the first step of a big task', 'day'],
    ['⚡', 'Finish one two-minute task', 'day'],
    ['🔕', 'Turn on Do Not Disturb for one hour', 'day'],
    ['📥', 'Check your email at set times', 'day'],
    ['🚶', 'Take a real break away from your screen', 'day'],
    ['📋', 'Review your list after lunch', 'day'],
    ['🌅', 'Plan tomorrow before you finish work', 'evening'],
    ['🗂️', 'Review your week and plan the next one', 'evening', true],
  ]),
  ...group('home', [
    ['🍽️', 'Wash the dishes right after you eat', 'evening'],
    ['⏲️', 'Tidy up for five minutes', 'evening'],
    ['📦', 'Put five things back where they belong', 'evening'],
    ['🧺', 'Put your clothes away', 'evening'],
    ['🚰', 'Clear the sink before bed', 'night'],
    ['🧽', 'Wipe the kitchen counters before bed', 'night'],
    ['🛋️', 'Reset one room before bed', 'night'],
    ['🧴', 'Wipe the bathroom sink', 'morning'],
    ['📬', "Deal with today's mail", 'day'],
    ['🗑️', 'Take out the trash', 'evening'],
    ['🪴', 'Water your plants', 'morning', true],
    ['👚', 'Do one load of laundry', 'day', true],
    ['🎁', "Put one thing you don't use in a donate bag", 'day', true],
  ]),
  ...group('people', [
    ['💬', 'Text a friend just to say hi', 'day'],
    ['🙏', 'Thank someone', 'day'],
    ['🌟', 'Give one sincere compliment', 'day'],
    ['👂', 'Ask someone how their day went and listen', 'evening'],
    ['🤗', 'Hug someone you love', 'evening'],
    ['🍽️', 'Share a meal with someone, phones away', 'evening'],
    ['💌', "Reply to one message you've been putting off", 'day'],
    ['🤝', 'Do one small kind thing for someone', 'day'],
    ['👋', 'Say hello to a neighbor or coworker', 'day'],
    ['📸', 'Send someone a photo that made you think of them', 'day'],
    ['📞', 'Call someone you love', 'evening', true],
    ['🗓️', 'Make a plan to see a friend', 'day', true],
  ]),
  ...group('selfcare', [
    ['🪥', 'Brush your teeth morning and night', 'morning'],
    ['🧴', 'Put on sunscreen', 'morning'],
    ['💊', 'Take your vitamins or medication', 'morning'],
    ['🚿', 'Take a shower', 'morning'],
    ['💇', 'Brush your hair', 'morning'],
    ['🫶', 'Say one kind thing to yourself', 'any'],
    ['🛋️', 'Rest for 10 minutes', 'day'],
    ['🎨', 'Spend 10 minutes on something just for fun', 'evening'],
    ['🦷', 'Floss your teeth', 'night'],
    ['🧼', 'Wash your face before bed', 'night'],
    ['👗', "Lay out tomorrow's clothes", 'night'],
    ['🏅', 'Name one thing you did well today', 'night'],
  ]),
  ...group('money', [
    ['👀', 'Check your account balance', 'morning'],
    ['🥪', 'Bring lunch from home', 'morning'],
    ['☕', 'Make your coffee at home', 'morning'],
    ['🎯', "Set today's spending limit", 'morning'],
    ['🧾', 'Write down what you spent today', 'evening'],
    ['⏳', 'Wait a day before buying something you want', 'any'],
    ['🐷', 'Put your spare change in a jar', 'evening'],
    ['🛒', 'Shop with a list', 'day', true],
    ['🏦', 'Move a little money into savings', 'day', true],
    ['📅', "Review this week's spending", 'evening', true],
    ['💳', 'Check for bills due this week', 'day', true],
  ]),
  ...group('learn', [
    ['📖', 'Read 10 pages', 'evening'],
    ['🎧', 'Listen to a podcast or audiobook on your commute', 'morning'],
    ['🗣️', 'Practice a language for five minutes', 'day'],
    ['🔍', "Look up one thing you're curious about", 'day'],
    ['🎓', 'Study for 20 minutes', 'day'],
    ['🧠', "Review yesterday's notes for five minutes", 'morning'],
    ['🎸', 'Practice an instrument for 10 minutes', 'evening'],
    ['📝', 'Write for 10 minutes', 'morning'],
    ['🎨', 'Practice a skill for 15 minutes', 'evening'],
    ['📰', 'Read one long article', 'day'],
    ['💡', 'Explain one thing you learned to someone', 'evening'],
    ['✍️', 'Write down one thing you learned today', 'night'],
  ]),
  ...group('unplug', [
    ['🌅', 'Keep the first 30 minutes of your day phone-free', 'morning'],
    ['🍽️', 'Eat one meal with your phone out of reach', 'day'],
    ['📵', 'Leave your phone in another room for an hour', 'day'],
    ['👀', 'Look away from your screen every 20 minutes', 'day'],
    ['⏳', 'Set a timer before you open social media', 'day'],
    ['🔕', 'Turn off notifications for one app', 'day'],
    ['🚶', 'Take a walk without headphones', 'day'],
    ['📚', 'Swap 10 minutes of scrolling for reading', 'evening'],
    ['🪑', 'Sit for five minutes with no screen', 'evening'],
    ['📥', 'Clear your notifications, then put your phone down', 'evening'],
    ['🌙', 'Put your phone to bed 30 minutes before you', 'night'],
    ['🛏️', 'Keep your phone off the bed', 'night'],
  ]),
];

const CATEGORY_BY_ID: Record<string, IdeaCategory> = {};
IDEA_CATEGORIES.forEach((category) => {
  CATEGORY_BY_ID[category.id] = category;
});

export function ideaCategory(id: IdeaCategoryId): IdeaCategory {
  return CATEGORY_BY_ID[id];
}

export function ideasForCategory(id: IdeaCategoryId): HabitIdea[] {
  return HABIT_IDEAS.filter((idea) => idea.categoryId === id);
}

export function momentForHour(hour: number): Exclude<IdeaMoment, 'any'> {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'day';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

export function momentLabel(moment: Exclude<IdeaMoment, 'any'>): string {
  if (moment === 'morning') return 'This morning';
  if (moment === 'day') return 'This afternoon';
  if (moment === 'evening') return 'This evening';
  return 'Tonight';
}

export function normalizeIdeaText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const NOW_LIMIT = 10;

function roundRobin(pool: HabitIdea[], limit: number, taken: HabitIdea[]): HabitIdea[] {
  const queues = IDEA_CATEGORIES.map((category) =>
    pool.filter((idea) => idea.categoryId === category.id),
  );
  const out = taken.slice();
  let added = true;
  while (out.length < limit && added) {
    added = false;
    for (let i = 0; i < queues.length && out.length < limit; i += 1) {
      const next = queues[i].shift();
      if (next) {
        out.push(next);
        added = true;
      }
    }
  }
  return out;
}

export const IDEA_TAG_HEADROOM = 3;

export function ideasForMoment(
  moment: Exclude<IdeaMoment, 'any'>,
  skip?: (idea: HabitIdea) => boolean,
): HabitIdea[] {
  const daily = HABIT_IDEAS.filter(
    (idea) => !idea.weekly && !(skip && skip(idea)),
  );
  const fitting = roundRobin(
    daily.filter((idea) => idea.when === moment),
    NOW_LIMIT,
    [],
  );
  if (fitting.length >= NOW_LIMIT) return fitting;
  return roundRobin(
    daily.filter((idea) => idea.when === 'any'),
    NOW_LIMIT,
    fitting,
  );
}

const SEARCH_LIMIT = 12;

export function searchIdeas(query: string): HabitIdea[] {
  const tokens = normalizeIdeaText(query)
    .split(' ')
    .filter((token) => token.length >= 2);
  if (tokens.length === 0) return [];
  const starts: HabitIdea[] = [];
  const rest: HabitIdea[] = [];
  HABIT_IDEAS.forEach((idea) => {
    const haystack = normalizeIdeaText(idea.text);
    const words = haystack.split(' ');
    const all = tokens.every((token) => haystack.indexOf(token) >= 0);
    if (!all) return;
    const wordStart = tokens.every((token) =>
      words.some((word) => word.indexOf(token) === 0),
    );
    (wordStart ? starts : rest).push(idea);
  });
  return starts.concat(rest).slice(0, SEARCH_LIMIT);
}
