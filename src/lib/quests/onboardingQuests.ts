import type { QuestLogicBlock } from './types';

export type OnboardingQuestDef = {
  templateId: string;
  name: string;
  description: string;
  logic: QuestLogicBlock[];
};

const fixedFlies = (amount: number) => [
  { type: 'FLIES' as const, amountMode: 'fixed' as const, amount },
];

export const FIRST_HOPS_QUEST: OnboardingQuestDef = {
  templateId: 'onboard:first-hops',
  name: 'First Hops',
  description: 'Learn the basics and earn your first flies.',
  logic: [
    {
      id: 'add-task',
      type: 'count',
      subject: 'task',
      action: 'add',
      amountMode: 'fixed',
      amount: 1,
      tagMode: 'ignore',
      helpText: 'Tap the + button on your home screen and add any task.',
      rewards: fixedFlies(5),
    },
    {
      id: 'complete-task',
      type: 'count',
      subject: 'task',
      action: 'complete',
      amountMode: 'fixed',
      amount: 1,
      tagMode: 'ignore',
      helpText:
        'Tap the circle next to a task to finish it — your frog catches the fly.',
      rewards: fixedFlies(10),
    },
    {
      id: 'focus-timer',
      type: 'focus_minutes',
      subject: 'task',
      amountMode: 'fixed',
      amount: 5,
      tagMode: 'ignore',
      helpText:
        'Open a task and start a Frogodoro focus session for a few minutes.',
      rewards: fixedFlies(10),
    },
    {
      id: 'link-focus-tag',
      type: 'metric_count',
      subject: 'task',
      amountMode: 'fixed',
      amount: 1,
      tagMode: 'ignore',
      metricKey: 'focus_tag_linked',
      helpText:
        'On the Quests page, tap the pencil on a focus quest and pick one of your tags.',
      rewards: fixedFlies(15),
    },
  ],
};

export const EXPLORER_QUEST: OnboardingQuestDef = {
  templateId: 'onboard:explorer',
  name: 'Explorer',
  description: 'Discover everything your frog can do.',
  logic: [
    {
      id: 'save-later',
      type: 'metric_count',
      subject: 'task',
      amountMode: 'fixed',
      amount: 1,
      tagMode: 'ignore',
      metricKey: 'task_saved_later',
      helpText:
        "Use a task's menu to move it to Saved Tasks — it waits there until you need it.",
      rewards: fixedFlies(5),
    },
    {
      id: 'buy-skin',
      type: 'metric_count',
      subject: 'task',
      amountMode: 'fixed',
      amount: 1,
      tagMode: 'ignore',
      metricKey: 'skin_acquired',
      helpText: 'Open the Wardrobe shop and spend your flies on any skin.',
      rewards: fixedFlies(10),
    },
    {
      id: 'sell-skin',
      type: 'metric_count',
      subject: 'task',
      amountMode: 'fixed',
      amount: 1,
      tagMode: 'ignore',
      metricKey: 'skin_sold',
      helpText:
        'Sell a skin you no longer want from the Wardrobe to get flies back.',
      rewards: fixedFlies(10),
    },
    {
      id: 'trade',
      type: 'metric_count',
      subject: 'task',
      amountMode: 'fixed',
      amount: 1,
      tagMode: 'ignore',
      metricKey: 'trade_completed',
      helpText:
        'In the Wardrobe, trade three same-rarity skins for one of a higher rarity.',
      rewards: fixedFlies(15),
    },
    {
      id: 'invite-friend',
      type: 'metric_count',
      subject: 'task',
      amountMode: 'fixed',
      amount: 1,
      tagMode: 'ignore',
      metricKey: 'friend_invited',
      helpText:
        'Invite a friend from the Friends page — you both get a gift when they join.',
      rewards: fixedFlies(15),
    },
  ],
};
