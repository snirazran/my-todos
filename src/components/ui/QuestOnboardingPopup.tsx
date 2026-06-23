'use client';

import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import type {
  FocusCategoryTagMap,
  MacroCategoryDefinition,
  MacroCategoryId,
} from '@/lib/quests/types';
import { cn } from '@/lib/utils';

export function QuestOnboardingPopup({
  show,
  isCompleted = false,
  initialSelectedCategoryIds,
  categories,
  onCompleted,
  onClose,
}: {
  show: boolean;
  isCompleted?: boolean;
  initialSelectedCategoryIds: MacroCategoryId[];
  initialCategoryTagMap?: FocusCategoryTagMap[];
  categories: MacroCategoryDefinition[];
  isPremium?: boolean;
  onCompleted: () => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<MacroCategoryId[]>(
    initialSelectedCategoryIds,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!show) return;
    setSelectedCategoryIds(initialSelectedCategoryIds);
    setError(null);
  }, [initialSelectedCategoryIds, show]);

  const toggleCategory = (categoryId: MacroCategoryId) => {
    setSelectedCategoryIds((prev) => {
      if (prev.includes(categoryId)) {
        setError(null);
        return prev.filter((entry) => entry !== categoryId);
      }

      setError(null);
      return [...prev, categoryId];
    });
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

  if (!mounted) return null;

  const count = selectedCategoryIds.length;

  return (
    <BaseSheet
      open={show}
      onOpenChange={(v) => !v && onClose()}
      zIndex={1200}
      backdropClassName="backdrop-blur-sm"
      className="h-[90vh] bg-popover sm:h-auto sm:max-h-[85vh] sm:max-w-3xl"
    >
      {({ isDesktop, dragControls, bindScroll }) => (
        <>
            {/* Header (doubles as the drag handle on mobile) */}
            <div
              className="flex shrink-0 items-start justify-between gap-4 px-6 pb-4 pt-2 sm:px-8 sm:pt-7"
              style={!isDesktop ? { touchAction: 'none' } : undefined}
              onPointerDown={(event) => {
                if (!isDesktop) dragControls.start(event);
              }}
            >
              <div>
                <h2 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
                  {isCompleted ? 'Update your focus' : 'Shape your quests'}
                </h2>
                <p className="mt-1.5 max-w-md text-[13px] font-medium leading-relaxed text-muted-foreground">
                  Pick the areas that guide your quests and task ideas.
                </p>
              </div>

            </div>

            {/* Categories */}
            <div
              ref={bindScroll}
              className="min-h-0 flex-1 overflow-y-auto overscroll-none px-6 pb-6 pt-2 sm:px-8"
            >
              <div className="grid grid-cols-2 gap-3.5 sm:gap-4 lg:grid-cols-3">
                {categories.map((category) => {
                  const selected = selectedCategoryIds.includes(category.id);

                  return (
                    <button
                      type="button"
                      key={category.id}
                      aria-pressed={selected}
                      onClick={() => toggleCategory(category.id)}
                      className={cn(
                        'group relative aspect-[4/5] overflow-hidden rounded-[24px] text-left transition-all duration-200',
                        selected
                          ? 'ring-[3px] ring-primary'
                          : 'ring-1 ring-border/60 hover:-translate-y-0.5 hover:ring-border active:scale-[0.98]',
                      )}
                    >
                      {category.coverImageUrl ? (
                        <img
                          src={category.coverImageUrl}
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div
                          className="absolute inset-0"
                          style={{
                            background: `linear-gradient(135deg, ${category.backgroundFrom}, ${category.backgroundTo})`,
                          }}
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

                      <div
                        className={cn(
                          'absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-full border-2 backdrop-blur-md transition-all',
                          selected
                            ? 'border-white bg-primary text-white'
                            : 'border-white/70 bg-black/25 text-transparent',
                        )}
                        aria-hidden
                      >
                        <Check className="h-4 w-4 stroke-[3]" />
                      </div>

                      <div className="absolute inset-x-0 bottom-0 p-3.5">
                        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/70">
                          {category.shortLabel || 'Focus'}
                        </p>
                        <h3 className="mt-0.5 text-lg font-black leading-tight tracking-tight text-white sm:text-xl">
                          {category.name}
                        </h3>
                      </div>
                    </button>
                  );
                })}
              </div>

              {categories.length === 0 && (
                <div className="rounded-2xl border border-dashed border-border/60 px-5 py-10 text-center text-sm text-muted-foreground">
                  No focus areas are available yet.
                </div>
              )}

              {error && (
                <div className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-border/60 bg-popover px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-8">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold text-muted-foreground">
                  {count} selected
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex h-11 items-center justify-center rounded-2xl px-4 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {isCompleted ? 'Keep current' : 'Later'}
                  </button>
                  <button
                    type="button"
                    onClick={saveOnboarding}
                    disabled={saving || count === 0}
                    className="inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-6 text-sm font-black text-primary-foreground shadow-[0_4px_0_0_rgba(0,0,0,0.18)] transition-all active:translate-y-1 active:shadow-none disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0 disabled:active:shadow-[0_4px_0_0_rgba(0,0,0,0.18)]"
                  >
                    {saving
                      ? 'Saving...'
                      : isCompleted
                        ? 'Save changes'
                        : 'Save focus'}
                  </button>
                </div>
              </div>
            </div>
        </>
      )}
    </BaseSheet>
  );
}
