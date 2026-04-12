'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { Check, Search, X } from 'lucide-react';
import type {
  FocusCategoryTagMap,
  MacroCategoryDefinition,
  MacroCategoryId,
} from '@/lib/quests/types';
import { cn } from '@/lib/utils';
import { PremiumLimitDialog } from './PremiumLimitDialog';

export function QuestOnboardingPopup({
  show,
  isCompleted = false,
  initialSelectedCategoryIds,
  categories,
  isPremium,
  onCompleted,
  onClose,
}: {
  show: boolean;
  isCompleted?: boolean;
  initialSelectedCategoryIds: MacroCategoryId[];
  initialCategoryTagMap?: FocusCategoryTagMap[];
  categories: MacroCategoryDefinition[];
  isPremium: boolean;
  onCompleted: () => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<MacroCategoryId[]>(
    initialSelectedCategoryIds,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [query, setQuery] = useState('');
  const [showPremiumLimit, setShowPremiumLimit] = useState(false);
  const dragControls = useDragControls();
  const freeCategoryLimit = 3;

  const selectedCategories = useMemo(
    () =>
      selectedCategoryIds
        .map((id) => categories.find((category) => category.id === id))
        .filter(Boolean) as MacroCategoryDefinition[],
    [categories, selectedCategoryIds],
  );

  const filteredCategories = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return categories;
    return categories.filter((category) =>
      [category.name, category.shortLabel, category.description].some((value) =>
        value?.toLowerCase().includes(normalized),
      ),
    );
  }, [categories, query]);

  useEffect(() => {
    setMounted(true);
    const check = () =>
      setIsDesktop(window.matchMedia('(min-width: 640px)').matches);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (!show) return;
    setSelectedCategoryIds(initialSelectedCategoryIds);
    setQuery('');
    setError(null);
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [initialSelectedCategoryIds, show]);

  const toggleCategory = (categoryId: MacroCategoryId) => {
    setSelectedCategoryIds((prev) => {
      if (prev.includes(categoryId)) {
        setError(null);
        return prev.filter((entry) => entry !== categoryId);
      }

      if (!isPremium && prev.length >= freeCategoryLimit) {
        setShowPremiumLimit(true);
        return prev;
      }

      setError(null);
      return [...prev, categoryId];
    });
  };

  const saveOnboarding = async () => {
    if (saving || selectedCategoryIds.length === 0) return;
    if (!isPremium && selectedCategoryIds.length > freeCategoryLimit) {
      setShowPremiumLimit(true);
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch('/api/quests/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedCategoryIds,
          categoryTagMap: [],
          createSuggestions: false,
          timezone,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || 'Could not save your quest focus');
      }
      onCompleted();
    } catch (err: any) {
      setError(err.message || 'Could not save your quest focus');
    } finally {
      setSaving(false);
    }
  };

  if (!mounted || !show) return null;

  return createPortal(
    <AnimatePresence>
      <>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[1200] bg-background/80 backdrop-blur-xl"
        />
        <div className="fixed inset-0 z-[1201] flex items-end justify-center p-0 sm:items-center sm:p-6">
          <motion.div
            initial={isDesktop ? { opacity: 0, y: 20, scale: 0.98 } : { y: '100%' }}
            animate={isDesktop ? { opacity: 1, y: 0, scale: 1 } : { y: 0 }}
            exit={isDesktop ? { opacity: 0, y: 16, scale: 0.98 } : { y: '100%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            onClick={(event) => event.stopPropagation()}
            drag={!isDesktop ? 'y' : false}
            dragControls={dragControls}
            dragListener={false}
            dragElastic={{ top: 0, bottom: 0.45 }}
            dragMomentum={false}
            dragSnapToOrigin
            onDragEnd={(_event, { offset, velocity }) => {
              if (!isDesktop && (offset.y > 120 || velocity.y > 650)) onClose();
            }}
            className="relative flex h-[92vh] w-full flex-col overflow-hidden rounded-t-[32px] border border-border/50 bg-card/95 text-card-foreground shadow-[0_28px_80px_rgba(15,23,42,0.2)] backdrop-blur-2xl sm:h-[88vh] sm:max-w-6xl sm:rounded-[34px]"
          >
            {!isDesktop && (
              <div
                className="absolute inset-x-0 top-0 z-20 h-8"
                onPointerDown={(event) => dragControls.start(event)}
              />
            )}
            {!isDesktop && (
              <div className="absolute left-1/2 top-3 z-20 h-1.5 w-14 -translate-x-1/2 rounded-full bg-foreground/15" />
            )}

            <div className="relative border-b border-border/50 px-5 pb-5 pt-8 md:px-7 md:pt-7">
              <div className="flex items-start justify-between gap-4">
                <div className="max-w-3xl">
                  <h2 className="max-w-2xl text-3xl font-black tracking-tight text-foreground md:text-5xl">
                    {isCompleted ? 'Update your focus' : 'Shape your quests'}
                  </h2>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground">
                      Choose the areas that should guide your quests, task
                      ideas, and habits.
                    </span>
                  </div>
                </div>

                <button
                  onClick={onClose}
                  type="button"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/50 bg-background/80 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="relative flex flex-1 flex-col overflow-hidden">
              <div className="border-b border-border/50 bg-card/90 px-5 py-4 backdrop-blur md:px-7">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <label className="relative block md:w-[360px]">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search focus areas"
                      className="h-11 w-full rounded-2xl border border-border/50 bg-background/80 pl-10 pr-4 text-sm font-medium text-foreground outline-none transition focus:border-primary/30 focus:ring-2 focus:ring-primary/15"
                    />
                  </label>

                  <div className="flex flex-wrap items-center gap-2">
                    {selectedCategories.length > 0 ? (
                      selectedCategories.slice(0, 4).map((category) => (
                        <button
                          key={category.id}
                          type="button"
                          onClick={() => toggleCategory(category.id)}
                          className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition hover:bg-primary/15"
                        >
                          {category.name}
                          <X className="h-3 w-3" />
                        </button>
                      ))
                    ) : (
                      <span className="text-sm font-medium text-muted-foreground">
                        Select at least one focus area.
                      </span>
                    )}
                    {selectedCategories.length > 4 && (
                      <span className="rounded-full border border-border/50 bg-background/80 px-3 py-1.5 text-xs font-bold text-muted-foreground">
                        +{selectedCategories.length - 4}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-7 md:py-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-muted-foreground">
                    {filteredCategories.length} focus area
                    {filteredCategories.length !== 1 ? 's' : ''}
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredCategories.map((category) => {
                    const selected = selectedCategoryIds.includes(category.id);

                    return (
                      <button
                        type="button"
                        key={category.id}
                        aria-pressed={selected}
                        onClick={() => toggleCategory(category.id)}
                        className={cn(
                          'group overflow-hidden rounded-[28px] border text-left transition-all duration-200',
                          selected
                            ? 'border-primary/40 bg-primary/[0.08] shadow-[0_16px_36px_rgba(15,23,42,0.12)]'
                            : 'border-border/50 bg-background/80 hover:-translate-y-0.5 hover:border-primary/20 hover:bg-muted/35 hover:shadow-[0_14px_32px_rgba(15,23,42,0.08)]',
                        )}
                      >
                        <div className="relative h-36 overflow-hidden sm:h-40">
                          {category.coverImageUrl ? (
                            <img
                              src={category.coverImageUrl}
                              alt=""
                              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                            />
                          ) : (
                            <div
                              className="h-full w-full"
                              style={{
                                background: `linear-gradient(135deg, ${category.backgroundFrom}, ${category.backgroundTo})`,
                              }}
                            />
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/10" />
                          <div
                            className={cn(
                              'absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-black/35 text-white backdrop-blur-md transition',
                              selected && 'bg-primary text-primary-foreground',
                            )}
                            aria-hidden
                          >
                            <Check className={cn('h-4 w-4', !selected && 'opacity-0')} />
                          </div>
                          <div className="absolute inset-x-0 bottom-0 p-4">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/70">
                              {category.shortLabel || 'Focus'}
                            </p>
                            <h3 className="mt-1 text-2xl font-black leading-none tracking-tight text-white">
                              {category.name}
                            </h3>
                          </div>
                        </div>

                        <div className="p-4">
                          <p className="min-h-[44px] text-sm leading-relaxed text-muted-foreground">
                            {category.description ||
                              'Build quests around this focus area.'}
                          </p>
                          <div className="mt-4 flex items-center justify-between gap-3">
                            <span
                              className={cn(
                                'rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em]',
                                selected
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-primary/10 text-primary',
                              )}
                            >
                              {selected ? 'Selected' : 'Choose'}
                            </span>
                            <span className="text-xs font-bold text-muted-foreground">
                              {selectedCategoryIds.indexOf(category.id) >= 0
                                ? `#${selectedCategoryIds.indexOf(category.id) + 1}`
                                : ''}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {filteredCategories.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-border/50 px-5 py-8 text-center text-sm text-muted-foreground">
                    No focus areas match your search.
                  </div>
                )}

                {categories.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-border/50 px-5 py-8 text-center text-sm text-muted-foreground">
                    No focus categories are available yet.
                  </div>
                )}

                {error && (
                  <div className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
                    {error}
                  </div>
                )}
              </div>

              <div className="z-20 border-t border-border/50 bg-card/95 px-5 py-4 backdrop-blur md:px-7">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs font-bold text-muted-foreground">
                    {selectedCategoryIds.length} selected
                  </p>
                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={onClose}
                      className="inline-flex h-11 items-center justify-center rounded-2xl border border-border/50 bg-background px-5 text-sm font-bold text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    >
                      {isCompleted ? 'Keep current' : 'Later'}
                    </button>
                    <button
                      type="button"
                      onClick={saveOnboarding}
                      disabled={saving || selectedCategoryIds.length === 0}
                      className="inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-black uppercase tracking-[0.12em] text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving
                        ? 'Saving focus...'
                        : isCompleted
                          ? 'Save changes'
                          : 'Save Focus'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
        <PremiumLimitDialog
          open={showPremiumLimit}
          onClose={() => setShowPremiumLimit(false)}
          title="Focus Limit Reached"
          description={
            <>
              Unlock unlimited focus categories with <b>Premium</b>.
            </>
          }
        />
      </>
    </AnimatePresence>,
    document.body,
  );
}
