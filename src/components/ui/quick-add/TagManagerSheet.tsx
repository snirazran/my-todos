'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import {
  Check,
  ListChecks,
  Lock,
  Repeat,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { Icon } from '@/components/ui/Icon';
import { PlusUpgradeModal } from '../PlusUpgradeModal';
import { TAG_COLORS, TAG_MAX_LENGTH } from './constants';
import { fetcher } from './utils';
import type { SavedTag } from './types';

type TagUsageTask = {
  id: string;
  text: string;
  type: 'repeating' | 'once';
  when: string;
};

type TagUsage = {
  tasks: TagUsageTask[];
  focus: { categoryId: string; name: string; accent?: string } | null;
};

type QuestContext = {
  isPremium?: boolean;
  activeFocusCategoryId?: string | null;
  onboarding?: {
    complete?: boolean;
    selectedCategoryIds?: string[];
    categoryTagMap?: { categoryId: string; tagIds: string[] }[];
  };
  macroCategories?: {
    id: string;
    name: string;
    shortLabel?: string;
    accent?: string;
  }[];
};

type FocusConfirm =
  | { type: 'replace'; areaId: string; areaName: string; occupiedName: string }
  | { type: 'move'; areaId: string; areaName: string; fromAreaName: string }
  | { type: 'disconnect'; areaName: string };

interface Props {
  open: boolean;
  tag: SavedTag | null;
  onClose: () => void;
  onSave: (updates: { name: string; color: string }) => void;
  onDelete: () => void;
}

export function TagManagerSheet({ open, tag, onClose, onSave, onDelete }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState('');
  const [focusConfirm, setFocusConfirm] = useState<FocusConfirm | null>(null);
  const [showPlus, setShowPlus] = useState(false);
  const [savingFocus, setSavingFocus] = useState(false);
  const [focusError, setFocusError] = useState('');

  // Keep the last tag so the slide-down exit can still render after the parent
  // clears it.
  const lastTagRef = useRef<SavedTag | null>(tag);
  useEffect(() => {
    if (tag) lastTagRef.current = tag;
  }, [tag]);
  const displayTag = tag ?? lastTagRef.current;

  // Seed the staged fields whenever a (different) tag opens.
  useEffect(() => {
    if (open && tag) {
      setName(tag.name);
      setColor(tag.color);
      setConfirmDelete(false);
      setFocusConfirm(null);
      setFocusError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tag?.id]);

  const tz =
    typeof window !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : 'UTC';
  const { data, mutate } = useSWR<TagUsage>(
    open && tag ? `/api/tags?usage=${tag.id}&timezone=${encodeURIComponent(tz)}` : null,
    fetcher,
  );
  const tasks = data?.tasks ?? [];

  const questKey = `/api/quests?view=home&timezone=${encodeURIComponent(tz)}`;
  const { data: questContext, mutate: mutateQuests } = useSWR<QuestContext>(
    open && tag ? questKey : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const { data: tagsData } = useSWR<{ tags?: SavedTag[] }>(
    open && tag ? '/api/tags' : null,
    fetcher,
  );

  const isPremium = !!questContext?.isPremium;
  const activeFocusCategoryId = questContext?.activeFocusCategoryId ?? null;
  const focusAreas = useMemo(() => {
    const categories = questContext?.macroCategories ?? [];
    const selected = questContext?.onboarding?.selectedCategoryIds ?? [];
    return selected
      .map((id) => categories.find((entry) => entry.id === id))
      .filter((entry): entry is NonNullable<typeof entry> => !!entry);
  }, [questContext]);
  const categoryTagMap = questContext?.onboarding?.categoryTagMap ?? [];
  const connectedAreaId = useMemo(() => {
    if (!displayTag) return null;
    return (
      categoryTagMap.find((entry) => entry.tagIds.includes(displayTag.id))
        ?.categoryId ?? null
    );
  }, [categoryTagMap, displayTag]);

  const tagNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tagsData?.tags ?? []) map.set(t.id, t.name);
    return map;
  }, [tagsData]);

  // Keep the "used in" list live — refetch whenever tasks/tags change elsewhere
  // (e.g. the tag is added to a new task) so no manual refresh is needed.
  useEffect(() => {
    if (!open) return;
    const refresh = () => mutate();
    window.addEventListener('tags-updated', refresh);
    window.addEventListener('board-refresh', refresh);
    return () => {
      window.removeEventListener('tags-updated', refresh);
      window.removeEventListener('board-refresh', refresh);
    };
  }, [open, mutate]);

  if (!displayTag) return null;

  const trimmed = name.trim();
  const dirty =
    !!trimmed && (trimmed !== displayTag.name || color !== displayTag.color);

  const saveFocusConnection = async (targetAreaId: string | null) => {
    if (savingFocus || !questContext?.onboarding) return;
    const selectedCategoryIds =
      questContext.onboarding.selectedCategoryIds ?? [];
    if (selectedCategoryIds.length === 0) return;

    setSavingFocus(true);
    setFocusError('');
    try {
      const nextMap = categoryTagMap
        .map((entry) => ({
          categoryId: entry.categoryId,
          tagIds: entry.tagIds.filter((id) => id !== displayTag.id),
        }))
        .filter(
          (entry) =>
            entry.tagIds.length > 0 && entry.categoryId !== targetAreaId,
        );
      if (targetAreaId) {
        const existing =
          categoryTagMap
            .find((entry) => entry.categoryId === targetAreaId)
            ?.tagIds.filter((id) => id !== displayTag.id) ?? [];
        nextMap.push({
          categoryId: targetAreaId,
          tagIds: isPremium ? [...existing, displayTag.id] : [displayTag.id],
        });
      }

      const res = await fetch('/api/quests/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedCategoryIds,
          categoryTagMap: nextMap,
          createSuggestions: false,
          timezone: tz,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || 'Could not update focus area');
      }
      await mutateQuests();
      globalMutate(questKey);
      mutate();
      window.dispatchEvent(new Event('tags-updated'));
    } catch (err) {
      setFocusError(
        err instanceof Error ? err.message : 'Could not update focus area',
      );
    } finally {
      setSavingFocus(false);
    }
  };

  const handleAreaTap = (areaId: string | null) => {
    if (savingFocus) return;
    if (areaId === connectedAreaId) return;

    if (areaId === null) {
      const fromArea = focusAreas.find((a) => a.id === connectedAreaId);
      setFocusConfirm({
        type: 'disconnect',
        areaName: fromArea?.name ?? 'its focus area',
      });
      return;
    }

    const area = focusAreas.find((a) => a.id === areaId);
    if (!area) return;

    const occupiedId = categoryTagMap
      .find((entry) => entry.categoryId === areaId)
      ?.tagIds.find((id) => id !== displayTag.id);
    if (!isPremium && occupiedId) {
      setFocusConfirm({
        type: 'replace',
        areaId,
        areaName: area.name,
        occupiedName: tagNameById.get(occupiedId) ?? 'its current tag',
      });
      return;
    }

    if (connectedAreaId) {
      const fromArea = focusAreas.find((a) => a.id === connectedAreaId);
      setFocusConfirm({
        type: 'move',
        areaId,
        areaName: area.name,
        fromAreaName: fromArea?.name ?? 'another focus area',
      });
      return;
    }

    void saveFocusConnection(areaId);
  };

  const confirmFocusChange = () => {
    if (!focusConfirm) return;
    const target =
      focusConfirm.type === 'disconnect' ? null : focusConfirm.areaId;
    setFocusConfirm(null);
    void saveFocusConnection(target);
  };

  const showFocusSection =
    !!questContext?.onboarding && focusAreas.length > 0;
  const focusLoading = open && !!tag && !questContext;

  return (
    <>
      <BaseSheet
        open={open}
        onOpenChange={(v) => !v && onClose()}
        zIndex={1700}
        className="bg-background ring-1 ring-border/70 sm:max-w-[480px] max-h-[88vh]"
      >
        {({ bindScroll }) => (
          <>
          <div
            ref={bindScroll}
            className="mx-auto w-full min-h-0 flex-1 overflow-y-auto overscroll-none px-5 pt-1"
          >
            {/* Header — delete (left); close is the sheet's standard top-right X */}
            <div className="relative mb-5 flex h-9 items-center justify-center">
              <h2 className="text-[18px] font-extrabold text-muted-foreground">
                Edit tag
              </h2>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                aria-label="Delete tag"
                title="Delete tag"
                className="absolute left-0 grid h-10 w-10 place-items-center rounded-full bg-rose-100/70 text-rose-600 transition-colors hover:bg-rose-200/70 dark:bg-rose-500/15 dark:text-rose-300"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </div>

            {/* Name */}
            <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
              Name
            </div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={TAG_MAX_LENGTH}
              placeholder="Tag name"
              className="mb-4 h-12 w-full rounded-2xl border border-border bg-background px-4 text-base font-bold text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30"
            />

            {/* Color */}
            <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
              Color
            </div>
            <div className="mb-4 flex flex-wrap gap-2.5">
              {TAG_COLORS.map((c) => {
                const isActive = color === c.value;
                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => setColor(c.value)}
                    title={c.name}
                    className={`grid h-9 w-9 place-items-center rounded-full ${c.bg} ring-2 ring-offset-2 ring-offset-background transition-transform active:scale-95 ${
                      isActive ? 'scale-110 ring-foreground/70' : 'ring-transparent'
                    }`}
                  >
                    {isActive && <Check className="h-4 w-4 text-white" strokeWidth={3.5} />}
                  </button>
                );
              })}
            </div>

            {/* Live preview */}
            <div className="mb-5 flex items-center gap-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
                Preview
              </span>
              <span
                className="inline-flex max-w-[60%] items-center rounded-2xl border px-3.5 py-2 text-[13px] font-black uppercase tracking-wider shadow-sm"
                style={{
                  backgroundColor: `${color}20`,
                  borderColor: `${color}40`,
                  color,
                }}
              >
                <span className="truncate">{trimmed || 'Tag'}</span>
              </span>
            </div>

            {/* Focus area connection */}
            {(showFocusSection || focusLoading) && (
              <div className="mb-5">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" />
                  Focus area
                </div>
                <p className="mb-2.5 text-[12px] font-medium leading-snug text-muted-foreground">
                  Tasks with this tag count toward that area&rsquo;s quest.
                </p>

                {focusLoading ? (
                  <div className="flex flex-wrap gap-2">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="h-11 w-24 animate-pulse rounded-2xl bg-muted"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={savingFocus}
                      onClick={() => handleAreaTap(null)}
                      className={`inline-flex h-11 items-center gap-1.5 rounded-2xl border px-3.5 text-[13px] font-black uppercase tracking-wider transition-all active:scale-95 disabled:opacity-60 ${
                        connectedAreaId === null
                          ? 'border-foreground/30 bg-muted text-foreground'
                          : 'border-border bg-background text-muted-foreground'
                      }`}
                    >
                      {connectedAreaId === null && (
                        <Check className="h-3.5 w-3.5" strokeWidth={3.5} />
                      )}
                      None
                    </button>
                    {focusAreas.map((area) => {
                      const isConnected = connectedAreaId === area.id;
                      const isActiveFocus =
                        !isPremium && activeFocusCategoryId === area.id;
                      const accent = area.accent || '#22c55e';
                      const occupied = categoryTagMap
                        .find((entry) => entry.categoryId === area.id)
                        ?.tagIds.some((id) => id !== displayTag.id);
                      return (
                        <button
                          key={area.id}
                          type="button"
                          disabled={savingFocus}
                          onClick={() => handleAreaTap(area.id)}
                          className={`relative inline-flex h-11 items-center gap-1.5 rounded-2xl border px-3.5 text-[13px] font-black uppercase tracking-wider transition-all active:scale-95 disabled:opacity-60 ${
                            isConnected ? 'ring-2 ring-offset-1 ring-offset-background' : ''
                          }`}
                          style={{
                            backgroundColor: `${accent}${isConnected ? '2b' : '14'}`,
                            borderColor: `${accent}40`,
                            color: accent,
                            ...(isConnected
                              ? ({ ['--tw-ring-color' as never]: accent } as object)
                              : {}),
                          }}
                        >
                          {isConnected ? (
                            <Check className="h-3.5 w-3.5" strokeWidth={3.5} />
                          ) : !isPremium && occupied ? (
                            <Lock className="h-3 w-3 opacity-70" strokeWidth={2.75} />
                          ) : null}
                          <span className="truncate">{area.name}</span>
                          {isActiveFocus && (
                            <span
                              className="rounded-md px-1.5 py-0.5 text-[8px] font-black tracking-[0.14em] text-white"
                              style={{ backgroundColor: accent }}
                            >
                              ACTIVE
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {focusError && (
                  <p className="mt-2 text-[12px] font-bold text-destructive">
                    {focusError}
                  </p>
                )}

                {!focusLoading && !isPremium && (
                  <button
                    type="button"
                    onClick={() => setShowPlus(true)}
                    className="mt-2.5 inline-flex items-center gap-1.5 rounded-xl bg-amber-400/10 px-3 py-2 text-left text-[11px] font-bold leading-snug text-amber-700 transition-colors hover:bg-amber-400/20 dark:text-amber-300"
                  >
                    <Lock className="h-3.5 w-3.5 shrink-0" strokeWidth={2.75} />
                    <span>
                      Free plan: 1 tag per area, 1 active area.{' '}
                      <span className="underline underline-offset-2">
                        Plus connects unlimited tags
                      </span>
                    </span>
                  </button>
                )}
              </div>
            )}

            {/* Tasks using this tag */}
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
              <ListChecks className="h-3.5 w-3.5" />
              Used in {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
            </div>
            {tasks.length > 0 ? (
              <div className="mb-5 max-h-[30vh] space-y-1.5 overflow-y-auto">
                {tasks.map((t) => (
                  <div
                    key={`${t.type}-${t.id}`}
                    className="flex items-center gap-2.5 rounded-2xl border border-border/50 bg-muted/30 px-3.5 py-2.5"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-foreground">
                      {t.text}
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-muted-foreground">
                      {t.type === 'repeating' && <Repeat className="h-3 w-3" />}
                      {t.when}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mb-2 rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-4 text-center text-[13px] font-medium text-muted-foreground">
                Not used by any upcoming tasks.
              </p>
            )}
          </div>

          {/* Pinned Save footer — always visible regardless of scroll. */}
          <div className="shrink-0 border-t border-border/50 bg-background px-5 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
            <button
              type="button"
              disabled={!dirty}
              onClick={() => onSave({ name: trimmed, color })}
              className="h-12 w-full rounded-2xl bg-primary text-[15px] font-extrabold text-primary-foreground transition-transform active:scale-[0.985] disabled:opacity-40 disabled:active:scale-100"
            >
              Save changes
            </button>
          </div>
          </>
        )}
      </BaseSheet>

      {/* Focus connection confirmation */}
      <BaseSheet
        open={!!focusConfirm}
        onOpenChange={(v) => !v && setFocusConfirm(null)}
        zIndex={1720}
        className="sm:max-w-[400px] max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-3rem)]"
      >
        {({ bindScroll }) => (
          <div
            ref={bindScroll}
            className="relative overflow-y-auto overscroll-none px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 text-card-foreground sm:px-6 sm:pb-6"
          >
            <div
              className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-sm"
              style={{ backgroundColor: color }}
            >
              <Sparkles className="h-7 w-7" strokeWidth={2.5} />
            </div>
            <h3 className="text-center text-xl font-black text-foreground">
              {focusConfirm?.type === 'replace'
                ? `Replace “${focusConfirm.occupiedName}”?`
                : focusConfirm?.type === 'move'
                  ? `Move to ${focusConfirm.areaName}?`
                  : 'Disconnect tag?'}
            </h3>
            <p className="mx-auto mt-1.5 max-w-[20rem] text-center text-[14px] leading-snug text-muted-foreground">
              {focusConfirm?.type === 'replace' ? (
                <>
                  <span className="font-bold text-foreground">
                    {focusConfirm.areaName}
                  </span>{' '}
                  counts one tag on the free plan.{' '}
                  <span className="font-bold" style={{ color }}>
                    {displayTag.name}
                  </span>{' '}
                  will take the place of{' '}
                  <span className="font-bold text-foreground">
                    {focusConfirm.occupiedName}
                  </span>
                  .
                </>
              ) : focusConfirm?.type === 'move' ? (
                <>
                  A tag powers one focus area at a time.{' '}
                  <span className="font-bold text-foreground">
                    {focusConfirm.fromAreaName}
                  </span>{' '}
                  will stop counting{' '}
                  <span className="font-bold" style={{ color }}>
                    {displayTag.name}
                  </span>
                  .
                </>
              ) : focusConfirm ? (
                <>
                  <span className="font-bold text-foreground">
                    {focusConfirm.areaName}
                  </span>
                  &rsquo;s quest will stop counting tasks tagged{' '}
                  <span className="font-bold" style={{ color }}>
                    {displayTag.name}
                  </span>
                  .
                </>
              ) : null}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFocusConfirm(null)}
                className="h-12 rounded-2xl bg-muted text-[14px] font-black text-foreground transition hover:bg-muted/80"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmFocusChange}
                className="h-12 rounded-2xl bg-primary text-[14px] font-black uppercase tracking-wide text-primary-foreground transition active:translate-y-[2px]"
              >
                {focusConfirm?.type === 'replace'
                  ? 'Replace'
                  : focusConfirm?.type === 'move'
                    ? 'Move'
                    : 'Disconnect'}
              </button>
            </div>
            {focusConfirm?.type === 'replace' && (
              <button
                type="button"
                onClick={() => {
                  setFocusConfirm(null);
                  setShowPlus(true);
                }}
                aria-label="Connect unlimited tags with Frog Plus"
                className="group relative isolate mt-4 flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl px-4 ring-2 ring-amber-200/80 transition-transform active:scale-[0.98]"
              >
                <span
                  aria-hidden
                  className="absolute inset-0 -z-10 rounded-2xl bg-[linear-gradient(125deg,#fde68a_0%,#fbbf24_45%,#f59e0b_75%,#d97706_100%)]"
                />
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 -z-10 h-1/2 rounded-t-2xl bg-gradient-to-b from-white/45 to-transparent"
                />
                <Icon
                  name="frogPlus"
                  className="-my-8 -ml-1 h-20 w-20 drop-shadow-[0_3px_0_rgba(31,98,28,0.4)]"
                />
                <span className="text-sm font-black uppercase tracking-[0.08em] text-emerald-900 drop-shadow-[0_1px_0_rgba(255,255,255,0.5)]">
                  Keep both with
                </span>
                <span className="inline-flex items-center rounded-lg bg-gradient-to-b from-emerald-600 to-emerald-800 px-2 py-1.5 text-[11px] font-black uppercase leading-none tracking-[0.18em] text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_4px_rgba(0,0,0,0.25)] ring-1 ring-emerald-900/40">
                  Plus
                </span>
              </button>
            )}
          </div>
        )}
      </BaseSheet>

      <PlusUpgradeModal
        open={showPlus}
        placement="focus_tag_limit"
        onClose={() => setShowPlus(false)}
      />

      {/* Themed delete confirmation */}
      <BaseSheet
        open={confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(false)}
        zIndex={1710}
        className="sm:max-w-[400px] max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-3rem)]"
      >
        {({ bindScroll }) => (
          <div
            ref={bindScroll}
            className="relative overflow-y-auto overscroll-none px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 text-card-foreground sm:px-6 sm:pb-6"
          >
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-500">
              <Trash2 className="h-7 w-7" strokeWidth={2.5} />
            </div>
            <h3 className="text-center text-xl font-black text-foreground">
              Delete tag?
            </h3>
            <p className="mx-auto mt-1.5 max-w-[20rem] text-center text-[14px] leading-snug text-muted-foreground">
              <span className="font-bold" style={{ color }}>
                {displayTag.name}
              </span>{' '}
              will be removed from{' '}
              {tasks.length > 0 ? (
                <span className="font-bold text-foreground">
                  {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
                </span>
              ) : (
                'your saved tags'
              )}
              . This can&rsquo;t be undone.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="h-12 rounded-2xl bg-muted text-[14px] font-black text-foreground transition hover:bg-muted/80"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(false);
                  onDelete();
                }}
                className="h-12 rounded-2xl bg-rose-500 text-[14px] font-black uppercase tracking-wide text-white transition active:translate-y-[2px] hover:bg-rose-600"
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </BaseSheet>
    </>
  );
}
