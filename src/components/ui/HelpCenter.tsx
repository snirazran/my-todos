'use client';

import { useMemo, useState } from 'react';
import {
  Rocket,
  ListChecks,
  Trophy,
  Sparkles,
  Shirt,
  Star,
  Bell,
  Gift,
  Search,
  ChevronDown,
  LifeBuoy,
  Send,
  CheckCircle2,
  ScrollText,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type QA = { q: string; a: string };
type HelpCategory = {
  id: string;
  title: string;
  icon: React.ReactNode;
  items: QA[];
};

/* ─── Help content ─────────────────────────────────────────────
   Edit these to keep the Help Center in sync with the app. */
const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    icon: <Rocket className="h-5 w-5" />,
    items: [
      {
        q: 'What is Frogress?',
        a: 'Frogress is a playful to-do and focus app. You complete real tasks to earn flies, level up daily quests, and unlock fun cosmetics for your pet frog — so building good habits actually feels rewarding.',
      },
      {
        q: 'Do I need an account?',
        a: 'You can start right away as a guest. Signing in (for example with Google) saves your tasks, flies, and frog so they sync across all your devices and never get lost.',
      },
      {
        q: 'Is Frogress free?',
        a: 'Yes — Frogress is free to use. There is an optional subscription, Frogress Plus, that adds extra perks. See the "Frogress Plus" section below for details.',
      },
      {
        q: 'What does "eat the frog" mean?',
        a: 'It comes from a productivity idea: do your most important or hardest task first, before anything else can distract you. It is where the name Frogress comes from. The closest thing in the app is the focus timer — pick the task you have been avoiding, start a session on it, and your frog waits with you until the timer ends.',
      },
    ],
  },
  {
    id: 'tasks',
    title: 'Tasks & focus',
    icon: <ListChecks className="h-5 w-5" />,
    items: [
      {
        q: 'How do I add a task?',
        a: 'Tap the + (Quick Add) button, type your task, and add it. In the Planner you can also schedule tasks for specific days.',
      },
      {
        q: 'How do I complete a task?',
        a: 'Check it off from your list. Completing tasks earns flies and pushes your quests forward.',
      },
      {
        q: 'What is the focus timer?',
        a: 'Pick one task, set a length, and work on just that until the timer ends — then take the break it offers. Working in short protected stretches beats grinding for hours. Your frog hunts while you focus: you catch a fly every 15 focused minutes (up to 5 a day), plus a bonus fly for finishing a 15-minute session without pausing. Every focused minute also counts toward quests.',
      },
      {
        q: 'How long should a focus session be?',
        a: 'Start with 15 minutes — long enough to earn a fly, short enough that starting is easy. Once that feels natural, work up to 25 or more. The best session length is the one you\'ll actually start.',
      },
      {
        q: 'What is the backlog?',
        a: 'Tasks you haven\'t scheduled yet live in your backlog. Pull them into a day whenever you\'re ready to work on them.',
      },
      {
        q: 'Can I edit or delete a task?',
        a: 'Yes — open a task to rename it or remove it at any time.',
      },
    ],
  },
  {
    id: 'quests',
    title: 'Quests & rewards',
    icon: <Trophy className="h-5 w-5" />,
    items: [
      {
        q: 'What are quests?',
        a: 'Quests are daily and seasonal goals — like completing a number of tasks or focusing for a set number of minutes. Finishing objectives earns flies and gift rewards.',
      },
      {
        q: 'What is an area?',
        a: 'Quests are grouped into areas of your life, like Home or Productivity & Work. For free, you work on one area at a time.',
      },
      {
        q: 'What happens when I switch areas?',
        a: 'Switching to a different area resets your current area\'s quest progress for that period. You\'ll always get a confirmation before anything resets.',
      },
      {
        q: 'How do I claim rewards?',
        a: 'When an objective is complete, a Claim button appears. Daily rewards can be claimed once their day arrives.',
      },
      {
        q: 'What is the weekly leap?',
        a: 'Each week you pick one life area and one thing you will actually do. We add it to your task list at the times you choose, and you keep a weekly streak for every week you finish it. One area at a time is the point — it is what makes the habit stick.',
      },
    ],
  },
  {
    id: 'flies-shop',
    title: 'Flies & shop',
    icon: <Sparkles className="h-5 w-5" />,
    items: [
      {
        q: 'What are flies?',
        a: 'Flies are the in-app currency. You earn them by completing tasks and quests.',
      },
      {
        q: 'What can I spend flies on?',
        a: 'Use flies in the Shop for cosmetics and backgrounds to customize your frog, or to skip ahead a tier on the season pass. Gift boxes are not for sale — you earn those.',
      },
      {
        q: 'What can I do with duplicate items?',
        a: 'A duplicate is a spare, and spares are what trade-ups run on. Take them to the Trade tab in your Wardrobe to swap same-rarity spares for one item of a higher rarity — the tab shows how many each trade needs.',
      },
    ],
  },
  {
    id: 'wardrobe',
    title: 'Your frog & wardrobe',
    icon: <Shirt className="h-5 w-5" />,
    items: [
      {
        q: 'How do I customize my frog?',
        a: 'Open the Wardrobe to equip skins, hats, body items, held items, and backgrounds you own.',
      },
      {
        q: 'What are gift boxes?',
        a: 'Gift boxes come in Common, Rare, and Legendary rarities and contain random cosmetics. Rarer boxes have better odds for rare items. You earn them from quests, streaks and the season pass — they are never bought.',
      },
      {
        q: 'How do I see a gift\'s odds?',
        a: 'Tap the "?" on any gift in your inventory — or "Drop Rates" on its card in the Gifts tab — for the exact chance of every item and rarity in that box, plus how the Luck guarantees work.',
      },
      {
        q: 'How do I open a gift?',
        a: 'Tap the gift in your inventory and open it to reveal the item inside.',
      },
      {
        q: 'Can I trade items?',
        a: 'Yes — use the Trade tab in the Wardrobe to swap items.',
      },
      {
        q: 'How do I rename my frog?',
        a: 'Open Profile from the menu to set your frog\'s name.',
      },
    ],
  },
  {
    id: 'plus',
    title: 'Frogress Plus',
    icon: <Star className="h-5 w-5" />,
    items: [
      {
        q: 'What is Frogress Plus?',
        a: 'Plus is an optional subscription. You hold three Lily Pads instead of two and get one free every month, can change your area mid-week without losing your streak, unlock premium reward tracks, and earn double rewards.',
      },
      {
        q: 'How do I get Plus?',
        a: 'Tap the Plus banner in the menu, or any "Unlock with Plus" prompt, to upgrade.',
      },
      {
        q: 'How much does Plus cost?',
        a: 'Plus is $69.99 per year (with a 7-day free trial) or $9.99 per month (with a 3-day free trial). Full details are on the pricing page linked at the bottom of this help page.',
      },
      {
        q: 'When does my Plus renew or expire?',
        a: 'Your renewal/expiry date is shown in the menu under your Plus status. Subscriptions renew automatically until cancelled.',
      },
      {
        q: 'How do I cancel or get a refund?',
        a: 'Cancelling stops future charges and you keep Plus until the end of the paid period. Web purchases: use the link in your receipt email or contact support. iOS/Android: cancel in your App Store or Google Play subscription settings. See the Refund Policy linked below for refund details.',
      },
    ],
  },
  {
    id: 'account',
    title: 'Account, notifications & sync',
    icon: <Bell className="h-5 w-5" />,
    items: [
      {
        q: 'How do I turn on reminders?',
        a: 'Enable notifications from the menu. On mobile you may also need to allow notifications for Frogress in your system settings.',
      },
      {
        q: 'Can I sync with Google Calendar?',
        a: 'Yes — connect Google Calendar from the menu to keep your schedule in sync.',
      },
      {
        q: 'Is my data saved across devices?',
        a: 'When you\'re signed in, your tasks, flies, and frog sync to your account automatically.',
      },
      {
        q: 'How do I sign out?',
        a: 'Use Sign Out at the bottom of the menu.',
      },
    ],
  },
  {
    id: 'friends',
    title: 'Inviting friends',
    icon: <Gift className="h-5 w-5" />,
    items: [
      {
        q: 'How do I invite friends?',
        a: 'Use "Invite friends" in the menu to share your link. You and your friend can both earn rewards when they join.',
      },
    ],
  },
];

function matches(item: QA, q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return (
    item.q.toLowerCase().includes(needle) ||
    item.a.toLowerCase().includes(needle)
  );
}

/* ─── Help Center panel ───────────────────────────────────── */
export function HelpCenterPanel({
  onContact,
  onNavigate,
}: {
  onContact: () => void;
  onNavigate?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());

  const filtered = useMemo(
    () =>
      HELP_CATEGORIES.map((cat) => ({
        ...cat,
        items: cat.items.filter((item) => matches(item, query)),
      })).filter((cat) => cat.items.length > 0),
    [query],
  );

  const toggle = (key: string) =>
    setOpenKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-black tracking-tight text-foreground">
          How can we help?
        </h3>
        <p className="mt-0.5 text-sm font-medium text-muted-foreground">
          Browse common questions, or search for what you need.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search help…"
          className="w-full rounded-2xl border border-border/60 bg-muted/40 py-3 pl-10 pr-4 text-sm font-medium text-foreground outline-none transition focus:border-primary/50 focus:bg-background"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-border/50 bg-muted/30 p-6 text-center">
          <p className="text-sm font-bold text-foreground">No results found</p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            Try a different search, or contact us below.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {filtered.map((cat) => (
            <div key={cat.id}>
              <div className="mb-2 flex items-center gap-2 px-1">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  {cat.icon}
                </span>
                <h4 className="text-[13px] font-black text-muted-foreground">
                  {cat.title}
                </h4>
              </div>
              <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
                {cat.items.map((item, i) => {
                  const key = `${cat.id}-${i}`;
                  const isOpen = openKeys.has(key);
                  return (
                    <div
                      key={key}
                      className={cn(i > 0 && 'border-t border-border/50')}
                    >
                      <button
                        type="button"
                        onClick={() => toggle(key)}
                        aria-expanded={isOpen}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/40"
                      >
                        <span className="text-[14px] font-bold text-foreground">
                          {item.q}
                        </span>
                        <ChevronDown
                          className={cn(
                            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                            isOpen && 'rotate-180',
                          )}
                        />
                      </button>
                      {isOpen && (
                        <p className="px-4 pb-4 text-[13px] font-medium leading-relaxed text-muted-foreground">
                          {item.a}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Still need help */}
      <div className="rounded-2xl border border-border/50 bg-muted/30 p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-500">
            <LifeBuoy className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-black text-foreground">
              Still need help?
            </p>
            <p className="text-xs font-medium text-muted-foreground">
              Our team is happy to help you out.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onContact}
          className="mt-3 w-full rounded-2xl bg-primary py-3 text-sm font-black tracking-wide text-primary-foreground transition active:scale-[0.98]"
        >
          Contact us
        </button>
      </div>

      {/* Pricing & legal */}
      <div className="rounded-2xl border border-border/50 bg-muted/30 p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ScrollText className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-black text-foreground">
              Pricing &amp; legal
            </p>
            <p className="text-xs font-medium text-muted-foreground">
              Plans, terms, privacy, and refunds.
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[
            { href: '/support', label: 'Support' },
            { href: '/pricing', label: 'Pricing' },
            { href: '/terms', label: 'Terms of Service' },
            { href: '/privacy', label: 'Privacy Policy' },
            { href: '/refund-policy', label: 'Refund Policy' },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={onNavigate}
              className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-card px-3.5 py-2.5 text-[13px] font-bold text-foreground transition-colors hover:bg-muted/40"
            >
              {link.label}
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Contact Us form ─────────────────────────────────────── */
const CONTACT_TOPICS = [
  { id: 'question', label: 'Question' },
  { id: 'bug', label: 'Bug report' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'billing', label: 'Billing & Plus' },
  { id: 'account', label: 'Account' },
] as const;

type ContactTopic = (typeof CONTACT_TOPICS)[number]['id'];

const SUPPORT_EMAIL = 'help@frogress.com';

export function ContactPanel({
  uid,
  isPremium,
  defaultTopic = 'question',
  onSent,
}: {
  uid: string;
  isPremium: boolean;
  defaultTopic?: ContactTopic;
  onSent?: () => void;
}) {
  const [topic, setTopic] = useState<ContactTopic>(defaultTopic);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  const topicLabel =
    CONTACT_TOPICS.find((t) => t.id === topic)?.label ?? 'Question';

  const handleSend = () => {
    if (!message.trim()) return;

    const platform =
      typeof navigator !== 'undefined' ? navigator.platform : 'unknown';
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
    const timezone =
      typeof Intl !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : 'unknown';

    const lines = [
      message.trim(),
      '',
      '===============',
      'Account Metadata',
      '===============',
      `Topic: ${topicLabel}`,
      `Account: ${uid}`,
      `Plus: ${isPremium ? 'Yes' : 'No'}`,
      `OS / Platform: ${platform}`,
      `User Agent: ${ua}`,
      `Timezone: ${timezone}`,
      `Sent At: ${new Date().toISOString()}`,
    ];

    const subject = encodeURIComponent(`Frogress — ${topicLabel}`);
    const body = encodeURIComponent(lines.join('\n'));
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
    setSent(true);
    onSent?.();
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-black tracking-tight text-foreground">
          Contact us
        </h3>
        <p className="mt-0.5 text-sm font-medium text-muted-foreground">
          Tell us what&apos;s up and we&apos;ll get back to you by email.
        </p>
      </div>

      {/* Topic */}
      <div>
        <label className="mb-2 block px-1 text-[13px] font-black text-muted-foreground">
          Topic
        </label>
        <div className="flex flex-wrap gap-2">
          {CONTACT_TOPICS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTopic(t.id)}
              className={cn(
                'rounded-xl border px-3 py-2 text-[13px] font-bold transition-colors',
                topic === t.id
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-border/60 bg-muted/40 text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Message */}
      <div>
        <label className="mb-2 block px-1 text-[13px] font-black text-muted-foreground">
          Message
        </label>
        <textarea
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            setSent(false);
          }}
          rows={6}
          placeholder="Describe your question or issue. Screenshots are super helpful — you can attach them in your email app."
          className="w-full resize-none rounded-2xl border border-border/60 bg-muted/40 p-4 text-base font-medium leading-relaxed text-foreground outline-none transition focus:border-primary/50 focus:bg-background sm:text-sm"
        />
      </div>

      <button
        type="button"
        onClick={handleSend}
        disabled={!message.trim()}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-black tracking-wide text-primary-foreground transition active:scale-[0.98] disabled:opacity-50"
      >
        <Send className="h-4 w-4" />
        Send message
      </button>

      {sent && (
        <div className="flex items-center justify-center gap-2 text-[13px] font-bold text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
          Opening your email app…
        </div>
      )}

      <p className="text-center text-xs font-medium text-muted-foreground">
        This opens your email app to send to{' '}
        <span className="font-bold text-foreground">{SUPPORT_EMAIL}</span>. We
        include a few account details to help us assist you faster.
      </p>
    </div>
  );
}
