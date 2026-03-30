'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { QUEST_MACRO_CATEGORIES } from '@/lib/quests/catalog';
import type { FocusCategoryTagMap, MacroCategoryId } from '@/lib/quests/types';
import { cn } from '@/lib/utils';

export function QuestOnboardingPopup({
  show,
  isCompleted = false,
  initialSelectedCategoryIds,
  onCompleted,
  onClose,
}: {
  show: boolean;
  isCompleted?: boolean;
  initialSelectedCategoryIds: MacroCategoryId[];
  initialCategoryTagMap?: FocusCategoryTagMap[];
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
  const dragControls = useDragControls();

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
    setError(null);
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [initialSelectedCategoryIds, show]);

  const toggleCategory = (categoryId: MacroCategoryId) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(categoryId)
        ? prev.filter((entry) => entry !== categoryId)
        : [...prev, categoryId],
    );
  };

  const saveOnboarding = async () => {
    if (saving || selectedCategoryIds.length === 0) return;
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
            className="relative flex h-[92vh] w-full flex-col overflow-hidden rounded-t-[32px] border border-border/50 bg-card/95 text-card-foreground shadow-[0_28px_80px_rgba(15,23,42,0.2)] backdrop-blur-2xl sm:h-auto sm:max-w-4xl sm:rounded-[32px]"
          >
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-[-5%] top-[-10%] h-44 w-44 rounded-full bg-primary/10 blur-3xl" />
              <div className="absolute right-[-8%] top-[18%] h-52 w-52 rounded-full bg-emerald-400/10 blur-3xl" />
              <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-background/60 to-transparent" />
            </div>
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
                <div className="max-w-2xl">
                  <h2 className="max-w-xl text-2xl font-black tracking-tight text-foreground md:text-4xl">
                    {isCompleted
                      ? 'Update your focus'
                      : 'What do you want to improve?'}
                  </h2>
                  <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground md:text-base">
                    {isCompleted
                      ? 'Adjust your categories or keep what you already have.'
                      : 'Choose the areas you want to focus on right now.'}
                  </p>
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

            <div className="relative flex-1 overflow-y-auto px-5 py-5 pb-0 md:px-7 md:py-6 md:pb-0">
              <div className="mb-5 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-muted-foreground">
                  Select one or more categories.
                </p>
                <span className="inline-flex w-fit items-center rounded-full border border-border/50 bg-background px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                  {selectedCategoryIds.length} selected
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {QUEST_MACRO_CATEGORIES.map((category) => {
                  const selected = selectedCategoryIds.includes(category.id);

                  return (
                    <button
                      type="button"
                      key={category.id}
                      aria-pressed={selected}
                      onClick={() => toggleCategory(category.id)}
                      className={cn(
                        'group relative overflow-hidden rounded-[30px] border p-5 text-left transition-all duration-200',
                        selected
                          ? 'border-primary/30 bg-primary/[0.11] shadow-[0_18px_45px_rgba(15,23,42,0.12)]'
                          : 'border-border/50 bg-background/75 hover:-translate-y-0.5 hover:border-primary/20 hover:bg-muted/40 hover:shadow-[0_14px_36px_rgba(15,23,42,0.08)]',
                      )}
                    >
                      <div
                        className="absolute right-[-18px] top-[-18px] h-24 w-24 rounded-full opacity-20 blur-2xl transition-opacity group-hover:opacity-30"
                        style={{ backgroundColor: category.accent }}
                      />
                      <div
                        className="absolute inset-x-0 top-0 h-1"
                        style={{ backgroundColor: category.accent }}
                      />

                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground/90">
                            {category.shortLabel}
                          </p>
                          <h3 className="mt-2 text-xl font-black leading-tight text-foreground">
                            {category.name}
                          </h3>
                        </div>
                        <div
                          className={cn(
                            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors',
                            selected
                              ? 'border-primary/25 bg-primary text-primary-foreground'
                              : 'border-border/50 bg-background/90 text-muted-foreground group-hover:text-foreground',
                          )}
                        >
                          <Check className={cn('h-4 w-4', !selected && 'opacity-0')} />
                        </div>
                      </div>

                      <p className="relative mt-4 text-sm leading-relaxed text-muted-foreground">
                        {category.description}
                      </p>
                    </button>
                  );
                })}
              </div>

              {error && (
                <div className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
                  {error}
                </div>
              )}

              <div className="sticky bottom-0 mt-6 flex flex-col-reverse gap-3 border-t border-border/50 bg-card/95 px-0 pb-0 pt-5 backdrop-blur sm:flex-row sm:justify-end">
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
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-black uppercase tracking-[0.12em] text-primary-foreground shadow-[0_14px_30px_rgba(16,185,129,0.25)] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving
                    ? 'Saving focus...'
                    : isCompleted
                      ? 'Save changes'
                      : 'Save Focus'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </>
    </AnimatePresence>,
    document.body,
  );
}
