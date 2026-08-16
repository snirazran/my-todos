'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PactConfigView, PactSuggestion } from '@/lib/pact/types';


type AdminCategory = {
  categoryId: string;
  name: string;
  shortLabel?: string;
  accent?: string;
};

const inputClass =
  'h-9 rounded-lg border border-border/60 bg-background px-2.5 text-sm font-medium text-foreground outline-none focus:border-primary';

function NumberField({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-bold text-foreground">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className={cn(inputClass, 'w-full')}
      />
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function AdminPactManager() {
  const [config, setConfig] = useState<PactConfigView | null>(null);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/admin/pact');
        const payload = await res.json();
        if (res.ok) {
          setConfig(payload.config);
          setCategories(payload.categories ?? []);
          setActiveCategoryId(payload.categories?.[0]?.categoryId ?? '');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const suggestions = useMemo(
    () =>
      (config?.suggestions ?? []).filter(
        (entry) => entry.categoryId === activeCategoryId,
      ),
    [config?.suggestions, activeCategoryId],
  );

  const coverage = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of config?.suggestions ?? []) {
      if (!entry.isActive) continue;
      map.set(entry.categoryId, (map.get(entry.categoryId) ?? 0) + 1);
    }
    return map;
  }, [config?.suggestions]);

  const patch = (next: Partial<PactConfigView>) =>
    setConfig((prev) => (prev ? { ...prev, ...next } : prev));

  const patchSuggestion = (id: string, next: Partial<PactSuggestion>) =>
    setConfig((prev) =>
      prev
        ? {
            ...prev,
            suggestions: prev.suggestions.map((entry) =>
              entry.id === id ? { ...entry, ...next } : entry,
            ),
          }
        : prev,
    );

  const addSuggestion = () =>
    setConfig((prev) =>
      prev
        ? {
            ...prev,
            suggestions: [
              ...prev.suggestions,
              {
                id: crypto.randomUUID(),
                categoryId: activeCategoryId,
                text: '',
                isActive: true,
                picked: 0,
                kept: 0,
              },
            ],
          }
        : prev,
    );

  const removeSuggestion = (id: string) =>
    setConfig((prev) =>
      prev
        ? {
            ...prev,
            suggestions: prev.suggestions.filter((entry) => entry.id !== id),
          }
        : prev,
    );

  const save = async () => {
    if (!config) return;
    setSaving(true);
    setNote(null);
    try {
      const res = await fetch('/api/admin/pact', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not save');
      setConfig(payload.config);
      setNote('Saved');
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const generate = async () => {
    if (!activeCategoryId) return;
    setGenerating(true);
    setNote(null);
    try {
      const res = await fetch('/api/admin/pact/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId: activeCategoryId }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not generate');
      setConfig((prev) =>
        prev
          ? { ...prev, suggestions: [...prev.suggestions, ...payload.suggestions] }
          : prev,
      );
      setNote(
        `Added ${payload.suggestions.length} drafts — review and switch them on.`,
      );
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'Could not generate');
    } finally {
      setGenerating(false);
    }
  };

  if (loading || !config) {
    return (
      <div className="rounded-2xl bg-muted/30 p-4 text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/40 bg-card/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-lg font-black text-foreground">Weekly Pact</p>
            <p className="text-sm text-muted-foreground">
              One area a week. Accepting writes real tasks into the user&apos;s list.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input
              type="checkbox"
              checked={config.isActive}
              onChange={(event) => patch({ isActive: event.target.checked })}
              className="h-4 w-4"
            />
            Active
          </label>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Evening cutover hour"
            hint="After this hour on the last day of a week, picking commits to next week instead. Local hour, 0–23."
            min={0}
            max={23}
            value={config.pickHour}
            onChange={(pickHour) => patch({ pickHour })}
          />
          <div className="rounded-xl bg-muted/30 p-3 text-[12px] leading-snug text-muted-foreground">
            The pick screen is always open — a user can start a pact any day.
            The nudge goes out on the first day of{' '}
            <span className="font-bold text-foreground">their own</span> week
            (set per user in Settings → Week starts on), taking that
            morning&apos;s reminder slot rather than adding one.
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border/40 bg-card/60 p-5">
        <p className="text-lg font-black text-foreground">Rewards</p>
        <p className="text-sm text-muted-foreground">
          Each session pays the moment its task is ticked; the bonus lands on
          the last one. Defaults put a 2–5 session week between{' '}
          {2 * config.fliesPerCompletion + config.weekBonusFlies} and{' '}
          {5 * config.fliesPerCompletion + config.weekBonusFlies} flies, with
          the usual 3-session week on{' '}
          {3 * config.fliesPerCompletion + config.weekBonusFlies} — the old
          focus-quest cycle paid 53.7 a week, so keep it near there or fly
          income drifts.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Keep the bonus the larger half. It is what makes committing to more
          sessions a real bet rather than free money: a 5-session week that
          delivers 2 pays{' '}
          <span className="font-bold text-foreground">
            {2 * config.fliesPerCompletion}
          </span>
          , where committing to 2 and keeping both pays{' '}
          <span className="font-bold text-foreground">
            {2 * config.fliesPerCompletion + config.weekBonusFlies}
          </span>
          . Flatten the bonus and over-committing stops costing anything.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <NumberField
            label="Flies per session"
            hint="Paid as each task is ticked"
            min={0}
            max={200}
            value={config.fliesPerCompletion}
            onChange={(fliesPerCompletion) => patch({ fliesPerCompletion })}
          />
          <NumberField
            label="Week bonus"
            hint="On finishing the whole pact"
            min={0}
            max={2000}
            value={config.weekBonusFlies}
            onChange={(weekBonusFlies) => patch({ weekBonusFlies })}
          />
          <NumberField
            label="Comeback bonus"
            hint="Once a week, for the first session after a miss"
            min={0}
            max={2000}
            value={config.comebackBonusFlies}
            onChange={(comebackBonusFlies) => patch({ comebackBonusFlies })}
          />
        </div>
        <div className="mt-6">
          <p className="text-sm font-bold text-foreground">Streak multiplier</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The only thing a streak does: it multiplies every fly a kept week
            pays, sessions and bonus alike. Gifts never multiply. A week is paid
            at the rung its own number reaches, so the week that takes a run to{' '}
            {config.streakMultipliers?.[0]?.weeks ?? 2} already pays at that
            rate. Whole numbers only — the point is that nobody has to do
            arithmetic to know what a week is worth.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            {(config.streakMultipliers ?? []).map((rung, index) => (
              <div
                key={index}
                className="rounded-xl border border-border/60 p-3"
              >
                <NumberField
                  label={`Rung ${index + 1} — weeks`}
                  min={1}
                  max={104}
                  value={rung.weeks}
                  onChange={(weeks) =>
                    patch({
                      streakMultipliers: (config.streakMultipliers ?? []).map(
                        (entry, i) => (i === index ? { ...entry, weeks } : entry),
                      ),
                    })
                  }
                />
                <div className="mt-2">
                  <NumberField
                    label="Pays"
                    hint={`x${rung.multiplier} of the week's flies`}
                    min={1}
                    max={20}
                    value={rung.multiplier}
                    onChange={(multiplier) =>
                      patch({
                        streakMultipliers: (config.streakMultipliers ?? []).map(
                          (entry, i) =>
                            i === index ? { ...entry, multiplier } : entry,
                        ),
                      })
                    }
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-xl bg-muted/30 p-3 text-[12px] leading-snug text-muted-foreground">
            A 2-session week pays{' '}
            <span className="font-bold text-foreground">
              {2 * config.fliesPerCompletion + config.weekBonusFlies}
            </span>{' '}
            at x1 and{' '}
            <span className="font-bold text-foreground">
              {(2 * config.fliesPerCompletion + config.weekBonusFlies) *
                Math.max(
                  1,
                  config.streakMultipliers?.[
                    (config.streakMultipliers?.length ?? 1) - 1
                  ]?.multiplier ?? 1,
                )}
            </span>{' '}
            at the top rung, plus{' '}
            <span className="font-bold text-foreground">
              {config.completionRewards?.length
                ? config.completionRewards
                    .map((r) => r.itemId ?? `${r.amount ?? ''} ${r.type}`.trim())
                    .join(', ')
                : 'nothing'}
            </span>{' '}
            every kept week regardless.
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-border/40 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Lily Pads (price, caps, how many kept weeks earn one, and the rescue
          cooldown) are tuned under <span className="font-bold">Shields</span> —
          one pool covers this streak and the daily one.
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <NumberField
            label="Plus swap tokens / month"
            hint="Change area mid-week, keep the streak"
            min={0}
            max={20}
            value={config.plusSwapTokensPerMonth}
            onChange={(plusSwapTokensPerMonth) =>
              patch({ plusSwapTokensPerMonth })
            }
          />
        </div>
      </div>

      <div className="rounded-2xl border border-border/40 bg-card/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-lg font-black text-foreground">Ideas per area</p>
            <p className="text-sm text-muted-foreground">
              Users see three of these. Areas with fewer than three active ideas
              fall back to generic wording.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={generate}
            disabled={generating || !activeCategoryId}
            className="rounded-xl"
          >
            {generating ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-4 w-4" />
            )}
            Draft ideas
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {categories.map((category) => {
            const count = coverage.get(category.categoryId) ?? 0;
            return (
              <button
                key={category.categoryId}
                type="button"
                onClick={() => setActiveCategoryId(category.categoryId)}
                className={cn(
                  'rounded-xl border px-3 py-1.5 text-sm font-bold transition',
                  activeCategoryId === category.categoryId
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border/60 text-muted-foreground hover:border-primary/40',
                )}
              >
                {category.shortLabel || category.name}
                <span
                  className={cn(
                    'ml-1.5 text-[11px] font-black',
                    count < config.minOptionsPerArea
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-primary',
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 space-y-3">
          {suggestions.length === 0 && (
            <p className="rounded-xl bg-muted/30 p-3 text-sm text-muted-foreground">
              No ideas yet for this area. Add one, or draft a set.
            </p>
          )}
          {suggestions.map((entry) => (
            <div
              key={entry.id}
              className={cn(
                'rounded-xl border p-3',
                entry.isActive
                  ? 'border-border/60 bg-background/40'
                  : 'border-dashed border-border/60 bg-muted/20',
              )}
            >
              <div className="flex items-center gap-2">
                <input
                  value={entry.text}
                  placeholder="Take a 20-minute walk"
                  onChange={(event) =>
                    patchSuggestion(entry.id, { text: event.target.value })
                  }
                  className={cn(inputClass, 'min-w-0 flex-1')}
                />
                <button
                  type="button"
                  onClick={() => removeSuggestion(entry.id)}
                  aria-label="Delete idea"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs font-bold">
                  <input
                    type="checkbox"
                    checked={entry.isActive}
                    onChange={(event) =>
                      patchSuggestion(entry.id, { isActive: event.target.checked })
                    }
                    className="h-4 w-4"
                  />
                  Live
                </label>
                {entry.picked > 0 && (
                  <span className="text-[11px] font-bold text-muted-foreground">
                    picked {entry.picked} · kept {entry.kept} (
                    {Math.round((entry.kept / entry.picked) * 100)}%)
                  </span>
                )}
                {entry.generated && (
                  <span className="rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-violet-600 dark:text-violet-400">
                    Draft
                  </span>
                )}
              </div>
            </div>
          ))}

          <Button
            size="sm"
            variant="outline"
            onClick={addSuggestion}
            disabled={!activeCategoryId}
            className="rounded-xl"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add idea
          </Button>
        </div>
      </div>

      <div className="sticky bottom-4 flex items-center gap-3">
        <Button onClick={save} disabled={saving} className="rounded-xl">
          {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Save changes
        </Button>
        {note && (
          <span className="text-sm font-bold text-muted-foreground">{note}</span>
        )}
      </div>
    </div>
  );
}
