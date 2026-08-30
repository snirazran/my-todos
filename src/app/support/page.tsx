import type { Metadata } from 'next';
import { LegalPage, type LegalSection } from '@/components/legal/LegalPage';

const lastUpdated = 'August 30, 2026';

const sections: LegalSection[] = [
  {
    title: 'Contact us',
    body: [
      'Email help@frogress.com and a real person will read it. We aim to reply within two business days.',
      'It speeds things up if you tell us which device you are on (iPhone, Android, or the web app), the email address on your account, and what you expected to happen instead of what did.',
      'You can also reach the same content from inside the app: open the menu and choose Help, where every answer below is searchable.',
    ],
  },
  {
    title: 'Getting started',
    body: [
      'Frogress is a to-do list, planner, and focus timer wrapped around a pet frog. You complete real tasks to catch flies, and flies feed your frog, unlock outfits, and pay out daily quests.',
      'You do not need an account to try it. Signing in with Apple, Google, or an email link saves your tasks, flies, and frog so they sync across devices and are never lost.',
      'Frogress is free to use. Frogress Plus is an optional subscription that adds extra perks; everything core works without it.',
    ],
  },
  {
    title: 'Tasks, planner, and focus',
    body: [
      'Add a task from the Today screen. You can type naturally, for example "gym tomorrow 7am", and Frogress fills in the date and time for you. Tasks can hold notes, checklists, tags, and repeat rules.',
      'Tick a task to complete it and catch a fly. If you tick something by mistake, use the undo action in the toast that appears — the fly is returned and any quest progress is rolled back.',
      'The focus timer runs a session on a single task. On iPhone it appears on the Lock Screen and in the Dynamic Island, and the end-of-session alarm rings even in Silent mode.',
      'The Planner holds week and month views for anything that is not due today, and can sync two ways with Google Calendar and Apple Calendar.',
    ],
  },
  {
    title: 'Flies, quests, and rewards',
    body: [
      'Flies are the in-app currency. You earn them by completing tasks, finishing focus sessions, keeping streaks, and claiming daily quests. You spend them on outfits, backgrounds, and gift boxes for your frog.',
      'Daily quests refresh every day and pay out when you hit their goal. Rewards are not automatic — tap Claim when a quest completes, or the reward waits for you.',
      'Duplicate wardrobe items can be traded up for something you do not own yet.',
    ],
  },
  {
    title: 'Your frog and wardrobe',
    body: [
      'Your frog gets hungry when tasks go undone, and cheers up when you feed it. Feeding costs flies, which is the whole loop: finish something real, and something small and good happens.',
      'The Wardrobe holds hats, outfits, held items, and backgrounds. Tap an item to equip it; you can rename your frog from the same screen.',
    ],
  },
  {
    title: 'Frogress Plus',
    body: [
      'Frogress Plus is an optional auto-renewing subscription, offered monthly or yearly, with a free trial. Current prices are shown at the point of purchase and on frogress.com/pricing.',
      'Purchases made in the iPhone app are handled by the App Store. Manage or cancel them in your Apple Account settings — deleting the app does not cancel a subscription. Purchases made on the website are handled by our payment provider and can be cancelled from the link in your receipt email.',
      'Refunds are covered in full by our Refund Policy, linked at the bottom of this page.',
    ],
  },
  {
    title: 'Account, notifications, and sync',
    body: [
      'Reminders are opt-in. Turn them on in Settings, and allow notifications when your device asks. If reminders stop arriving, check that notifications are still permitted for Frogress in your device settings.',
      'Your data syncs automatically to every device you sign in on. If something looks out of date, pull to refresh or sign out and back in.',
      'You can delete your account and all of its data from the profile panel inside the app. Deletion is permanent and cannot be undone. If you would rather we did it for you, email help@frogress.com from the address on your account.',
    ],
  },
  {
    title: 'Something is broken',
    body: [
      'If the app will not load, is stuck on a blank screen, or a purchase did not arrive, email help@frogress.com with your device model and iOS or Android version. Purchases that were charged but not delivered are always put right.',
      'If a fly, reward, or streak looks wrong, tell us roughly when it happened. We keep a record of reward events and can usually see exactly what occurred.',
    ],
  },
];

export const metadata: Metadata = {
  title: 'Support | Frogress',
  description:
    'Help and contact details for Frogress — tasks, planner, focus timer, flies, quests, Frogress Plus, and account questions.',
};

export default function SupportPage() {
  return (
    <LegalPage
      title="Support"
      description="Answers to the questions we are asked most, and a real email address if yours is not here."
      lastUpdated={lastUpdated}
      sections={sections}
    />
  );
}
