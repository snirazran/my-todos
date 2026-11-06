'use client';

import React, { useState } from 'react';
import { ListChecks, Plus, Trash2, X } from 'lucide-react';
import {
  AdminCard,
  AdminPage,
  ConfigShell,
  Field,
  NumberInput,
  PondButton,
  ResetLink,
  SaveBar,
  inputClass,
} from '@/components/admin/kit';
import { useEconomy } from '@/components/admin/useEconomy';
import { FLY_ECONOMY_DEFAULTS } from '@/lib/economy/defaults';
import { checklistMarkerIndexes, type ChecklistTier } from '@/lib/checklist';
import { cn } from '@/lib/utils';

const PREVIEW_LENGTHS = [2, 3, 5, 8, 12, 20];

export function ChecklistPage() {
  const economy = useEconomy();
  const tiers = economy.config?.checklist.tiers;

  const setTiers = (next: ChecklistTier[]) => economy.patchGroup('checklist', { tiers: next });
  const patchTier = (index: number, next: Partial<ChecklistTier>) =>
    tiers && setTiers(tiers.map((tier, i) => (i === index ? { ...tier, ...next } : tier)));

  const bandLabel = (index: number) => {
    if (!tiers) return '';
    const from = tiers[index].minItems;
    const next = tiers[index + 1]?.minItems;
    if (!next) return `${from}+ items`;
    if (next - from === 1) return `${from} item${from === 1 ? '' : 's'}`;
    return `${from}–${next - 1} items`;
  };

  return (
    <AdminPage
      title="Checklists"
      subtitle="A checklist pays a few bonus flies for its length, at marked boxes. Pass a marked box and the fly is kept even if the list is never finished."
      icon={<ListChecks />}
      actions={
        <ResetLink
          onClick={() =>
            setTiers(FLY_ECONOMY_DEFAULTS.checklist.tiers.map((tier) => ({ ...tier, markers: [...tier.markers] })))
          }
        >
          Load defaults
        </ResetLink>
      }
    >
      <ConfigShell loading={economy.loading} error={economy.error}>
        {tiers ? (
          <div className="space-y-5">
            <AdminCard
              title="What players get"
              subtitle="Green boxes pay one bonus fly each, on top of the task's own fly. A long list must never pay one fly per box."
              icon={<span className="text-[20px]">👀</span>}
            >
              <div className="space-y-2">
                {PREVIEW_LENGTHS.map((length) => {
                  const indexes = checklistMarkerIndexes(length, tiers);
                  return (
                    <div key={length} className="flex flex-wrap items-center gap-3 rounded-2xl bg-muted/45 px-3 py-2">
                      <span className="w-16 shrink-0 text-[13px] font-black text-muted-foreground">{length} items</span>
                      <span className="flex min-w-0 flex-1 flex-wrap gap-1">
                        {Array.from({ length }, (_, i) => (
                          <span
                            key={i}
                            className={cn(
                              'grid h-6 w-6 place-items-center rounded-md text-[10px] font-black tabular-nums',
                              indexes.includes(i)
                                ? 'bg-primary text-primary-foreground shadow-[0_2px_0_0_#2c511a]'
                                : 'bg-background text-muted-foreground',
                            )}
                          >
                            {i + 1}
                          </span>
                        ))}
                      </span>
                      <span className="text-[12px] font-black tabular-nums text-primary">+{indexes.length} 🪰</span>
                    </div>
                  );
                })}
              </div>
            </AdminCard>

            <AdminCard
              title="Length bands"
              subtitle="Mark boxes as final, a share like 50%, or a box number like 3."
              icon={<span className="text-[20px]">📏</span>}
              tone="sky"
              actions={
                <PondButton
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setTiers([...tiers, { minItems: (tiers[tiers.length - 1]?.minItems ?? 0) + 4, markers: ['50%', 'final'] }])
                  }
                >
                  <Plus className="h-4 w-4" />
                  Add band
                </PondButton>
              }
            >
              <div className="grid gap-3 md:grid-cols-2">
                {tiers.map((tier, index) => (
                  <div key={index} className="rounded-2xl border border-border/70 bg-muted/30 p-3">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-[15px] font-black">{bandLabel(index)}</p>
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[12px] font-black text-primary">
                        +{tier.markers.length} 🪰
                      </span>
                      <button
                        type="button"
                        onClick={() => setTiers(tiers.filter((_, i) => i !== index))}
                        disabled={tiers.length <= 1}
                        className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-red-500/10 hover:text-red-500 disabled:opacity-30"
                        aria-label="Remove band"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3">
                      <Field label="From">
                        <NumberInput value={tier.minItems} min={1} max={100} suffix="items" onChange={(minItems) => patchTier(index, { minItems })} />
                      </Field>
                      <Field label="Paying boxes">
                        <MarkerEditor markers={tier.markers} onChange={(markers) => patchTier(index, { markers })} />
                      </Field>
                    </div>
                  </div>
                ))}
              </div>
            </AdminCard>
          </div>
        ) : null}
      </ConfigShell>
      <SaveBar
        dirty={economy.dirty}
        saving={economy.saving}
        onSave={() => void economy.save()}
        onDiscard={economy.discard}
        label="Checklist rewards have unsaved changes"
      />
    </AdminPage>
  );
}

function MarkerEditor({ markers, onChange }: { markers: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const value = draft.trim();
    if (!value || markers.length >= 10) return;
    onChange([...markers, value]);
    setDraft('');
  };
  return (
    <div className={cn(inputClass, 'flex h-auto min-h-10 flex-wrap items-center gap-1.5 px-1.5 py-1.5')}>
      {markers.map((marker, index) => (
        <span key={`${marker}-${index}`} className="inline-flex items-center gap-1 rounded-lg bg-primary/10 py-0.5 pl-2 pr-1 text-[12px] font-black text-primary">
          {marker}
          <button
            type="button"
            onClick={() => onChange(markers.filter((_, i) => i !== index))}
            className="rounded p-0.5 hover:bg-primary/15"
            aria-label={`Remove ${marker}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder={markers.length ? '' : 'final, 50%, 3'}
        className="min-w-[4rem] flex-1 bg-transparent px-1 text-[13px] font-semibold outline-none"
      />
    </div>
  );
}
