'use client';

import { useEffect, useRef, useState } from 'react';
import { mutate } from 'swr';
import { Check, Flame, Lock, Play, Timer } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { Icon } from '@/components/ui/Icon';
import Fly from './fly';
import { PlusUpgradeModal } from './PlusUpgradeModal';
import {
  BareRewardIcon,
  FlyWorth,
  questLoot,
  type QuestRewardCatalogItem,
} from './QuestCards';
import type {
  CategoryQuestProgressView,
  MacroCategoryDefinition,
} from '@/lib/quests/types';

type LimitPick = {
  tagLimit: number;
  tags: Array<{ id: string; name: string; color: string; locked?: boolean }>;
};

export function QuestStartSheet({
  open,
  category,
  quest,
  rewardCatalog,
  isPremium,
  onClose,
  onDone,
}: {
  open: boolean;
  category: MacroCategoryDefinition | null;
  quest?: CategoryQuestProgressView | null;
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  isPremium: boolean;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  // Keep the last category (and quest) rendered during the close animation.
  const lastCategoryRef = useRef(category);
  if (open && category) lastCategoryRef.current = category;
  const activeCategory = category ?? lastCategoryRef.current;
  const lastQuestRef = useRef(quest);
  if (open && quest) lastQuestRef.current = quest;
  const activeQuest = quest ?? lastQuestRef.current;

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when the user is at their tag limit: they pick one of their existing
  // tags to power the quest instead of us creating a new one.
  const [limitPick, setLimitPick] = useState<LimitPick | null>(null);
  const [pickedTagId, setPickedTagId] = useState<string | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSubmitting(false);
    setError(null);
    setLimitPick(null);
    setPickedTagId(null);
  }, [open, activeCategory?.id]);

  const handleStart = async () => {
    if (!activeCategory || submitting) return;
    if (limitPick && !pickedTagId) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        categoryId: activeCategory.id,
        taskIds: [],
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      if (limitPick && pickedTagId) {
        payload.tagId = pickedTagId;
      } else {
        payload.tagName = activeCategory.name;
        payload.tagColor = activeCategory.accent;
      }
      const res = await fetch('/api/quests/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok) {
        if (result.code === 'TAG_LIMIT') {
          setLimitPick({
            tagLimit: result.tagLimit ?? 6,
            tags: Array.isArray(result.tags) ? result.tags : [],
          });
          return;
        }
        throw new Error(result.error || 'Could not start the quest');
      }
      mutate('/api/tags');
      await onDone();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not start the quest',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!activeCategory) return null;

  const accent = activeCategory.accent || '#22c55e';
  const name = activeCategory.name;
  const exampleTask =
    activeCategory.taskSuggestions?.[0] ?? `A ${name.toLowerCase()} task`;
  const loot = activeQuest ? questLoot(activeQuest) : { flies: 0, items: [] };
  const lootTiles = loot.items.slice(0, 2);

  const tagChip = (
    <span
      className="inline-flex items-center rounded-lg border px-2 py-0.5 text-[11px] font-black uppercase tracking-wider align-[-2px]"
      style={{
        backgroundColor: `${accent}20`,
        color: accent,
        borderColor: `${accent}40`,
      }}
    >
      {name}
    </span>
  );

  return (
    <BaseSheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      zIndex={1500}
      className="bg-background ring-1 ring-border/70 sm:max-w-[480px] max-h-[92vh]"
    >
      {({ bindScroll }) => (
        <div
          ref={bindScroll}
          className="mx-auto w-full overflow-y-auto overscroll-none px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-1 sm:pb-6"
        >
          {activeCategory.coverImageUrl ? (
            <div className="relative mb-4 mt-4 h-28 overflow-hidden rounded-[20px] sm:mt-12">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activeCategory.coverImageUrl}
                alt={name}
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
              <span
                className="absolute bottom-2.5 left-3.5 text-[22px] uppercase leading-none tracking-wide text-white drop-shadow-[0_3px_0_rgba(15,23,42,0.9)]"
                style={{
                  fontFamily: 'var(--font-display), "Luckiest Guy", cursive',
                  WebkitTextStroke: '2px rgba(15, 23, 42, 0.95)',
                  paintOrder: 'stroke fill',
                }}
              >
                {name}
              </span>
            </div>
          ) : (
            <div className="relative mb-1 flex h-9 items-center justify-center">
              <h2 className="text-[17px] font-black text-foreground">
                {name}
              </h2>
            </div>
          )}

          <p className="mb-4 text-center text-[14px] font-semibold leading-snug text-muted-foreground">
            Extra rewards for working on your{' '}
            <span className="font-black text-foreground">
              {name.toLowerCase()}
            </span>
            . Here&apos;s the whole game:
          </p>

          <div className="rounded-[20px] border border-border/60 bg-muted/30 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">
              <StepDot accent={accent}>1</StepDot>
              Tag your tasks
            </p>
            {/* A task exactly as it looks on the Today list, wearing the tag. */}
            <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card px-3.5 py-2.5 shadow-sm">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap gap-1">
                  <span
                    className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-normal shadow-sm md:text-[11px]"
                    style={{
                      backgroundColor: `${accent}20`,
                      color: accent,
                      borderColor: `${accent}40`,
                    }}
                  >
                    {name}
                  </span>
                </div>
                <span className="text-[15px] font-semibold leading-snug text-foreground">
                  {exampleTask}
                </span>
              </div>
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/20 bg-muted">
                <Fly size={40} y={-3} paused interactive={false} />
              </div>
            </div>
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            <div className="rounded-[20px] border border-border/60 bg-muted/30 p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                <StepDot accent={accent}>2</StepDot>
                Do them
              </p>
              <div className="mt-1.5 flex flex-col gap-1 text-[12px] font-bold leading-snug text-foreground">
                <span className="flex items-center gap-1.5">
                  <Check
                    className="h-3.5 w-3.5 shrink-0"
                    strokeWidth={3}
                    style={{ color: accent }}
                  />
                  Complete them
                </span>
                <span className="flex items-center gap-1.5">
                  <Timer
                    className="h-3.5 w-3.5 shrink-0"
                    strokeWidth={2.5}
                    style={{ color: accent }}
                  />
                  Focus on them
                </span>
                <span className="flex items-center gap-1.5">
                  <Flame
                    className="h-3.5 w-3.5 shrink-0 fill-current"
                    strokeWidth={2.5}
                    style={{ color: accent }}
                  />
                  Keep streaks
                </span>
              </div>
            </div>
            <div className="rounded-[20px] border border-border/60 bg-muted/30 p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                <StepDot accent={accent}>3</StepDot>
                Get paid
              </p>
              <div className="mt-2 flex flex-col items-start gap-1.5">
                {loot.flies > 0 && <FlyWorth amount={loot.flies} />}
                {lootTiles.length > 0 && (
                  <span className="flex flex-wrap items-center gap-1.5">
                    {lootTiles.map((reward, index) => (
                      <BareRewardIcon
                        key={`${reward.type}-${reward.itemId ?? reward.backgroundId ?? index}`}
                        reward={reward}
                        rewardCatalog={rewardCatalog}
                        isPremium={isPremium}
                      />
                    ))}
                  </span>
                )}
                {loot.flies === 0 && lootTiles.length === 0 && (
                  <span className="text-[12px] font-bold text-foreground">
                    Flies &amp; gear
                  </span>
                )}
              </div>
            </div>
          </div>

          {limitPick && (
            <div className="mt-4 rounded-[20px] border border-amber-400/50 bg-amber-500/10 p-3.5">
              <p className="text-[13px] font-black leading-snug text-foreground">
                You&apos;ve used all {limitPick.tagLimit} of your tags.
              </p>
              <p className="mt-0.5 text-[12px] font-semibold leading-snug text-muted-foreground">
                Pick one of them to track {name} instead:
              </p>
              {limitPick.tags.length > 0 ? (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {limitPick.tags.map((tag) => {
                    if (tag.locked) {
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => setPlusOpen(true)}
                          aria-label={`${tag.name} is locked — unlock with Plus`}
                          className="inline-flex h-9 max-w-full items-center gap-1.5 rounded-xl border border-dashed border-border bg-muted px-3 text-[11px] font-black uppercase tracking-wider text-muted-foreground/70 transition-all active:scale-95"
                        >
                          <span className="truncate">{tag.name}</span>
                          <Lock className="h-3 w-3 shrink-0" />
                        </button>
                      );
                    }
                    const selected = pickedTagId === tag.id;
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => setPickedTagId(tag.id)}
                        className={`inline-flex h-9 max-w-full items-center gap-1.5 rounded-xl border px-3 text-[11px] font-black uppercase tracking-wider shadow-sm transition-all active:scale-95 ${
                          selected ? 'ring-2 ring-offset-1 ring-offset-background' : ''
                        }`}
                        style={{
                          backgroundColor: `${tag.color}20`,
                          color: tag.color,
                          borderColor: `${tag.color}40`,
                        }}
                      >
                        {selected && (
                          <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={3.5} />
                        )}
                        <span className="truncate">{tag.name}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-2 text-[12px] font-semibold text-muted-foreground">
                  All your tags are already linked to other areas — free one up
                  first, or get more with Plus.
                </p>
              )}
              <button
                type="button"
                onClick={() => setPlusOpen(true)}
                aria-label="Get up to 50 tags with Frog Plus"
                className="relative isolate mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl px-3 ring-2 ring-amber-200/80 transition-transform active:scale-[0.98]"
              >
                <span
                  aria-hidden
                  className="absolute inset-0 -z-10 rounded-xl bg-[linear-gradient(125deg,#fde68a_0%,#fbbf24_45%,#f59e0b_75%,#d97706_100%)]"
                />
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 -z-10 h-1/2 rounded-t-xl bg-gradient-to-b from-white/45 to-transparent"
                />
                <Icon
                  name="frogPlus"
                  className="-my-5 -ml-1 h-12 w-12 shrink-0 drop-shadow-[0_2px_0_rgba(31,98,28,0.4)]"
                />
                <span className="text-[12px] font-black uppercase tracking-wide text-emerald-900 drop-shadow-[0_1px_0_rgba(255,255,255,0.5)]">
                  Up to 50 tags with
                </span>
                <span className="inline-flex items-center rounded-lg bg-gradient-to-b from-emerald-600 to-emerald-800 px-2 py-1 text-[10px] font-black uppercase leading-none tracking-[0.14em] text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] ring-1 ring-emerald-900/40">
                  Plus
                </span>
              </button>
            </div>
          )}

          {error && (
            <p className="mt-4 text-center text-[12px] font-bold text-red-500">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleStart}
            disabled={submitting || (!!limitPick && !pickedTagId)}
            className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-[28px] bg-[#4f9149] text-[16px] font-black text-white shadow-[0_4px_0_0_#34631f] ring-1 ring-[#34631f]/40 transition-all [@media(hover:hover)]:hover:bg-[#579e51] active:translate-y-1 active:shadow-none disabled:pointer-events-none disabled:opacity-50 disabled:grayscale"
          >
            <Play className="h-4 w-4 fill-current" />
            {submitting ? 'Starting...' : 'Start quest'}
          </button>
          {!limitPick && (
            <p className="mt-2.5 text-center text-[12px] font-semibold leading-snug text-muted-foreground">
              We&apos;ll create the {tagChip} tag for you — change it any time.
            </p>
          )}
          <PlusUpgradeModal
            open={plusOpen}
            placement="quest_start_tag_limit"
            onClose={() => setPlusOpen(false)}
          />
        </div>
      )}
    </BaseSheet>
  );
}

function StepDot({
  accent,
  children,
}: {
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-black text-white"
      style={{ backgroundColor: accent }}
    >
      {children}
    </span>
  );
}
