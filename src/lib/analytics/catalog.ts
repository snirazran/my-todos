export type MetricUnit =
  | 'users'
  | 'count'
  | 'percent'
  | 'usd'
  | 'flies'
  | 'days'
  | 'minutes'
  | 'ratio';

export type MetricFormat = 'integer' | 'decimal' | 'percent' | 'money' | 'text';

export type MetricDirection = 'up' | 'down' | 'flat';

export type MetricBand = { min?: number; max?: number };

export type SystemId =
  | 'growth'
  | 'tasks'
  | 'quests'
  | 'frog'
  | 'wardrobe'
  | 'social'
  | 'economy'
  | 'money'
  | 'tracking';

export type MetricDefinition = {
  key: string;
  label: string;
  system: SystemId;
  unit: MetricUnit;
  format: MetricFormat;
  definition: string;
  why: string;
  direction: MetricDirection;
  band?: MetricBand;
  benchmark?: string;
};

export type SystemDefinition = {
  id: SystemId;
  title: string;
  question: string;
  blurb: string;
};

export const SYSTEMS: SystemDefinition[] = [
  {
    id: 'growth',
    title: 'Growth',
    question: 'Are new people arriving, and do they come back?',
    blurb: 'Signups, activation, retention curves, and where people come from.',
  },
  {
    id: 'tasks',
    title: 'Tasks & planner',
    question: 'Do people actually plan work and finish it?',
    blurb: 'The core loop: what gets written down, what gets done, what gets focused on.',
  },
  {
    id: 'quests',
    title: 'Quests & Leaps',
    question: 'Are the goals we hand out being taken and finished?',
    blurb: 'Daily quests, Leaps, seasons — the goals the app authors for the user.',
  },
  {
    id: 'frog',
    title: 'Frog & streaks',
    question: 'Is the pet loop pulling people back every day?',
    blurb: 'Login streaks, freezes, hunger, and the daily return ritual.',
  },
  {
    id: 'wardrobe',
    title: 'Wardrobe, shop & trade',
    question: 'Do earned rewards get spent, worn, and shown off?',
    blurb: 'Where flies go, what gets equipped, and whether the catalog moves.',
  },
  {
    id: 'social',
    title: 'Friends & buddies',
    question: 'Does the social layer bring people in and keep them?',
    blurb: 'Invites, friendships, the pond, and shared Goal Buddy tasks.',
  },
  {
    id: 'economy',
    title: 'Fly economy',
    question: 'Is the currency balanced — earned as fast as it is spent?',
    blurb: 'Faucets, sinks, balances, and the guards that stop runaway income.',
  },
  {
    id: 'money',
    title: 'Money',
    question: 'Do the paywall, packs, and ads convert?',
    blurb: 'Plus subscriptions, fly packs, rewarded ads, and what they actually pay.',
  },
  {
    id: 'tracking',
    title: 'Tracking health',
    question: 'Is every system still reporting?',
    blurb: 'Which events are flowing, which went quiet, and which were never wired.',
  },
];

export const SYSTEM_BY_ID = new Map(SYSTEMS.map((system) => [system.id, system]));

function metric(definition: MetricDefinition): MetricDefinition {
  return definition;
}

export const METRICS: MetricDefinition[] = [
  metric({
    key: 'new_users',
    label: 'New accounts',
    system: 'growth',
    unit: 'users',
    format: 'integer',
    definition: 'Accounts whose signup date falls inside the selected range.',
    why: 'The top of every funnel. Every other growth number is a share of this.',
    direction: 'up',
  }),
  metric({
    key: 'active_users',
    label: 'Active users',
    system: 'growth',
    unit: 'users',
    format: 'integer',
    definition: 'Signed-in accounts that fired at least one event in the range.',
    why: 'The honest size of the audience for the range you picked.',
    direction: 'up',
  }),
  metric({
    key: 'dau',
    label: 'DAU',
    system: 'growth',
    unit: 'users',
    format: 'integer',
    definition: 'Distinct signed-in users active on the last day of the range.',
    why: 'The daily heartbeat. Read it next to WAU rather than on its own.',
    direction: 'up',
  }),
  metric({
    key: 'wau',
    label: 'WAU',
    system: 'growth',
    unit: 'users',
    format: 'integer',
    definition: 'Distinct signed-in users active in the last 7 days of the range.',
    why: 'Smooths out weekday noise that makes DAU look worse than it is.',
    direction: 'up',
  }),
  metric({
    key: 'mau',
    label: 'MAU',
    system: 'growth',
    unit: 'users',
    format: 'integer',
    definition: 'Distinct signed-in users active in the last 30 days of the range.',
    why: 'The denominator for stickiness and for Plus conversion.',
    direction: 'up',
  }),
  metric({
    key: 'stickiness',
    label: 'Stickiness (DAU/MAU)',
    system: 'growth',
    unit: 'percent',
    format: 'percent',
    definition: 'DAU divided by MAU, as a percentage.',
    why: 'How many days a month the average user shows up. A daily-habit app should be well above a weekly one.',
    direction: 'up',
    band: { min: 20 },
    benchmark: '20%+ for a daily habit app; below 12% it is a weekly app',
  }),
  metric({
    key: 'sessions',
    label: 'Sessions',
    system: 'growth',
    unit: 'count',
    format: 'integer',
    definition: 'App opens, counted once per 30-minute inactivity window.',
    why: 'Sessions per active user tells you whether people return within a day.',
    direction: 'up',
  }),
  metric({
    key: 'sessions_per_active_user',
    label: 'Sessions / active user',
    system: 'growth',
    unit: 'ratio',
    format: 'decimal',
    definition: 'Sessions in range divided by active users in range.',
    why: 'Multiple sessions a day is the signature of a habit; one is a visit.',
    direction: 'up',
  }),
  metric({
    key: 'activation_rate',
    label: 'Activation rate',
    system: 'growth',
    unit: 'percent',
    format: 'percent',
    definition: 'Share of new accounts in the range that completed at least one task.',
    why: 'The single best early predictor of retention. If this drops, onboarding broke.',
    direction: 'up',
    band: { min: 50 },
    benchmark: '50%+ is healthy for a productivity app',
  }),
  metric({
    key: 'retention_d1',
    label: 'Day-1 retention',
    system: 'growth',
    unit: 'percent',
    format: 'percent',
    definition: 'Share of a signup cohort that opened the app again on the day after signing up.',
    why: 'The fastest signal that the first session either landed or did not.',
    direction: 'up',
    band: { min: 30 },
    benchmark: 'Productivity apps: 25–35% is normal, 40%+ is strong',
  }),
  metric({
    key: 'retention_d7',
    label: 'Day-7 retention',
    system: 'growth',
    unit: 'percent',
    format: 'percent',
    definition: 'Share of a signup cohort that opened the app on their 7th day.',
    why: 'Where a habit either formed or did not. This is the number worth optimising.',
    direction: 'up',
    band: { min: 15 },
    benchmark: '12–20% is normal; under 8% means no habit is forming',
  }),
  metric({
    key: 'retention_d30',
    label: 'Day-30 retention',
    system: 'growth',
    unit: 'percent',
    format: 'percent',
    definition: 'Share of a signup cohort that opened the app on their 30th day.',
    why: 'Your long-run ceiling. It sets how big the app can get at a given signup rate.',
    direction: 'up',
    band: { min: 8 },
    benchmark: '6–12% is normal for consumer apps',
  }),
  metric({
    key: 'total_users',
    label: 'Total accounts',
    system: 'growth',
    unit: 'users',
    format: 'integer',
    definition: 'Every account ever created, ignoring the date range.',
    why: 'Context only. It never goes down, so never read it as health.',
    direction: 'flat',
  }),

  metric({
    key: 'tasks_created',
    label: 'Tasks created',
    system: 'tasks',
    unit: 'count',
    format: 'integer',
    definition: 'task_created events in the range, including bulk plan creation.',
    why: 'Intent. If people stop writing tasks down, nothing downstream can happen.',
    direction: 'up',
  }),
  metric({
    key: 'tasks_completed',
    label: 'Tasks completed',
    system: 'tasks',
    unit: 'count',
    format: 'integer',
    definition: 'task_completed events in the range.',
    why: 'The moment the app delivers its promise, and the trigger for most rewards.',
    direction: 'up',
  }),
  metric({
    key: 'task_completion_rate',
    label: 'Task completion rate',
    system: 'tasks',
    unit: 'percent',
    format: 'percent',
    definition: 'Tasks completed divided by tasks created in the same range.',
    why: 'Below 50% people are over-planning, and the list becomes a guilt pile.',
    direction: 'up',
    band: { min: 55, max: 130 },
    benchmark: '55–100%. Over 100% means older tasks are being cleared',
  }),
  metric({
    key: 'task_creators',
    label: 'Planners',
    system: 'tasks',
    unit: 'users',
    format: 'integer',
    definition: 'Distinct users who created at least one task in the range.',
    why: 'Feature reach for the core loop, separate from how much each person does.',
    direction: 'up',
  }),
  metric({
    key: 'tasks_per_active_user',
    label: 'Tasks completed / active user',
    system: 'tasks',
    unit: 'ratio',
    format: 'decimal',
    definition: 'Tasks completed divided by active users in the range.',
    why: 'Depth of use. A rising number with flat users means the loop is getting stickier.',
    direction: 'up',
  }),
  metric({
    key: 'task_reopen_rate',
    label: 'Reopen rate',
    system: 'tasks',
    unit: 'percent',
    format: 'percent',
    definition: 'task_reopened events as a share of task_completed events.',
    why: 'High reopen means mis-taps or reward farming. Both are worth catching.',
    direction: 'down',
    band: { max: 8 },
    benchmark: 'Under 8%. Above 15% suspect fat-finger completion or fly farming',
  }),
  metric({
    key: 'focus_started',
    label: 'Focus sessions started',
    system: 'tasks',
    unit: 'count',
    format: 'integer',
    definition: 'timer_started events in the range.',
    why: 'The deepest engagement the app offers, and the strongest retention correlate.',
    direction: 'up',
  }),
  metric({
    key: 'focus_completion_rate',
    label: 'Focus completion rate',
    system: 'tasks',
    unit: 'percent',
    format: 'percent',
    definition: 'timer_completed divided by timer_started in the range.',
    why: 'Low completion means the default durations are too long, or notifications are killing the timer.',
    direction: 'up',
    band: { min: 60 },
    benchmark: '60%+ of started timers should run to the end',
  }),
  metric({
    key: 'focus_users',
    label: 'Focus users',
    system: 'tasks',
    unit: 'users',
    format: 'integer',
    definition: 'Distinct users who started a focus timer in the range.',
    why: 'Adoption of Frogodoro, separately from how much the fans use it.',
    direction: 'up',
  }),

  metric({
    key: 'quest_objectives_claimed',
    label: 'Objectives claimed',
    system: 'quests',
    unit: 'count',
    format: 'integer',
    definition: 'quest_objective_claimed events across daily quests and Leaps.',
    why: 'The pull-through of everything the quest system authors.',
    direction: 'up',
  }),
  metric({
    key: 'quest_claimers',
    label: 'Quest claimers',
    system: 'quests',
    unit: 'users',
    format: 'integer',
    definition: 'Distinct users who claimed at least one objective in the range.',
    why: 'Reach of the quest system. Compare to active users to see if it is a niche feature.',
    direction: 'up',
  }),
  metric({
    key: 'quest_reach',
    label: 'Quest reach',
    system: 'quests',
    unit: 'percent',
    format: 'percent',
    definition: 'Quest claimers as a share of active users.',
    why: 'If the quest page is the second tab and fewer than half of actives touch it, the hook is weak.',
    direction: 'up',
    band: { min: 40 },
    benchmark: '40%+ of active users should claim something',
  }),
  metric({
    key: 'quest_swap_rate',
    label: 'Daily quest swap rate',
    system: 'quests',
    unit: 'percent',
    format: 'percent',
    definition: 'Quest swaps as a share of quest claimers.',
    why: 'A high swap rate means the generated daily is landing on the wrong thing.',
    direction: 'down',
    band: { max: 35 },
    benchmark: 'Under 35%. Higher means the recipe is mis-targeting',
  }),
  metric({
    key: 'pact_committed',
    label: 'Leaps committed',
    system: 'quests',
    unit: 'count',
    format: 'integer',
    definition: 'pact_committed events — a user picking a weekly Leap.',
    why: 'Weekly commitment is the strongest multi-day retention lever in the app.',
    direction: 'up',
  }),
  metric({
    key: 'pact_completion_rate',
    label: 'Leap completion rate',
    system: 'quests',
    unit: 'percent',
    format: 'percent',
    definition: 'pact_claimed as a share of pact_committed in the range.',
    why: 'A Leap that is committed and then dropped is worse than never offered.',
    direction: 'up',
    band: { min: 45 },
    benchmark: '45%+ of committed Leaps should be claimed',
  }),
  metric({
    key: 'pact_drop_rate',
    label: 'Leap drop rate',
    system: 'quests',
    unit: 'percent',
    format: 'percent',
    definition: 'pact_dropped plus pact_skipped as a share of pact_committed.',
    why: 'Tells you the weekly target is set too high before users tell you.',
    direction: 'down',
    band: { max: 35 },
  }),

  metric({
    key: 'streak_checkins',
    label: 'Streak check-ins',
    system: 'frog',
    unit: 'count',
    format: 'integer',
    definition: 'streak_checked_in events — one per user per day they opened the app.',
    why: 'The purest measure of the daily return ritual.',
    direction: 'up',
  }),
  metric({
    key: 'streak_extended_rate',
    label: 'Streak extend rate',
    system: 'frog',
    unit: 'percent',
    format: 'percent',
    definition: 'Share of check-ins that extended a streak rather than starting a new one.',
    why: 'A low rate means streaks keep resetting — the freeze economy or the reminder cadence is off.',
    direction: 'up',
    band: { min: 70 },
  }),
  metric({
    key: 'streak_breaks',
    label: 'Streaks broken',
    system: 'frog',
    unit: 'count',
    format: 'integer',
    definition: 'streak_broken events — a missed day that no shield covered.',
    why: 'Each one is a user who lost progress. Spikes predict churn a week early.',
    direction: 'down',
  }),
  metric({
    key: 'shield_saves',
    label: 'Shield saves',
    system: 'frog',
    unit: 'count',
    format: 'integer',
    definition: 'streak_shield_used events — a freeze covering a missed day.',
    why: 'Shows the shield economy doing its job, and how much of it is being consumed.',
    direction: 'up',
  }),
  metric({
    key: 'hunger_entries',
    label: 'Frogs going hungry',
    system: 'frog',
    unit: 'count',
    format: 'integer',
    definition: 'hunger_started events — a frog crossing into the hungry state.',
    why: 'Hunger is a loss-frame nudge. Too much of it and it stops being a nudge and starts being a nag.',
    direction: 'flat',
  }),
  metric({
    key: 'hunger_recovery_rate',
    label: 'Hunger recovery rate',
    system: 'frog',
    unit: 'percent',
    format: 'percent',
    definition: 'hunger_resolved as a share of hunger_started.',
    why: 'Below half, the hunger loop is punishing people who never come back to fix it.',
    direction: 'up',
    band: { min: 50 },
  }),
  metric({
    key: 'notifications_sent',
    label: 'Notifications sent',
    system: 'frog',
    unit: 'count',
    format: 'integer',
    definition: 'notification_sent events from the reminder cron.',
    why: 'The denominator for open rate, and the check on the 2/day cap.',
    direction: 'flat',
  }),
  metric({
    key: 'notification_open_rate',
    label: 'Notification open rate',
    system: 'frog',
    unit: 'percent',
    format: 'percent',
    definition: 'notification_opened divided by notification_sent.',
    why: 'The only way to tell which of the priority-ladder messages is worth its slot.',
    direction: 'up',
    band: { min: 6 },
    benchmark: '4–10% is normal for push; under 3% the copy is being ignored',
  }),

  metric({
    key: 'shop_purchases',
    label: 'Shop purchases',
    system: 'wardrobe',
    unit: 'count',
    format: 'integer',
    definition: 'skin_purchased events in the range.',
    why: 'The main sink. If it stalls while flies keep flowing, balances inflate.',
    direction: 'up',
  }),
  metric({
    key: 'shop_buyers',
    label: 'Buyers',
    system: 'wardrobe',
    unit: 'users',
    format: 'integer',
    definition: 'Distinct users who bought at least one cosmetic.',
    why: 'Reach of the shop. Compare to active users for the real adoption picture.',
    direction: 'up',
  }),
  metric({
    key: 'shop_reach',
    label: 'Shop reach',
    system: 'wardrobe',
    unit: 'percent',
    format: 'percent',
    definition: 'Buyers as a share of active users.',
    why: 'If most actives never buy, the reward loop terminates at the balance instead of the frog.',
    direction: 'up',
    band: { min: 25 },
  }),
  metric({
    key: 'equip_actions',
    label: 'Items equipped',
    system: 'wardrobe',
    unit: 'count',
    format: 'integer',
    definition: 'item_equipped events, including unequips.',
    why: 'Buying is the sink; wearing is the payoff. A gap between them means the art is not landing.',
    direction: 'up',
  }),
  metric({
    key: 'trades',
    label: 'Trade-ups',
    system: 'wardrobe',
    unit: 'count',
    format: 'integer',
    definition: 'skin_traded events in the range.',
    why: 'The duplicate sink. If it is idle, spares pile up and gifts feel worthless.',
    direction: 'up',
  }),
  metric({
    key: 'wishlist_pins',
    label: 'Wishlist pins',
    system: 'wardrobe',
    unit: 'count',
    format: 'integer',
    definition: 'wishlist_pinned events — a user naming what they are saving for.',
    why: 'Declared intent. The single best input for what to put on sale.',
    direction: 'up',
  }),

  metric({
    key: 'connected_users',
    label: 'Users with a friend',
    system: 'social',
    unit: 'users',
    format: 'integer',
    definition: 'Distinct users on at least one friendship, all time.',
    why: 'Social users retain better almost everywhere. This is the size of that group.',
    direction: 'up',
  }),
  metric({
    key: 'new_friendships',
    label: 'New friendships',
    system: 'social',
    unit: 'count',
    format: 'integer',
    definition: 'Friendship records created inside the range.',
    why: 'The growth rate of the graph, which compounds into invites.',
    direction: 'up',
  }),
  metric({
    key: 'invite_conversion',
    label: 'Invite conversion',
    system: 'social',
    unit: 'percent',
    format: 'percent',
    definition: 'Referrals claimed divided by referrals created in the range.',
    why: 'Turns invites into a real acquisition channel or exposes a broken claim flow.',
    direction: 'up',
    band: { min: 20 },
    benchmark: '20%+ of sent invites should be claimed',
  }),
  metric({
    key: 'buddy_acceptance_rate',
    label: 'Buddy acceptance rate',
    system: 'social',
    unit: 'percent',
    format: 'percent',
    definition: 'Buddy bonds accepted as a share of buddy invites sent in the range.',
    why: 'A shared task only works if the other side says yes. Low acceptance means the ask is too big.',
    direction: 'up',
    band: { min: 50 },
  }),
  metric({
    key: 'friend_request_acceptance',
    label: 'Friend request acceptance',
    system: 'social',
    unit: 'percent',
    format: 'percent',
    definition: 'Friend requests accepted as a share of requests sent in the range.',
    why: 'Separates a discovery problem from a trust problem.',
    direction: 'up',
    band: { min: 55 },
  }),

  metric({
    key: 'flies_earned',
    label: 'Flies earned (faucet)',
    system: 'economy',
    unit: 'flies',
    format: 'integer',
    definition: 'Every positive fly movement in the ledger for the range.',
    why: 'The money supply. Read it only next to the sink.',
    direction: 'flat',
  }),
  metric({
    key: 'flies_spent',
    label: 'Flies spent (sink)',
    system: 'economy',
    unit: 'flies',
    format: 'integer',
    definition: 'Every negative fly movement in the ledger for the range, as a positive number.',
    why: 'What actually leaves circulation. The counterweight to the faucet.',
    direction: 'flat',
  }),
  metric({
    key: 'sink_faucet_ratio',
    label: 'Sink / faucet',
    system: 'economy',
    unit: 'ratio',
    format: 'decimal',
    definition: 'Flies spent divided by flies earned over the economy window.',
    why: 'Under 0.85 you are inflating — balances grow, the shop stops mattering, rewards stop feeling like rewards.',
    direction: 'up',
    band: { min: 0.85, max: 1.0 },
    benchmark: '0.85 – 1.00',
  }),
  metric({
    key: 'flies_per_dau',
    label: 'Flies earned / DAU',
    system: 'economy',
    unit: 'flies',
    format: 'integer',
    definition: 'Daily faucet divided by average DAU over the economy window.',
    why: 'The per-player income rate every price in the catalog is set against.',
    direction: 'flat',
    band: { min: 60, max: 130 },
    benchmark: '~90 flies per active user per day',
  }),
  metric({
    key: 'median_balance_days',
    label: 'Median balance (days of income)',
    system: 'economy',
    unit: 'days',
    format: 'decimal',
    definition: 'Median fly balance expressed as days of average income.',
    why: 'Above three days there is nothing worth buying; the catalog is under-stocked or over-priced.',
    direction: 'down',
    band: { max: 3 },
  }),
  metric({
    key: 'breaker_trips',
    label: 'Circuit-breaker trips',
    system: 'economy',
    unit: 'count',
    format: 'integer',
    definition: 'fly_circuit_breaker events — a user hitting the daily hard cap.',
    why: 'No legitimate user reaches the cap. Every trip is an exploit early-warning.',
    direction: 'down',
    band: { max: 0 },
  }),

  metric({
    key: 'gross_revenue',
    label: 'Gross revenue',
    system: 'money',
    unit: 'usd',
    format: 'money',
    definition: 'Production (non-sandbox) revenue on subscriptions and purchases in the range.',
    why: 'Before store cuts. Use proceeds for what actually lands.',
    direction: 'up',
  }),
  metric({
    key: 'proceeds',
    label: 'Estimated proceeds',
    system: 'money',
    unit: 'usd',
    format: 'money',
    definition: 'Revenue after the store cut, as reported by RevenueCat.',
    why: 'The number that pays the bills.',
    direction: 'up',
  }),
  metric({
    key: 'arpdau',
    label: 'ARPDAU',
    system: 'money',
    unit: 'usd',
    format: 'money',
    definition: 'Gross revenue divided by (active users × days in range).',
    why: 'Lets you compare monetisation across ranges of different length and size.',
    direction: 'up',
  }),
  metric({
    key: 'paywall_conversion',
    label: 'Paywall conversion',
    system: 'money',
    unit: 'percent',
    format: 'percent',
    definition: 'Users who completed a purchase divided by users who saw a paywall.',
    why: 'Isolates the paywall itself from how often you show it.',
    direction: 'up',
    band: { min: 3 },
    benchmark: '2–5% view-to-purchase is normal for a consumer app',
  }),
  metric({
    key: 'plus_share',
    label: 'Plus share of accounts',
    system: 'money',
    unit: 'percent',
    format: 'percent',
    definition: 'Accounts with an unexpired premiumUntil, over all accounts.',
    why: 'The subscription base. Growth here is the compounding revenue line.',
    direction: 'up',
    band: { min: 3, max: 12 },
    benchmark: '3–6% of the base',
  }),
  metric({
    key: 'subscription_churn',
    label: 'Subscription churn',
    system: 'money',
    unit: 'percent',
    format: 'percent',
    definition: 'Cancellations plus expirations over subscriptions started in the range.',
    why: 'Above 1 you are losing subscribers faster than you win them.',
    direction: 'down',
    band: { max: 60 },
  }),
  metric({
    key: 'ad_completion_rate',
    label: 'Ad completion rate',
    system: 'money',
    unit: 'percent',
    format: 'percent',
    definition: 'Rewarded ads completed divided by ads requested.',
    why: 'Requests that never complete are lost fill or a broken placement, not user choice.',
    direction: 'up',
    band: { min: 55 },
    benchmark: '55%+ of requests should reach a reward',
  }),
  metric({
    key: 'ad_impressions',
    label: 'Ad impressions',
    system: 'money',
    unit: 'count',
    format: 'integer',
    definition: 'ad_impression events across every rewarded placement.',
    why: 'Ad revenue scales with this. It is also the load the user actually feels.',
    direction: 'up',
  }),

  metric({
    key: 'events_recorded',
    label: 'Events recorded',
    system: 'tracking',
    unit: 'count',
    format: 'integer',
    definition: 'Every analytics event written in the range.',
    why: 'A sudden drop means a deploy broke instrumentation, not that users left.',
    direction: 'flat',
  }),
  metric({
    key: 'events_live',
    label: 'Event types reporting',
    system: 'tracking',
    unit: 'count',
    format: 'integer',
    definition: 'Declared event types with at least one write in the range.',
    why: 'The coverage check: how much of the app is actually observable right now.',
    direction: 'up',
  }),
  metric({
    key: 'events_silent',
    label: 'Event types silent',
    system: 'tracking',
    unit: 'count',
    format: 'integer',
    definition: 'Declared event types with no write in the range but data at some point before it.',
    why: 'Each one is a system that used to report and stopped. Usually a regression.',
    direction: 'down',
    band: { max: 0 },
  }),
];

export const METRIC_BY_KEY = new Map(METRICS.map((definition) => [definition.key, definition]));

export type StatFormat = MetricFormat | 'flies' | 'ratio';

export type StatColumn = {
  key: string;
  label: string;
  format?: StatFormat;
  hint?: string;
};

export type StatRow = Record<string, string | number | null>;

export type StatTable = {
  key: string;
  title: string;
  question: string;
  columns: StatColumn[];
  rows: StatRow[];
  note?: string;
};

export type StatSeries = {
  key: string;
  title: string;
  question: string;
  lines: Array<{ key: string; label: string; format?: StatFormat }>;
  points: Array<{ date: string; [key: string]: string | number }>;
};

export type StatKpi = {
  metric: string;
  value: number | null;
  previous?: number | null;
  sparkline?: number[];
  detail?: string;
  /**
   * How many observations the value rests on — the denominator of a rate, or
   * the count behind an average. A rate computed from three users is noise, so
   * the signal layer refuses to judge a metric whose sample is too thin, and
   * the card marks it provisional rather than showing a confident red dot.
   */
  sample?: number;
};

export type StatSection = {
  id: SystemId;
  title: string;
  question: string;
  blurb: string;
  kpis: StatKpi[];
  series: StatSeries[];
  tables: StatTable[];
};

export type SignalLevel = 'good' | 'watch' | 'bad' | 'unknown';

export type Signal = {
  key: string;
  level: SignalLevel;
  system: SystemId;
  title: string;
  detail: string;
  action: string;
  metric?: string;
  value?: number | null;
};

export type StatisticsSnapshot = {
  meta: {
    generatedAt: string;
    timezone: string;
    range: { start: string; end: string; days: number };
    compare: { start: string; end: string; days: number } | null;
    coverage: {
      firstEventAt: string | null;
      retentionDays: number;
      declaredEvents: number;
      eventsInRange: number;
    };
  };
  headline: StatKpi[];
  signals: Signal[];
  sections: StatSection[];
  glossary: MetricDefinition[];
};

export function statusForBand(value: number | null, band?: MetricBand): SignalLevel {
  if (value === null || !Number.isFinite(value)) return 'unknown';
  if (!band || (band.min === undefined && band.max === undefined)) return 'good';
  const lowBad = band.min !== undefined && value < band.min;
  const highBad = band.max !== undefined && value > band.max;
  if (!lowBad && !highBad) return 'good';
  const span =
    (band.max ?? band.min ?? 1) - (band.min ?? band.max ?? 0) ||
    Math.abs(band.max ?? band.min ?? 1);
  const slack = Math.abs(span) * 0.15 || Math.abs(value) * 0.15;
  if (lowBad && band.min !== undefined && band.min - value <= slack) return 'watch';
  if (highBad && band.max !== undefined && value - band.max <= slack) return 'watch';
  return 'bad';
}
