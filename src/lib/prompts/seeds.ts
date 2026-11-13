import type { QuestPromptKind, QuestPromptOption } from '@/lib/quests/types';

export const SEED_LIBRARY_VERSION = 2;

export const PROMPT_DEFAULT_COOLDOWN_DAYS: Record<QuestPromptKind, number> = {
  journal: 45,
  checkin: 14,
  poll: 90,
  this_or_that: 90,
};

export type PromptSeed = {
  promptId: string;
  kind: QuestPromptKind;
  category: string;
  question: string;
  placeholder?: string;
  options?: QuestPromptOption[];
  audience?: string[];
  weekdays?: number[];
  cooldownDays?: number;
  weight?: number;
};

type SeedExtra = Pick<PromptSeed, 'audience' | 'weekdays' | 'cooldownDays' | 'weight'>;

const SUN = 0;
const MON = 1;
const WED = 3;
const FRI = 5;
const SAT = 6;

const opt = (id: string, emoji: string, label: string): QuestPromptOption => ({
  id,
  emoji,
  label,
});

const scale = (...steps: [string, string][]): QuestPromptOption[] =>
  steps.map(([emoji, label], index) => opt(String(index + 1), emoji, label));

export const CHECKIN_OPTIONS: QuestPromptOption[] = scale(
  ['😣', 'Rough'],
  ['😕', 'Meh'],
  ['😐', 'Okay'],
  ['🙂', 'Good'],
  ['😄', 'Great'],
);

const journal = (
  id: string,
  category: string,
  question: string,
  placeholder?: string,
  extra: SeedExtra = {},
): PromptSeed => ({
  promptId: `seed-${id}`,
  kind: 'journal',
  category,
  question,
  placeholder,
  ...extra,
});

const poll = (
  id: string,
  category: string,
  question: string,
  options: QuestPromptOption[],
  extra: SeedExtra = {},
): PromptSeed => ({
  promptId: `seed-${id}`,
  kind: options.length === 2 ? 'this_or_that' : 'poll',
  category,
  question,
  options,
  ...extra,
});

const pick4 = (
  id: string,
  category: string,
  question: string,
  a: [string, string],
  b: [string, string],
  c: [string, string],
  d: [string, string],
  extra: SeedExtra = {},
): PromptSeed =>
  poll(
    id,
    category,
    question,
    [opt('a', a[0], a[1]), opt('b', b[0], b[1]), opt('c', c[0], c[1]), opt('d', d[0], d[1])],
    extra,
  );

const tot = (
  id: string,
  category: string,
  question: string,
  a: [string, string],
  b: [string, string],
  extra: SeedExtra = {},
): PromptSeed =>
  poll(id, category, question, [opt('a', a[0], a[1]), opt('b', b[0], b[1])], extra);

const checkin = (
  id: string,
  question: string,
  options: QuestPromptOption[] = CHECKIN_OPTIONS,
  extra: SeedExtra = {},
): PromptSeed => ({
  promptId: `seed-${id}`,
  kind: 'checkin',
  category: 'wellbeing',
  question,
  options,
  ...extra,
});

const only = (...audience: string[]): SeedExtra => ({ audience });
const on = (...weekdays: number[]): SeedExtra => ({ weekdays });

const JOURNAL_GRATITUDE: PromptSeed[] = [
  journal('grateful-today', 'gratitude', 'What is one thing you are glad happened today?', 'Big or tiny, both count…'),
  journal('grateful-person', 'gratitude', 'Who made your life a little easier lately?', 'A friend, a stranger, anyone…'),
  journal('grateful-small', 'gratitude', 'What small thing went right today?', 'The bus showed up on time…'),
  journal('grateful-place', 'gratitude', 'What place makes you feel at home?', 'My grandma’s kitchen…'),
  journal('grateful-body', 'gratitude', 'What is something your body did for you today?', 'Carried the groceries…'),
  journal('grateful-thing', 'gratitude', 'What do you own that makes every day a bit better?', 'My kettle…'),
  journal('grateful-taste', 'gratitude', 'What is the best thing you ate or drank today?', 'That first coffee…'),
  journal('grateful-text', 'gratitude', 'Whose message are you always happy to see?', 'Just a name is fine…'),
  journal('grateful-ordinary', 'gratitude', 'What ordinary thing would you miss if it vanished tomorrow?', 'Hot showers…'),
  journal('grateful-help', 'gratitude', 'Who helped you this week, even a little?', 'My coworker covered for me…'),
  journal('grateful-past-self', 'gratitude', 'What did past you do that today you is thankful for?', 'Packed lunch last night…'),
  journal('grateful-sound', 'gratitude', 'What sound do you love coming home to?', 'The dog’s paws on the floor…'),
  journal('grateful-lucky', 'gratitude', 'Where did you get a bit lucky this week?', 'Found a parking spot…'),
  journal('grateful-teacher', 'gratitude', 'Who taught you something you still use?', 'My dad, how to cook rice…'),
  journal('grateful-free', 'gratitude', 'What is something free that made today better?', 'Sun through the window…'),
  journal('grateful-why', 'gratitude', 'Name one good thing from today. Why did it happen?', 'Lunch with Sam, because I asked…'),
  journal('grateful-view', 'gratitude', 'What is the nicest thing you saw today?', 'The sky on the way home…'),
  journal('grateful-easy', 'gratitude', 'What was easier today than it used to be?', 'Getting out of bed…'),
];

const JOURNAL_JOY: PromptSeed[] = [
  journal('joy-smile', 'joy', 'What made you smile today?', 'A dog in a raincoat…'),
  journal('joy-laugh', 'joy', 'When did you last laugh really hard?', 'At dinner on Sunday…'),
  journal('joy-forward', 'joy', 'What are you looking forward to this week?', 'Friday pizza…'),
  journal('joy-comfort', 'joy', 'What is your favorite way to slow down?', 'Tea and a blanket…'),
  journal('joy-song', 'joy', 'What song has been stuck in your head lately?', 'Song title or just the chorus…'),
  journal('joy-treat', 'joy', 'How could you treat yourself this week?', 'A long bath…'),
  journal('joy-title', 'joy', 'If today were a movie, what would the title be?', 'The Great Laundry Escape…'),
  journal('joy-best-minute', 'joy', 'What was the best minute of your day?', 'The first sip of coffee…'),
  journal('joy-cozy', 'joy', 'What does a cozy evening look like for you?', 'Soup, socks, a good show…'),
  journal('joy-kid', 'joy', 'What did you love doing as a kid?', 'Building forts…'),
  journal('joy-smell', 'joy', 'What smell instantly makes you happy?', 'Fresh bread…'),
  journal('joy-rewatch', 'joy', 'What show or movie can you rewatch forever?', 'Name it…'),
  journal('joy-free-hour', 'joy', 'A free hour appears right now. What do you do with it?', 'Nap. Obviously…'),
  journal('joy-small-pleasure', 'joy', 'What tiny thing do you enjoy more than you probably should?', 'Fresh sheets…'),
  journal('joy-snack', 'joy', 'What snack never lets you down?', 'Salt and vinegar chips…'),
  journal('joy-teleport', 'joy', 'Where would you teleport for one afternoon?', 'A quiet beach…'),
  journal('joy-emoji', 'joy', 'Sum up today in three emoji.', '☕🌧️📚'),
  journal('joy-weekend-highlight', 'joy', 'What was the highlight of your weekend?', 'Sleeping in…', on(SUN, MON)),
  journal('joy-friday', 'joy', 'It is Friday. What was the best part of your week?', 'Finishing that project…', on(FRI)),
  journal('joy-saturday', 'joy', 'What is one thing you want from this weekend?', 'A slow morning…', on(SAT)),
];

const JOURNAL_GROWTH: PromptSeed[] = [
  journal('growth-overcome', 'growth', 'What did you overcome lately?', 'A hard conversation…'),
  journal('growth-proud', 'growth', 'What are you proud of this week?', 'I kept my streak…'),
  journal('growth-learned', 'growth', 'What is something new you learned recently?', 'How to fix a zipper…'),
  journal('growth-brave', 'growth', 'When were you braver than you expected?', 'I spoke up in class…'),
  journal('growth-better', 'growth', 'What is one thing you do better than a year ago?', 'Saying no…'),
  journal('growth-kind', 'growth', 'What kind thing did you do for someone?', 'Held the door, shared my snack…'),
  journal('growth-win-today', 'growth', 'What is one small win from today?', 'Answered that email…'),
  journal('growth-hard', 'growth', 'What felt hard today that you did anyway?', 'Getting up on time…'),
  journal('growth-mistake', 'growth', 'What is a mistake that taught you something useful?', 'Always save a copy…'),
  journal('growth-skill', 'growth', 'What skill would you love to be good at a year from now?', 'Cooking without a recipe…'),
  journal('growth-compliment', 'growth', 'What is a compliment you still remember?', 'That I’m a good listener…'),
  journal('growth-younger', 'growth', 'What would 10-year-old you think is cool about your life now?', 'I can eat cereal for dinner…'),
  journal('growth-no', 'growth', 'What did you say no to lately that felt right?', 'A plan I had no energy for…'),
  journal('growth-habit-proud', 'growth', 'Which habit are you most glad you started?', 'Morning walks…'),
  journal('growth-scary-easy', 'growth', 'What used to scare you that feels easy now?', 'Phone calls…'),
  journal('growth-count-on', 'growth', 'What is one thing people can count on you for?', 'Showing up on time…'),
  journal('growth-one-percent', 'growth', 'What is a tiny bit better this week than last week?', 'My sleep…'),
  journal('growth-curious', 'growth', 'What are you curious about right now?', 'How bread rises…'),
];

const JOURNAL_REFLECTION: PromptSeed[] = [
  journal('reflect-word', 'reflection', 'What word sums up your day?', 'One word is enough…'),
  journal('reflect-advice', 'reflection', 'What advice would you give yourself from last month?', 'Start earlier, worry less…'),
  journal('reflect-energy', 'reflection', 'What gave you energy today?', 'A walk at lunch…'),
  journal('reflect-change', 'reflection', 'What is one thing you would like to do differently tomorrow?', 'Phone away at dinner…'),
  journal('reflect-letgo', 'reflection', 'What is something you are ready to let go of?', 'An old grudge…'),
  journal('reflect-today', 'reflection', 'Describe today in one sentence.', 'Busy, but I got through it…'),
  journal('reflect-drain', 'reflection', 'What drained your battery today?', 'Too many meetings…'),
  journal('reflect-surprise', 'reflection', 'What surprised you today?', 'How fast the day went…'),
  journal('reflect-mind', 'reflection', 'What has been on your mind the most this week?', 'A decision I need to make…'),
  journal('reflect-weather', 'reflection', 'If your mood were weather, what is the forecast?', 'Cloudy with a chance of naps…'),
  journal('reflect-keep', 'reflection', 'What is one thing from today worth remembering?', 'What my friend said…'),
  journal('reflect-tricky', 'reflection', 'What was the trickiest part of today?', 'Staying patient…'),
  journal('reflect-less', 'reflection', 'What do you want less of next week?', 'Late nights…'),
  journal('reflect-headline', 'reflection', 'Write today’s headline.', 'Local human finally does laundry…'),
  journal('reflect-friend', 'reflection', 'What would you tell a friend who had your day?', 'You did enough…'),
  journal('reflect-miss', 'reflection', 'What do you miss right now?', 'Summer evenings…'),
  journal('reflect-changed-mind', 'reflection', 'What is something you changed your mind about?', 'Mornings are not so bad…'),
  journal('reflect-mattered', 'reflection', 'What mattered most to you today?', 'Dinner with my family…'),
  journal('reflect-thank-self', 'reflection', 'What do you want to thank yourself for today?', 'Not giving up…'),
  journal('reflect-sunday', 'reflection', 'What do you want to leave behind in last week?', 'The stress about Tuesday…', on(SUN)),
  journal('reflect-midweek', 'reflection', 'Halfway through the week. What is going better than expected?', 'My mornings…', on(WED)),
];

const JOURNAL_WELLBEING: PromptSeed[] = [
  journal('well-rest', 'wellbeing', 'What helps you rest when your mind is busy?', 'A podcast and a walk…'),
  journal('well-need', 'wellbeing', 'What do you need more of right now?', 'Sleep. Quiet. Hugs…'),
  journal('well-calm', 'wellbeing', 'Where do you feel most calm?', 'By the water…'),
  journal('well-body-ask', 'wellbeing', 'What is your body asking for right now?', 'Water and a stretch…'),
  journal('well-kind-self', 'wellbeing', 'What is one kind thing you can do for yourself today?', 'Go to bed early…'),
  journal('well-worry', 'wellbeing', 'What is one worry you can set down for tonight?', 'It will still be there tomorrow…'),
  journal('well-breath', 'wellbeing', 'Take one slow breath with me. How do you feel now?', 'A little lighter…'),
  journal('well-break', 'wellbeing', 'What do you need a break from?', 'My inbox…'),
  journal('well-sleep-help', 'wellbeing', 'What helps you fall asleep?', 'Rain sounds…'),
  journal('well-enough', 'wellbeing', 'What would make today feel like enough?', 'One task and a real lunch…'),
  journal('well-yourself', 'wellbeing', 'Who do you feel most yourself around?', 'Just a name is fine…'),
  journal('well-outside', 'wellbeing', 'What did you notice outside today?', 'The trees are changing…'),
  journal('well-unplug', 'wellbeing', 'What do you do when you need to unplug?', 'Leave my phone and walk…'),
  journal('well-recharge-plan', 'wellbeing', 'How will you recharge this week?', 'A quiet Sunday…'),
];

const JOURNAL_PLANNING: PromptSeed[] = [
  journal('plan-one', 'planning', 'What is the one thing that would make tomorrow a good day?', 'Finishing my report…'),
  journal('plan-avoid', 'planning', 'What task have you been putting off, and what is the first tiny step?', 'Taxes. Step one: find the folder…'),
  journal('plan-week', 'planning', 'What would make this week feel like a win?', 'Three workouts…'),
  journal('plan-first', 'planning', 'What is the first thing you will do tomorrow?', 'Drink water, then stretch…'),
  journal('plan-frog', 'planning', 'What is your frog today, the one task you would rather avoid?', 'Calling the dentist…'),
  journal('plan-two-min', 'planning', 'What 2-minute task could you finish right after this?', 'Reply to that text…'),
  journal('plan-drop', 'planning', 'What is one thing on your list you could drop?', 'Honestly, the garage…'),
  journal('plan-when-where', 'planning', 'Pick one task for tomorrow. When and where will you do it?', 'Laundry, 8am, before work…'),
  journal('plan-reward', 'planning', 'How will you reward yourself after today’s hardest task?', 'Twenty minutes of my show…'),
  journal('plan-future-self', 'planning', 'What could you do tonight that tomorrow-you will love?', 'Lay out my clothes…'),
  journal('plan-obstacle', 'planning', 'What might get in your way tomorrow, and what is your plan for it?', 'If I hit snooze, then…'),
  journal('plan-three', 'planning', 'What three things would make today a success?', '1. … 2. … 3. …'),
  journal('plan-month', 'planning', 'What do you want to be true by the end of this month?', 'My room is finally sorted…'),
  journal('plan-monday', 'planning', 'It is Monday. What is the one thing this week is about?', 'Getting the application in…', on(MON)),
  journal('plan-sunday', 'planning', 'What would make next week easier if you did it today?', 'Pick my outfits…', on(SUN)),
  journal('plan-friday', 'planning', 'What can wait until Monday?', 'Pretty much all of it…', on(FRI)),
];

const JOURNAL_FUN: PromptSeed[] = [
  journal('fun-frog-flies', 'fun', 'I caught some flies today. What did you catch?', 'The bus, barely…'),
  journal('fun-frog-name', 'fun', 'If you were a frog, what would your name be?', 'Sir Hops-a-Lot…'),
  journal('fun-frog-pond', 'fun', 'Describe your dream pond.', 'Warm, quiet, great snacks…'),
  journal('fun-frog-word', 'fun', 'Teach me a human word I should know.', 'Brunch…'),
  journal('fun-frog-outfit', 'fun', 'What should I wear tomorrow?', 'Something with a hat…'),
  journal('fun-frog-away', 'fun', 'What do you think I do while you are away?', 'Practice hopping…'),
  journal('fun-useless-power', 'fun', 'You get one useless superpower. What is it?', 'Always finding parking…'),
  journal('fun-dinner-guest', 'fun', 'Anyone in the world can come to dinner. Who is it?', 'Name them…'),
  journal('fun-holiday', 'fun', 'Invent a holiday. What are we celebrating?', 'National Nap Day…'),
  journal('fun-time-capsule', 'fun', 'What would you put in a time capsule this year?', 'My concert ticket…'),
  journal('fun-sandwich', 'fun', 'Build your perfect sandwich.', 'Sourdough, cheese, pickles…'),
  journal('fun-rename-monday', 'fun', 'If you could rename Monday, what would you call it?', 'Sunday Part Two…'),
];

const JOURNAL_FOCUS_AREAS: PromptSeed[] = [
  journal('area-prod-done', 'growth', 'What is the most satisfying thing you checked off lately?', 'Finally booked the appointment…', only('area:productivity')),
  journal('area-prod-spot', 'planning', 'Where do you get your best focus?', 'The library, second floor…', only('area:productivity')),
  journal('area-prod-day', 'reflection', 'Think of your last really productive day. What made it work?', 'I started before checking my phone…', only('area:productivity')),
  journal('area-fit-move', 'wellbeing', 'How did you move your body today?', 'Walked to the shop…', only('area:fitness')),
  journal('area-fit-after', 'wellbeing', 'How do you feel right after you move?', 'Awake. A bit proud…', only('area:fitness')),
  journal('area-fit-next', 'planning', 'What is the next time you will move, and what will you do?', 'Tomorrow 7am, ten squats…', only('area:fitness')),
  journal('area-mind-hear', 'wellbeing', 'Pause for a second. What can you hear right now?', 'The fridge humming…', only('area:mindfulness')),
  journal('area-mind-slow', 'reflection', 'What moment did you slow down for today?', 'My tea this morning…', only('area:mindfulness')),
  journal('area-mind-hands', 'wellbeing', 'Look at your hands. What did they do for you today?', 'Typed, cooked, waved…', only('area:mindfulness')),
  journal('area-habit-auto', 'growth', 'What is one habit you never have to think about?', 'Brushing my teeth…', only('area:habits')),
  journal('area-habit-next', 'planning', 'What tiny habit do you want to stick this month?', 'Water before coffee…', only('area:habits')),
  journal('area-habit-after', 'planning', 'Finish this: after I brush my teeth, I will…', 'Do two stretches…', only('area:habits')),
  journal('area-home-corner', 'gratitude', 'What is your favorite corner of your home?', 'The chair by the window…', only('area:home')),
  journal('area-home-reset', 'planning', 'Which 5-minute tidy would make tomorrow morning nicer?', 'Clear the counter…', only('area:home')),
  journal('area-home-feel', 'reflection', 'How do you want your home to feel when you walk in?', 'Calm and a little cozy…', only('area:home')),
  journal('area-learn-now', 'growth', 'What are you learning these days?', 'Spanish, slowly…', only('area:learning')),
  journal('area-learn-teach', 'growth', 'Teach me one thing you learned this week.', 'Octopuses have three hearts…', only('area:learning')),
  journal('area-learn-hours', 'joy', 'What topic could you happily read about for hours?', 'Space. Always space…', only('area:learning')),
  journal('area-rel-hear', 'planning', 'Who would love to hear from you this week?', 'My sister…', only('area:relationships')),
  journal('area-rel-moment', 'gratitude', 'What is a nice moment you shared with someone lately?', 'Coffee with an old friend…', only('area:relationships')),
  journal('area-rel-thanks', 'gratitude', 'Who deserves a thank you from you?', 'Just a name is fine…', only('area:relationships')),
  journal('area-create-made', 'growth', 'What is the last thing you made?', 'A playlist counts…', only('area:creativity')),
  journal('area-create-idea', 'reflection', 'What idea has been bouncing around your head?', 'A comic about my cat…', only('area:creativity')),
  journal('area-create-ten', 'planning', 'What could you make in ten minutes today?', 'A quick sketch…', only('area:creativity')),
  journal('area-cook-proud', 'growth', 'What is a meal you make that you are proud of?', 'My lentil soup…', only('area:cooking')),
  journal('area-cook-tomorrow', 'planning', 'What is for dinner tomorrow?', 'Something with rice…', only('area:cooking')),
  journal('area-cook-comfort', 'joy', 'What is your comfort food?', 'Grilled cheese…', only('area:cooking')),
  journal('area-hobby-time', 'joy', 'What makes you lose track of time?', 'Drawing, gaming, gardening…', only('area:hobbies')),
  journal('area-hobby-room', 'planning', 'Which hobby do you want to make room for this week?', 'Guitar, Thursday night…', only('area:hobbies')),
  journal('area-hobby-try', 'fun', 'What hobby have you always wanted to try?', 'Pottery…', only('area:hobbies')),
];

const JOURNAL_BARRIERS: PromptSeed[] = [
  journal('bar-putoff-start', 'planning', 'You told me you put things off. What could you start for just 5 minutes?', 'The inbox…', only('barrier:put-off')),
  journal('bar-putoff-why', 'reflection', 'What makes a task easy to put off for you?', 'When it is boring or vague…', only('barrier:put-off')),
  journal('bar-distract-pull', 'reflection', 'You said distractions get you. What pulled you away most today?', 'My phone, again…', only('barrier:distracted', 'barrier:focus')),
  journal('bar-distract-phone', 'planning', 'Where could your phone live while you focus?', 'In the other room…', only('barrier:distracted', 'barrier:focus', 'barrier:phone')),
  journal('bar-stuck-step', 'planning', 'You said starting is the hard part. What is the smallest first step on something big?', 'Open the doc…', only('barrier:stuck', 'barrier:no-plan')),
  journal('bar-stuck-next', 'planning', 'Pick one thing that feels too big. What is the very next action?', 'Search for a plumber…', only('barrier:stuck')),
  journal('bar-forget-week', 'planning', 'What is one thing you do not want to forget this week?', 'Mum’s birthday…', only('barrier:forget')),
  journal('bar-lowenergy-boost', 'wellbeing', 'You said energy runs low. What gives you a quick boost?', 'A walk and cold water…', only('barrier:low-energy', 'barrier:tired')),
  journal('bar-chore-play', 'joy', 'You said exercise feels like a chore. What movement feels like play?', 'Dancing in the kitchen…', only('barrier:chore')),
  journal('bar-notime-ten', 'planning', 'Time is tight for you. Where could 10 minutes hide in tomorrow?', 'Right after lunch…', only('barrier:no-time', 'barrier:busy')),
  journal('bar-busymind-loop', 'wellbeing', 'You said your mind will not switch off. What thought keeps circling?', 'Tomorrow’s meeting…', only('barrier:busy-mind')),
  journal('bar-rushing-slow', 'planning', 'You said you are always rushing. What could you do a little slower tomorrow?', 'Breakfast…', only('barrier:rushing')),
  journal('bar-restless-move', 'wellbeing', 'Sitting still is not your thing. What calms you while you move?', 'Walking, doodling…', only('barrier:restless')),
  journal('bar-fade-stuck', 'growth', 'You said you start strong, then stop. What helped the last time a habit stuck?', 'Doing it with a friend…', only('barrier:fade')),
  journal('bar-motivation-slow', 'reflection', 'Motivation comes and goes. What gets you going on a slow day?', 'Music and a tiny start…', only('barrier:motivation')),
  journal('bar-allover-anchor', 'reflection', 'Your days all look different. What happens every day no matter what?', 'Morning coffee…', only('barrier:all-over')),
  journal('bar-pilesup-spot', 'reflection', 'You said mess piles up fast. Which spot fills up first?', 'The chair. Always the chair…', only('barrier:piles-up')),
  journal('bar-letgo-thing', 'planning', 'What is one thing at home you could finally let go of?', 'The shoes I never wear…', only('barrier:let-go')),
  journal('bar-awkward-easy', 'planning', 'You said reaching out feels awkward. Who would be easy to text first?', 'The friend who always replies…', only('barrier:awkward')),
  journal('bar-drift-miss', 'reflection', 'You said you lose touch with people. Who do you miss?', 'Just a name is fine…', only('barrier:drift')),
  journal('bar-notgood-secret', 'fun', 'You worry it will not be good enough. What would you make if nobody ever saw it?', 'A very bad song…', only('barrier:not-good-enough')),
  journal('bar-noideas-spark', 'reflection', 'When ideas run dry, where do you find a spark?', 'Old photos, long walks…', only('barrier:no-ideas')),
  journal('bar-quick-grab', 'planning', 'You said you grab whatever is quick. What easy snack could you keep ready?', 'Cut fruit in the fridge…', only('barrier:convenience')),
  journal('bar-guilty-fun', 'reflection', 'You said fun can feel like wasted time. What did fun give you lately?', 'Energy for Monday…', only('barrier:guilty')),
];

const JOURNAL_PROFILE: PromptSeed[] = [
  journal('trait-curiosity', 'fun', 'I am curious about everything. What is something you wonder about?', 'Why cats purr…', only('trait:curiosity')),
  journal('trait-resilience', 'growth', 'Bad days happen, even to frogs. What helped you bounce back last time?', 'Sleep and a good friend…', only('trait:resilience')),
  journal('trait-compassion', 'wellbeing', 'Being kind to yourself counts. How were you gentle with yourself today?', 'I took a real break…', only('trait:compassion')),
  journal('trait-logic', 'planning', 'Big things get easier in small pieces. What big thing can we chop up?', 'Moving house: boxes first…', only('trait:logic')),
  journal('trait-confidence', 'growth', 'You can do hard things. Which hard thing did you do lately?', 'I asked the question…', only('trait:confidence')),
  journal('trait-security', 'wellbeing', 'You have a safe spot here with me. What else makes you feel safe?', 'My room with the door closed…', only('trait:security')),
  journal('profile-overwhelm-plate', 'planning', 'You told me life gets overwhelming. What could you take off your plate this week?', 'The extra shift…', only('overwhelm:weekly')),
  journal('profile-overwhelm-help', 'wellbeing', 'When things pile up, what helps you most?', 'Writing it all down…', only('overwhelm:weekly', 'overwhelm:monthly')),
  journal('profile-sleep-earlier', 'planning', 'You said sleep runs short. What would help you get to bed earlier tonight?', 'Phone on the charger by 10…', only('sleep:under-5', 'sleep:5-7')),
  journal('profile-sit-stretch', 'planning', 'You said you sit a lot. When could a 2-minute stretch fit in tomorrow?', 'After lunch…', only('activity:sitting')),
  journal('profile-gentle-move', 'wellbeing', 'What kind of gentle movement feels good for your body?', 'Slow stretches in bed…', only('activity:limited')),
  journal('profile-closer', 'reflection', 'Who is someone you would like to know better?', 'The neighbor with the dog…', only('support:just-me', 'support:1')),
];

const CHECKINS: PromptSeed[] = [
  checkin('checkin-mood', 'How are you feeling today?', CHECKIN_OPTIONS, { cooldownDays: 6, weight: 2 }),
  checkin(
    'checkin-energy',
    'How is your energy right now?',
    scale(['😴', 'Empty'], ['🥱', 'Low'], ['😐', 'Steady'], ['🙂', 'Good'], ['⚡', 'Buzzing']),
    { cooldownDays: 8, weight: 2 },
  ),
  checkin(
    'checkin-sleep',
    'How well did you sleep?',
    scale(['😵', 'Awful'], ['😪', 'Poorly'], ['😐', 'Okay'], ['🙂', 'Well'], ['😴', 'Deeply']),
    { cooldownDays: 8 },
  ),
  checkin(
    'checkin-stress',
    'How calm do you feel today?',
    scale(['😰', 'Wired'], ['😟', 'Tense'], ['😐', 'Okay'], ['🙂', 'Calm'], ['😌', 'Zen']),
  ),
  checkin(
    'checkin-focus',
    'How focused have you felt today?',
    scale(['😵', 'Foggy'], ['😕', 'Drifty'], ['😐', 'Okay'], ['🙂', 'Sharp'], ['🎯', 'Laser']),
  ),
  checkin('checkin-week', 'How is your week going so far?'),
  checkin(
    'checkin-social',
    'How connected do you feel to people today?',
    scale(['😔', 'Lonely'], ['😶', 'Distant'], ['😐', 'Okay'], ['🙂', 'Close'], ['🤗', 'Loved']),
  ),
  checkin('checkin-day', 'How was your day?', CHECKIN_OPTIONS, { cooldownDays: 8 }),
  checkin(
    'checkin-body',
    'How does your body feel right now?',
    scale(['😣', 'Achy'], ['😕', 'Stiff'], ['😐', 'Okay'], ['🙂', 'Good'], ['💪', 'Strong']),
  ),
  checkin(
    'checkin-motivation',
    'How motivated do you feel today?',
    scale(['😩', 'None'], ['😕', 'Low'], ['😐', 'Some'], ['🙂', 'Ready'], ['🔥', 'On fire']),
  ),
  checkin(
    'checkin-plate',
    'How full is your plate today?',
    scale(['🤯', 'Buried'], ['😬', 'Full'], ['😐', 'Steady'], ['🙂', 'Light'], ['🍃', 'Clear']),
  ),
  checkin(
    'checkin-done',
    'How do you feel about what you got done today?',
    scale(['😞', 'Bummed'], ['😕', 'Meh'], ['😐', 'Fine'], ['🙂', 'Happy'], ['🏆', 'Proud']),
  ),
  checkin(
    'checkin-mind',
    'How busy is your mind right now?',
    scale(['🌪️', 'Racing'], ['😵', 'Busy'], ['😐', 'Okay'], ['🙂', 'Quiet'], ['😌', 'Still']),
  ),
  checkin(
    'checkin-rested',
    'How rested do you feel?',
    scale(['😵', 'Wrecked'], ['🥱', 'Tired'], ['😐', 'Okay'], ['🙂', 'Rested'], ['🌞', 'Fresh']),
  ),
  checkin(
    'checkin-tomorrow',
    'How do you feel about tomorrow?',
    scale(['😰', 'Dread'], ['😟', 'Uneasy'], ['😐', 'Neutral'], ['🙂', 'Ready'], ['🤩', 'Excited']),
  ),
  checkin(
    'checkin-kind',
    'How kind have you been to yourself today?',
    scale(['😖', 'Harsh'], ['😕', 'Tough'], ['😐', 'Okay'], ['🙂', 'Kind'], ['🥰', 'Gentle']),
  ),
  checkin(
    'checkin-water',
    'How much water have you had today?',
    scale(['🌵', 'None'], ['💧', 'A sip'], ['🥤', 'Some'], ['🚰', 'Plenty'], ['🌊', 'Loads']),
  ),
  checkin(
    'checkin-monday',
    'How ready do you feel for this week?',
    scale(['😩', 'Not yet'], ['😕', 'Barely'], ['😐', 'Sort of'], ['🙂', 'Ready'], ['🚀', 'Pumped']),
    on(MON),
  ),
  checkin('checkin-friday', 'How did this week treat you?', CHECKIN_OPTIONS, on(FRI)),
  checkin(
    'checkin-overwhelm',
    'You told me life gets overwhelming. How is today?',
    scale(['🤯', 'Swamped'], ['😬', 'A lot'], ['😐', 'Some'], ['🙂', 'Little'], ['😌', 'Calm']),
    only('overwhelm:weekly'),
  ),
  checkin(
    'checkin-moved',
    'How much did you move today?',
    scale(['🛋️', 'Barely'], ['🚶', 'A bit'], ['😐', 'Some'], ['🙂', 'Plenty'], ['🏃', 'Loads']),
    only('area:fitness'),
  ),
  checkin(
    'checkin-distracted',
    'You said distractions get you. How did focus go today?',
    scale(['🌀', 'Gone'], ['📱', 'Patchy'], ['😐', 'Okay'], ['🙂', 'Solid'], ['🎯', 'Laser']),
    only('barrier:distracted', 'barrier:focus'),
  ),
  checkin(
    'checkin-present',
    'How present did you feel today?',
    scale(['💭', 'Away'], ['😶', 'Hazy'], ['😐', 'Okay'], ['🙂', 'Here'], ['🧘', 'Fully']),
    only('area:mindfulness'),
  ),
];

const POLLS: PromptSeed[] = [
  pick4('poll-breakfast', 'fun', 'What is the best breakfast?', ['🥞', 'Pancakes'], ['🥣', 'Cereal'], ['🍳', 'Eggs'], ['☕', 'Just coffee']),
  pick4('poll-season', 'fun', 'Which season is the best?', ['🌸', 'Spring'], ['☀️', 'Summer'], ['🍂', 'Autumn'], ['❄️', 'Winter']),
  pick4('poll-focus-time', 'planning', 'When do you get the most done?', ['🌅', 'Early morning'], ['🌞', 'Midday'], ['🌇', 'Evening'], ['🌙', 'Late night']),
  pick4('poll-recharge', 'wellbeing', 'How do you recharge best?', ['😴', 'A nap'], ['🚶', 'A walk'], ['📺', 'A show'], ['👯', 'Friends']),
  pick4('poll-pet', 'fun', 'Which pet would you pick?', ['🐶', 'Dog'], ['🐱', 'Cat'], ['🐸', 'Frog, obviously'], ['🐠', 'Fish']),
  pick4('poll-snack', 'fun', 'Pick a focus snack', ['🍿', 'Popcorn'], ['🍫', 'Chocolate'], ['🍎', 'Fruit'], ['🥨', 'Pretzels']),
  pick4('poll-music', 'fun', 'What do you listen to while you focus?', ['🎧', 'Music'], ['🎙️', 'Podcasts'], ['🌧️', 'Rain sounds'], ['🤫', 'Silence']),
  pick4('poll-list', 'planning', 'How do you pick your next task?', ['🐸', 'Hardest first'], ['🍰', 'Easiest first'], ['⏰', 'Whatever is due'], ['🎲', 'Vibes']),
  pick4('poll-superpower', 'fun', 'Pick a superpower', ['⏸️', 'Pause time'], ['🕊️', 'Fly'], ['🧠', 'Read minds'], ['🌀', 'Teleport']),
  pick4('poll-weekend', 'fun', 'Your ideal weekend?', ['🛋️', 'Cozy at home'], ['🏞️', 'Outdoors'], ['🎉', 'Out with friends'], ['✈️', 'A trip']),
  pick4('poll-stress', 'wellbeing', 'What helps most when you are stressed?', ['📝', 'Writing a list'], ['🫁', 'Deep breaths'], ['🗣️', 'Talking it out'], ['🏃', 'Moving']),
  pick4('poll-reward', 'planning', 'Best reward after a long task?', ['🍦', 'A treat'], ['🎮', 'A game'], ['🛁', 'A long bath'], ['😴', 'A nap']),

  pick4('poll-pizza', 'fun', 'Best pizza topping?', ['🍕', 'Pepperoni'], ['🍄', 'Mushrooms'], ['🍍', 'Pineapple'], ['🧀', 'Just cheese']),
  pick4('poll-time-machine', 'fun', 'Where does the time machine go?', ['🦕', 'Dinosaurs'], ['🏰', 'Medieval times'], ['🕺', 'The 80s'], ['🚀', 'The far future']),
  pick4('poll-drink', 'fun', 'Your go-to drink?', ['☕', 'Coffee'], ['🍵', 'Tea'], ['💧', 'Water'], ['🥤', 'Something fizzy']),
  pick4('poll-movie-night', 'fun', 'Movie night pick?', ['😂', 'Comedy'], ['😱', 'Horror'], ['🚀', 'Sci-fi'], ['💕', 'Romance']),
  pick4('poll-ice-cream', 'fun', 'Best ice cream flavor?', ['🍫', 'Chocolate'], ['🍦', 'Vanilla'], ['🍓', 'Strawberry'], ['🌿', 'Mint chip']),
  pick4('poll-dream-trip', 'fun', 'Dream trip?', ['🏝️', 'An island'], ['🏙️', 'A big city'], ['🏔️', 'The mountains'], ['🏕️', 'Camping']),
  pick4('poll-frog-job', 'fun', 'What job should your frog have?', ['🍳', 'Chef'], ['🚀', 'Astronaut'], ['🔎', 'Detective'], ['🎤', 'Pop star']),
  pick4('poll-pond-weather', 'fun', 'Best pond weather?', ['☀️', 'Sunny'], ['🌧️', 'Rainy'], ['🌫️', 'Misty'], ['❄️', 'Snowy']),
  pick4('poll-free-year', 'fun', 'You win a free year of…', ['🍕', 'Pizza'], ['✈️', 'Flights'], ['🧹', 'House cleaning'], ['☕', 'Coffee']),
  pick4('poll-instant-skill', 'fun', 'Learn one instantly', ['🎹', 'Piano'], ['🗣️', 'Every language'], ['🍳', 'Chef-level cooking'], ['💃', 'Dancing']),
  pick4('poll-animal-energy', 'fun', 'Which animal matches your energy today?', ['🦥', 'Sloth'], ['🐈', 'Cat'], ['🐕', 'Golden retriever'], ['🐿️', 'Squirrel']),
  pick4('poll-noodles', 'fun', 'Pick your noodles', ['🍝', 'Pasta'], ['🍜', 'Ramen'], ['🥡', 'Stir-fry'], ['🧀', 'Mac and cheese']),
  pick4('poll-party', 'fun', 'At a party, you are…', ['💃', 'On the dance floor'], ['🥨', 'By the snacks'], ['🐶', 'Petting the dog'], ['🚪', 'Leaving early']),
  pick4('poll-texting', 'fun', 'How fast do you reply to texts?', ['⚡', 'Instantly'], ['⏳', 'Within the hour'], ['🌙', 'By end of day'], ['🦴', 'Days later']),
  pick4('poll-alarms', 'fun', 'How many alarms do you set?', ['⏰', 'Just one'], ['✌️', 'Two or three'], ['🔁', 'Way too many'], ['🐓', 'None, I just wake up']),
  pick4('poll-plane-seat', 'fun', 'Where do you sit on a plane?', ['🌤️', 'Window'], ['🚶', 'Aisle'], ['😬', 'Middle, sadly'], ['🚗', 'I would rather drive']),
  pick4('poll-time-thief', 'planning', 'Your biggest time thief?', ['📱', 'Social media'], ['📺', 'Shows'], ['🎮', 'Games'], ['💭', 'Daydreaming']),
  pick4('poll-first-thing', 'planning', 'First thing you do after waking up?', ['📱', 'Check my phone'], ['💧', 'Drink water'], ['😴', 'Snooze'], ['🚿', 'Shower']),
  pick4('poll-list-length', 'planning', 'How long is your to-do list right now?', ['🍃', 'Under 5'], ['📋', '5 to 10'], ['📚', '10 to 20'], ['🏔️', 'Do not ask']),
  pick4('poll-procrastinate', 'planning', 'How do you procrastinate?', ['📱', 'Scrolling'], ['🧹', 'Cleaning instead'], ['🍿', 'Snacking'], ['😴', 'Napping']),
  pick4('poll-deadline', 'planning', 'Your deadline style?', ['🐢', 'Done early'], ['📆', 'Steady pace'], ['🔥', 'Last-minute sprint'], ['🙈', 'What deadline?']),
  pick4('poll-break', 'planning', 'Best kind of break?', ['🚶', 'A walk'], ['☕', 'A drink'], ['📱', 'A scroll'], ['🧘', 'A stretch']),
  pick4('poll-good-day', 'planning', 'What kicks off a good day?', ['☕', 'Coffee'], ['🏃', 'Movement'], ['🛏️', 'Sleeping in'], ['📋', 'A plan']),
  pick4('poll-workspace', 'planning', 'Your workspace is…', ['✨', 'Spotless'], ['📚', 'Organized chaos'], ['🌪️', 'A disaster'], ['🛋️', 'The couch']),
  pick4('poll-plan-when', 'planning', 'When do you plan your day?', ['🌙', 'The night before'], ['🌅', 'In the morning'], ['🏃', 'As I go'], ['🙈', 'I do not']),
  pick4('poll-best-finish', 'planning', 'Which task feels best to finish?', ['⚡', 'A quick one'], ['🏔️', 'A huge one'], ['😬', 'A scary one'], ['🧹', 'An overdue one']),
  pick4('poll-motivates', 'planning', 'What keeps you going?', ['🏆', 'Rewards'], ['🔥', 'Streaks'], ['👯', 'Doing it with friends'], ['✅', 'Checking it off']),
  pick4('poll-hard-habit', 'planning', 'Hardest habit to keep?', ['😴', 'Sleeping on time'], ['💧', 'Drinking water'], ['🏃', 'Exercising'], ['📵', 'Less screen time']),
  pick4('poll-bad-day', 'wellbeing', 'What fixes a bad day?', ['🍜', 'Good food'], ['🚿', 'A hot shower'], ['🤗', 'A hug'], ['🎧', 'Music']),
  pick4('poll-self-care', 'wellbeing', 'Your kind of self-care?', ['🛁', 'A bath'], ['📖', 'Reading'], ['🌳', 'Nature'], ['🎮', 'Gaming']),
  pick4('poll-bedtime', 'wellbeing', 'Last thing you do before sleep?', ['📱', 'Scroll'], ['📖', 'Read'], ['🎧', 'Listen to something'], ['😴', 'Straight to sleep']),
  pick4('poll-weather-mood', 'wellbeing', 'Which weather lifts your mood?', ['☀️', 'Bright sun'], ['🌧️', 'Cozy rain'], ['❄️', 'Fresh snow'], ['🍃', 'A breezy day']),
  pick4('poll-comfort', 'wellbeing', 'Ultimate comfort?', ['🧦', 'Fuzzy socks'], ['🛋️', 'A blanket'], ['🍵', 'A warm drink'], ['🐾', 'A pet nearby']),
  pick4('poll-monday', 'fun', 'Monday mood?', ['🚀', 'Let us go'], ['☕', 'Need coffee'], ['😐', 'It is fine'], ['🛏️', 'Back to bed'], on(MON)),
  pick4('poll-friday', 'fun', 'Friday night plans?', ['🛋️', 'The couch'], ['🍽️', 'Dinner out'], ['🎉', 'A party'], ['😴', 'An early night'], on(FRI)),
  pick4('poll-sunday', 'planning', 'Sunday is for…', ['😴', 'Resting'], ['🧹', 'Resetting'], ['🎉', 'Fun'], ['📋', 'Planning'], on(SUN)),

  pick4('poll-area-fitness', 'wellbeing', 'Favorite way to move?', ['🚶', 'Walking'], ['🏋️', 'Lifting'], ['🧘', 'Yoga'], ['💃', 'Dancing'], only('area:fitness')),
  pick4('poll-area-cooking', 'fun', 'Tonight’s dinner energy?', ['🍳', 'Cook from scratch'], ['🥡', 'Takeout'], ['🥪', 'Something quick'], ['🥣', 'Cereal counts'], only('area:cooking')),
  pick4('poll-area-learning', 'planning', 'How do you learn best?', ['📖', 'Reading'], ['🎧', 'Listening'], ['🎬', 'Watching'], ['🛠️', 'Doing'], only('area:learning')),
  pick4('poll-area-home', 'planning', 'First room you would tidy?', ['🍳', 'Kitchen'], ['🛏️', 'Bedroom'], ['🚿', 'Bathroom'], ['🛋️', 'Living room'], only('area:home')),
  pick4('poll-area-relationships', 'wellbeing', 'How do you stay in touch?', ['💬', 'Texting'], ['📞', 'Calls'], ['😂', 'Sending memes'], ['☕', 'In person'], only('area:relationships')),
  pick4('poll-area-creativity', 'fun', 'Pick a creative outlet', ['✏️', 'Drawing'], ['📝', 'Writing'], ['🎵', 'Music'], ['📸', 'Photos'], only('area:creativity')),
  pick4('poll-area-mindfulness', 'wellbeing', 'Where do you feel most present?', ['🌳', 'In nature'], ['🚿', 'In the shower'], ['🍳', 'While cooking'], ['🎧', 'In music'], only('area:mindfulness')),
  pick4('poll-area-hobbies', 'fun', 'Pick a hobby night', ['🎮', 'Games'], ['🧶', 'Crafts'], ['🎸', 'Music'], ['📚', 'Reading'], only('area:hobbies')),
  pick4('poll-area-habits', 'planning', 'Best moment for a new habit?', ['🌅', 'Right after waking'], ['🍽️', 'After a meal'], ['🌙', 'Before bed'], ['🎲', 'Whenever I remember'], only('area:habits')),
  pick4('poll-area-productivity', 'planning', 'What helps you start?', ['⏱️', 'A timer'], ['📋', 'A short list'], ['🎧', 'The right music'], ['🔥', 'A deadline'], only('area:productivity')),
  pick4('poll-bar-putoff', 'planning', 'What do you put off the most?', ['📧', 'Messages'], ['🧹', 'Chores'], ['📞', 'Phone calls'], ['📄', 'Paperwork'], only('barrier:put-off')),
  pick4('poll-bar-distracted', 'planning', 'Your biggest distraction?', ['📱', 'My phone'], ['💭', 'My own thoughts'], ['🗣️', 'Other people'], ['🍪', 'Snacks'], only('barrier:distracted', 'barrier:focus')),
  pick4('poll-bar-lowenergy', 'wellbeing', 'What drains your battery fastest?', ['😴', 'Bad sleep'], ['📱', 'Too much screen'], ['👥', 'Too many people'], ['🍩', 'Skipping meals'], only('barrier:low-energy', 'barrier:tired')),
  pick4('poll-profile-overwhelm', 'wellbeing', 'When it all piles up, you…', ['📝', 'Make a list'], ['🚶', 'Step away'], ['🗣️', 'Call someone'], ['🛏️', 'Hide in bed'], only('overwhelm:weekly', 'overwhelm:monthly')),
];

const THIS_OR_THAT: PromptSeed[] = [
  tot('tot-tea', 'fun', 'Coffee or tea?', ['☕', 'Coffee'], ['🍵', 'Tea']),
  tot('tot-beach', 'fun', 'Beach or mountains?', ['🏖️', 'Beach'], ['⛰️', 'Mountains']),
  tot('tot-morning', 'fun', 'Early bird or night owl?', ['🐦', 'Early bird'], ['🦉', 'Night owl']),
  tot('tot-list', 'planning', 'Paper list or app list?', ['📒', 'Paper'], ['📱', 'App']),
  tot('tot-sweet', 'fun', 'Sweet or salty?', ['🍬', 'Sweet'], ['🥨', 'Salty']),
  tot('tot-books', 'fun', 'Books or movies?', ['📚', 'Books'], ['🎬', 'Movies']),
  tot('tot-rain', 'fun', 'Sunny day or rainy day?', ['☀️', 'Sunny'], ['🌧️', 'Rainy']),
  tot('tot-plan', 'planning', 'Plan everything or go with the flow?', ['🗓️', 'Plan it'], ['🌊', 'Go with it']),
  tot('tot-frog', 'fun', 'Lily pad nap or pond swim?', ['🪷', 'Lily pad nap'], ['💦', 'Pond swim']),
  tot('tot-cats', 'fun', 'Cats or dogs?', ['🐱', 'Cats'], ['🐶', 'Dogs']),

  tot('tot-pizza-burger', 'fun', 'Pizza or burgers?', ['🍕', 'Pizza'], ['🍔', 'Burgers']),
  tot('tot-call-text', 'fun', 'Call or text?', ['📞', 'Call'], ['💬', 'Text']),
  tot('tot-city', 'fun', 'City or countryside?', ['🏙️', 'City'], ['🌾', 'Countryside']),
  tot('tot-shower', 'fun', 'Morning shower or night shower?', ['🌅', 'Morning'], ['🌙', 'Night']),
  tot('tot-pancakes', 'fun', 'Pancakes or waffles?', ['🥞', 'Pancakes'], ['🧇', 'Waffles']),
  tot('tot-hot-cold', 'fun', 'Too hot or too cold?', ['🥵', 'Too hot'], ['🥶', 'Too cold']),
  tot('tot-saver', 'fun', 'Saver or spender?', ['🐷', 'Saver'], ['🛍️', 'Spender']),
  tot('tot-night-in', 'fun', 'Night in or night out?', ['🛋️', 'Night in'], ['🌃', 'Night out']),
  tot('tot-past-future', 'fun', 'Visit the past or the future?', ['🏺', 'The past'], ['🚀', 'The future']),
  tot('tot-fly-invisible', 'fun', 'Fly or be invisible?', ['🕊️', 'Fly'], ['👻', 'Invisible']),
  tot('tot-sunrise', 'fun', 'Sunrise or sunset?', ['🌅', 'Sunrise'], ['🌇', 'Sunset']),
  tot('tot-socks', 'fun', 'Socks in bed?', ['🧦', 'Socks on'], ['🦶', 'Socks off']),
  tot('tot-music-podcast', 'fun', 'Music or podcasts?', ['🎵', 'Music'], ['🎙️', 'Podcasts']),
  tot('tot-cook-order', 'fun', 'Cook or order in?', ['🍳', 'Cook'], ['🥡', 'Order in']),
  tot('tot-talker', 'fun', 'Talker or listener?', ['🗣️', 'Talker'], ['👂', 'Listener']),
  tot('tot-party-size', 'fun', 'Big party or small dinner?', ['🎉', 'Big party'], ['🍽️', 'Small dinner']),
  tot('tot-road-trip', 'fun', 'Road trip or flight?', ['🚗', 'Road trip'], ['✈️', 'Flight']),
  tot('tot-pool', 'fun', 'Pool or ocean?', ['🏊', 'Pool'], ['🌊', 'Ocean']),
  tot('tot-fiction', 'fun', 'Made-up stories or true stories?', ['🐉', 'Made-up'], ['📰', 'True']),
  tot('tot-spicy', 'fun', 'Spicy or mild?', ['🌶️', 'Spicy'], ['🥛', 'Mild']),
  tot('tot-emoji-words', 'fun', 'Emoji or words?', ['😂', 'Emoji'], ['🔤', 'Words']),
  tot('tot-photo', 'fun', 'Take the photo or just enjoy it?', ['📸', 'Take the photo'], ['👀', 'Just enjoy it']),
  tot('tot-battery-fridge', 'fun', 'Full battery or full fridge?', ['🔋', 'Full battery'], ['🧊', 'Full fridge']),
  tot('tot-frog-hat', 'fun', 'Should your frog wear a hat or a scarf?', ['🎩', 'Hat'], ['🧣', 'Scarf']),
  tot('tot-frog-flies', 'fun', 'Crunchy flies or juicy flies?', ['🥨', 'Crunchy'], ['🍇', 'Juicy']),
  tot('tot-leap', 'planning', 'One big leap or lots of tiny hops?', ['🦘', 'Big leap'], ['🐾', 'Tiny hops']),
  tot('tot-inbox', 'planning', 'Inbox zero or inbox 9,999?', ['✨', 'Zero'], ['📬', '9,999']),
  tot('tot-big-first', 'planning', 'Big task first or warm up with a small one?', ['🏔️', 'Big first'], ['🌱', 'Small first']),
  tot('tot-early', 'planning', 'Done early or just in time?', ['🐢', 'Early'], ['⚡', 'Just in time']),
  tot('tot-alone', 'planning', 'Work alone or with others?', ['🎧', 'Alone'], ['👯', 'With others']),
  tot('tot-routine', 'planning', 'Same routine or new every day?', ['🔁', 'Same routine'], ['🎲', 'New every day']),
  tot('tot-multitask', 'planning', 'One thing at a time or many at once?', ['🎯', 'One thing'], ['🤹', 'Many at once']),
  tot('tot-hard-when', 'planning', 'Hard thing in the morning or at night?', ['🌅', 'Morning'], ['🌙', 'Night']),
  tot('tot-snooze', 'planning', 'Snooze or up at the first alarm?', ['😴', 'Snooze'], ['⏰', 'First alarm']),
  tot('tot-desk', 'planning', 'Tidy desk or creative mess?', ['✨', 'Tidy desk'], ['🌪️', 'Creative mess']),
  tot('tot-reward-when', 'planning', 'Reward before or after the task?', ['🍪', 'Before'], ['🏆', 'After']),
  tot('tot-start-finish', 'planning', 'Better at starting or finishing?', ['🚀', 'Starting'], ['🏁', 'Finishing']),
  tot('tot-big-picture', 'planning', 'Big picture or small details?', ['🗺️', 'Big picture'], ['🔎', 'Details']),
  tot('tot-nap', 'wellbeing', 'Nap or push through?', ['😴', 'Nap'], ['💪', 'Push through']),
  tot('tot-talk-quiet', 'wellbeing', 'Bad day: talk it out or quiet time?', ['🗣️', 'Talk it out'], ['🤫', 'Quiet time']),
  tot('tot-bath', 'wellbeing', 'Bath or shower?', ['🛁', 'Bath'], ['🚿', 'Shower']),
  tot('tot-hugs', 'wellbeing', 'Hugs or personal space?', ['🤗', 'Hugs'], ['🙅', 'Space']),
  tot('tot-sun-shade', 'wellbeing', 'Sun or shade?', ['☀️', 'Sun'], ['🌳', 'Shade']),
  tot('tot-rest-day', 'wellbeing', 'Rest day: do nothing or do something fun?', ['🛋️', 'Nothing'], ['🎡', 'Something fun']),
  tot('tot-monday', 'fun', 'Monday: fresh start or necessary evil?', ['🌱', 'Fresh start'], ['😈', 'Necessary evil'], on(MON)),
  tot('tot-saturday', 'fun', 'Saturday: plans or no plans?', ['🗓️', 'Plans'], ['🛋️', 'No plans'], on(SAT)),

  tot('tot-area-fitness-when', 'wellbeing', 'Move in the morning or in the evening?', ['🌅', 'Morning'], ['🌇', 'Evening'], only('area:fitness')),
  tot('tot-area-fitness-where', 'wellbeing', 'Gym or outdoors?', ['🏋️', 'Gym'], ['🌳', 'Outdoors'], only('area:fitness')),
  tot('tot-area-cooking', 'fun', 'Follow the recipe or freestyle?', ['📖', 'Recipe'], ['🎨', 'Freestyle'], only('area:cooking')),
  tot('tot-area-home', 'planning', 'Clean a little daily or one big clean?', ['🧽', 'A little daily'], ['🧹', 'One big clean'], only('area:home')),
  tot('tot-area-learning', 'planning', 'Learn from a book or a video?', ['📚', 'Book'], ['🎬', 'Video'], only('area:learning')),
  tot('tot-area-relationships', 'wellbeing', 'One best friend or a big group?', ['👯', 'One best friend'], ['🎉', 'Big group'], only('area:relationships')),
  tot('tot-area-mindfulness', 'wellbeing', 'Silence or soft music?', ['🤫', 'Silence'], ['🎶', 'Soft music'], only('area:mindfulness')),
  tot('tot-area-creativity', 'planning', 'Plan it first or just start?', ['📐', 'Plan it'], ['🎨', 'Just start'], only('area:creativity')),
  tot('tot-area-hobbies', 'fun', 'Try a new hobby or master an old one?', ['🌱', 'Try a new one'], ['🏆', 'Master one'], only('area:hobbies')),
  tot('tot-area-habits', 'planning', 'Start today or start Monday?', ['⚡', 'Today'], ['🗓️', 'Monday'], only('area:habits')),
  tot('tot-area-productivity', 'planning', 'Long focus block or short sprints?', ['🏔️', 'Long block'], ['⚡', 'Short sprints'], only('area:productivity')),
  tot('tot-bar-putoff', 'planning', 'Do it now or do it under pressure?', ['✅', 'Now'], ['🔥', 'Under pressure'], only('barrier:put-off')),
  tot('tot-bar-distracted', 'planning', 'Phone in sight or phone in another room?', ['📱', 'In sight'], ['🚪', 'Another room'], only('barrier:distracted', 'barrier:focus', 'barrier:phone')),
];

export const SEED_PROMPTS: PromptSeed[] = [
  ...JOURNAL_GRATITUDE,
  ...JOURNAL_JOY,
  ...JOURNAL_GROWTH,
  ...JOURNAL_REFLECTION,
  ...JOURNAL_WELLBEING,
  ...JOURNAL_PLANNING,
  ...JOURNAL_FUN,
  ...JOURNAL_FOCUS_AREAS,
  ...JOURNAL_BARRIERS,
  ...JOURNAL_PROFILE,
  ...CHECKINS,
  ...POLLS,
  ...THIS_OR_THAT,
];
