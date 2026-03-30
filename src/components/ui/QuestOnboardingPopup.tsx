'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { Check, Compass, X } from 'lucide-react';
import { QUEST_MACRO_CATEGORIES } from '@/lib/quests/catalog';
import type { FocusCategoryTagMap, MacroCategoryId } from '@/lib/quests/types';
import { cn } from '@/lib/utils';

export function QuestOnboardingPopup({
  show,
  initialSelectedCategoryIds,
  onCompleted,
  onClose,
}: {
  show: boolean;
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
        className="fixed inset-0 z-[1200] bg-background/70 backdrop-blur-md"
      />
        <div className="fixed inset-0 z-[1201] flex items-end justify-center p-0 sm:items-center sm:p-6">
          <motion.div
            initial={isDesktop ? { opacity: 0, y: 20, scale: 0.98 } : { y: '100%' }}
            animate={isDesktop ? { opacity: 1, y: 0, scale: 1 } : { y: 0 }}
            exit={isDesktop ? { opacity: 0, y: 16, scale: 0.98 } : { y: '100%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            drag={!isDesktop ? 'y' : false}
            dragControls={dragControls}
            dragListener={false}
            dragElastic={{ top: 0, bottom: 0.45 }}
            dragMomentum={false}
            dragSnapToOrigin
            onDragEnd={(_event, { offset, velocity }) => {
              if (!isDesktop && (offset.y > 120 || velocity.y > 650)) onClose();
            }}
            className="relative flex h-[92vh] w-full flex-col overflow-hidden rounded-t-[32px] border border-border/50 bg-card/95 text-card-foreground shadow-2xl backdrop-blur-2xl sm:h-auto sm:max-w-4xl sm:rounded-[32px]"
          >
            {!isDesktop && (
              <div
                className="absolute inset-x-0 top-0 z-20 h-8"
                onPointerDown={(event) => dragControls.start(event)}
              />
            )}
            <div className="border-b border-border/50 px-5 py-5 md:px-7">
              <div className="flex items-start justify-between gap-4">
                <div className="max-w-2xl">
                  <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-primary">
                    <Compass className="h-3.5 w-3.5" />
                    Quest Focus
                  </div>
                  <h2 className="mt-3 text-2xl font-black tracking-tight text-foreground md:text-3xl">
                    What do you want to focus on?
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground md:text-base">
                    Pick the life areas you want quests to follow. You&apos;ll link
                    your tags later inside Quests when you start your campaigns.
                  </p>
                </div>

                <button
                  onClick={onClose}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-background/80 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 md:px-7 md:py-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-muted-foreground">
                  Choose at least one category.
                </p>
                <span className="rounded-full border border-border/50 bg-background/80 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                  {selectedCategoryIds.length} selected
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {QUEST_MACRO_CATEGORIES.map((category) => {
                  const selected = selectedCategoryIds.includes(category.id);

                  return (
                    <button
                      key={category.id}
                      onClick={() => toggleCategory(category.id)}
                      className={cn(
                        'group relative overflow-hidden rounded-[26px] border p-4 text-left transition-all',
                        selected
                          ? 'border-primary/30 bg-primary/10 shadow-[0_12px_30px_rgba(15,23,42,0.08)]'
                          : 'border-border/50 bg-background/75 hover:border-primary/20 hover:bg-muted/40',
                      )}
                    >
                      <div
                        className="absolute inset-x-0 top-0 h-1"
                        style={{ backgroundColor: category.accent }}
                      />

                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                            {category.shortLabel}
                          </p>
                          <h3 className="mt-1 text-xl font-black text-foreground">
                            {category.name}
                          </h3>
                        </div>
                        <div
                          className={cn(
                            'flex h-9 w-9 items-center justify-center rounded-full border transition-colors',
                            selected
                              ? 'border-primary/25 bg-primary text-primary-foreground'
                              : 'border-border/50 bg-background text-muted-foreground group-hover:text-foreground',
                          )}
                        >
                          <Check className={cn('h-4 w-4', !selected && 'opacity-0')} />
                        </div>
                      </div>

                      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                        {category.description}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 rounded-[24px] border border-border/50 bg-muted/30 px-4 py-4">
                <p className="text-sm font-semibold text-foreground">
                  Next step inside Quests
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  After this setup, each selected category will ask you to choose
                  which of your existing tags should count toward its campaign goals.
                </p>
              </div>

              {error && (
                <div className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
                  {error}
                </div>
              )}

              <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  onClick={onClose}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-border/50 bg-background px-5 text-sm font-bold text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  Later
                </button>
                <button
                  onClick={saveOnboarding}
                  disabled={saving || selectedCategoryIds.length === 0}
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-black uppercase tracking-[0.12em] text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? 'Saving focus...' : 'Save Focus'}
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
