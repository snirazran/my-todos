'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Wrench } from 'lucide-react';
import { AdminCard, AdminPage, IconTile, SectionLabel } from '@/components/admin/kit';
import { ADMIN_NAV } from '@/components/admin/AdminShell';
import {
  PROMPT_KIND_EMOJI,
  entryMeta,
  rewardLabel,
  slotHeadline,
  type AdminRecipe,
} from '@/components/admin/quests/types';
import type { QuestPromptKind } from '@/lib/quests/types';

type PromptLite = {
  promptId: string;
  kind: QuestPromptKind;
  question: string;
  isActive: boolean;
  dateKey: string | null;
};

const GROUP_BLURBS: Record<string, string> = {
  Players: 'Who is playing, how they are doing, and handing someone a reward.',
  'Quests page': 'The daily lineup, the question your frog asks, and the monthly pass.',
  'New players': 'What someone sees in their first days: focus areas, the starter plan and the nudge to try the web.',
  'Habits & streaks': 'The daily streak, the weekly Leap, and what a long task streak pays.',
  'Closet & shop': 'What players can collect, and how the shop and trade-ups work.',
  Flies: 'How many flies a day can pay, from where, and when an ad pays instead.',
  Growth: 'Popups, offers and invites that bring players in and back.',
  Testing: 'Tools for your own account. Nothing here touches players.',
};

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function AdminOverviewPage() {
  const [recipe, setRecipe] = useState<AdminRecipe | null>(null);
  const [prompts, setPrompts] = useState<PromptLite[] | null>(null);

  useEffect(() => {
    fetch('/api/admin/quest-recipes', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setRecipe((data?.recipes?.[0] as AdminRecipe | undefined) ?? null))
      .catch(() => {});
    fetch('/api/admin/quest-prompts', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setPrompts((data?.prompts as PromptLite[] | undefined) ?? []))
      .catch(() => {});
  }, []);

  const today = todayKey();
  const activePrompts = (prompts ?? []).filter((prompt) => prompt.isActive);
  const nextPinned = activePrompts
    .filter((prompt) => prompt.dateKey && prompt.dateKey >= today)
    .sort((a, b) => (a.dateKey ?? '').localeCompare(b.dateKey ?? ''))[0];

  return (
    <AdminPage
      title={`${greeting()}, pond keeper`}
      subtitle="Everything that shapes a player's day, grouped by where they meet it."
      icon={<span className="text-[24px]">🐸</span>}
    >
      <div className="space-y-8">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <AdminCard
            title="Today's daily quests"
            subtitle={
              recipe
                ? recipe.isActive
                  ? `${recipe.slots.length} quests, live for everyone`
                  : 'Switched off. Players see no daily quests.'
                : 'Loading the lineup…'
            }
            icon={<span className="text-[20px]">✅</span>}
            actions={<OpenLink href="/admin/quests?tab=daily" label="Edit" />}
            bodyClassName="pt-3"
          >
            <ol className="space-y-2">
              {(recipe?.slots ?? []).map((slot, index) => (
                <li key={slot.id} className="flex items-center gap-3 rounded-2xl bg-muted/50 px-3 py-2.5">
                  <span className="text-[18px]">{entryMeta(slot.pool[0]?.type ?? 'count').emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-black uppercase tracking-[0.08em] text-muted-foreground">
                      Quest {index + 1}
                      {slot.pool.length > 1 ? ` · 1 of ${slot.pool.length}` : ''}
                    </span>
                    <span className="block truncate text-[14px] font-black">{slotHeadline(slot)}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-card px-2.5 py-1 text-[11px] font-black text-muted-foreground shadow-[0_2px_0_0_hsl(var(--border))]">
                    {[...slot.pool].sort((a, b) => b.weight - a.weight)[0]?.type === 'season_step'
                      ? 'Tier prize'
                      : slot.rewards[0]
                        ? rewardLabel(slot.rewards[0])
                        : 'No reward'}
                  </span>
                </li>
              ))}
            </ol>
          </AdminCard>

          <AdminCard
            title="Frog asks"
            subtitle={prompts ? `${activePrompts.length} questions in rotation` : 'Counting questions…'}
            icon={<span className="text-[20px]">🐸</span>}
            tone="grape"
            actions={<OpenLink href="/admin/quests?tab=asks" label="Library" />}
            bodyClassName="space-y-3 pt-3"
          >
            <div className="grid grid-cols-4 gap-2">
              {(['journal', 'poll', 'this_or_that', 'checkin'] as QuestPromptKind[]).map((kind) => (
                <div key={kind} className="rounded-2xl bg-muted/50 py-2 text-center">
                  <p className="text-[18px] leading-none">{PROMPT_KIND_EMOJI[kind]}</p>
                  <p className="mt-1 text-[16px] font-black tabular-nums">
                    {activePrompts.filter((prompt) => prompt.kind === kind).length}
                  </p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5">
              <p className="text-[11px] font-black uppercase tracking-[0.08em] text-amber-700 dark:text-amber-400">
                {nextPinned ? (nextPinned.dateKey === today ? 'Pinned for today' : `Next pinned · ${nextPinned.dateKey}`) : 'Nothing pinned'}
              </p>
              <p className="mt-0.5 text-[13px] font-black">
                {nextPinned ? nextPinned.question : 'Pin a question to a date for holidays and events.'}
              </p>
            </div>
          </AdminCard>
        </div>

        <div className="space-y-3">
          <SectionLabel>Everything in the pond</SectionLabel>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {ADMIN_NAV.filter((group) => group.title).map((group) => (
              <AdminCard
                key={group.title}
                title={group.title}
                subtitle={GROUP_BLURBS[group.title ?? ''] ?? undefined}
                bodyClassName="pt-2"
              >
                <ul className="-mx-2">
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="group flex items-center gap-3 rounded-xl px-2 py-2 text-[14px] font-bold text-foreground transition hover:bg-muted/60"
                      >
                        <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center text-muted-foreground group-hover:text-primary [&>svg]:h-[19px] [&>svg]:w-[19px]">
                          {item.icon}
                        </span>
                        <span className="flex-1">{item.label}</span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground/50 transition group-hover:translate-x-0.5 group-hover:text-primary" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </AdminCard>
            ))}
          </div>
        </div>

        <Link
          href="/admin/tools"
          className="flex items-center gap-4 rounded-[24px] border border-dashed border-border bg-card/50 p-5 transition hover:border-primary/40 hover:bg-card"
        >
          <IconTile tone="stone">
            <Wrench />
          </IconTile>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-black">My test account</p>
            <p className="text-[13px] font-medium text-muted-foreground">
              Add flies, toggle Plus, send a test push, or reset your own quests, Leaps and tasks.
            </p>
          </div>
          <ArrowRight className="h-5 w-5 text-muted-foreground" />
        </Link>
      </div>
    </AdminPage>
  );
}

function OpenLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex h-8 items-center gap-1 rounded-xl border border-border bg-card px-3 text-[12px] font-black shadow-[0_2px_0_0_hsl(var(--border))] transition hover:bg-muted/50"
    >
      {label}
      <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}
