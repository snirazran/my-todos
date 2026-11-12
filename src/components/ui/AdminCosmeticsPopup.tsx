'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Crown, Hand, Paintbrush, Plus, Search, Shirt, Trash2, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AdminPage,
  EmptyState,
  Field,
  LoadingBlock,
  Notice,
  NumberInput,
  PageTabs,
  PondButton,
  Segmented,
  ToggleRow,
  inputClass,
} from '@/components/admin/kit';
import { RARITY_STYLE } from '@/components/admin/economy/rarity';
import Frog from '@/components/ui/frog';
import { cn } from '@/lib/utils';
import { availabilityStateAt } from '@/lib/skins/availability';
import { EconomyUpdatePanel } from '@/components/admin/EconomyUpdatePanel';
import type { Rarity } from '@/lib/skins/catalog';

type CosmeticSlot = 'skin' | 'hat' | 'body' | 'hand_item';
type StatusFilter = 'all' | 'shop' | 'hidden' | 'timed';

const SLOT_CONFIG: Record<CosmeticSlot, { label: string; one: string; icon: React.ReactNode }> = {
  skin: { label: 'Skins', one: 'skin', icon: <Paintbrush className="h-4 w-4" /> },
  hat: { label: 'Hats', one: 'hat', icon: <Crown className="h-4 w-4" /> },
  body: { label: 'Outfits', one: 'outfit', icon: <Shirt className="h-4 w-4" /> },
  hand_item: { label: 'Hand items', one: 'hand item', icon: <Hand className="h-4 w-4" /> },
};

const SLOTS: CosmeticSlot[] = ['skin', 'hat', 'body', 'hand_item'];
const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

const PREVIEW_BG: Record<string, string> = {
  common: 'from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-900',
  uncommon: 'from-emerald-100 to-emerald-50 dark:from-emerald-900/50 dark:to-emerald-950/50',
  rare: 'from-sky-100 to-sky-50 dark:from-sky-900/50 dark:to-sky-950/50',
  epic: 'from-violet-100 to-violet-50 dark:from-violet-900/50 dark:to-violet-950/50',
  legendary: 'from-amber-100 to-amber-50 dark:from-amber-900/50 dark:to-amber-950/50',
};

type DbItem = {
  _id?: string;
  id: string;
  name: string;
  slot: string;
  riveIndex: number;
  rarity: string;
  priceFlies: number;
  availableFrom?: string | null;
  availableUntil?: string | null;
  hidden?: boolean;
};

type Draft = {
  name: string;
  riveIndex: number;
  rarity: Rarity;
  priceFlies: number;
  availableFrom: string;
  availableUntil: string;
  hidden: boolean;
};

const toDateInput = (value?: string | null) => (value ? new Date(value).toISOString().slice(0, 10) : '');

function windowOf(item: DbItem) {
  if (!item.availableFrom && !item.availableUntil) return null;
  const state = availabilityStateAt(item);
  if (state === 'scheduled') return { tone: 'sky', label: `From ${toDateInput(item.availableFrom)}` };
  if (state === 'expired') return { tone: 'rose', label: `Ended ${toDateInput(item.availableUntil)}` };
  if (item.availableUntil) return { tone: 'emerald', label: `Until ${toDateInput(item.availableUntil)}` };
  return null;
}

function toDraft(item: DbItem): Draft {
  return {
    name: item.name,
    riveIndex: item.riveIndex,
    rarity: (RARITIES.includes(item.rarity as Rarity) ? item.rarity : 'common') as Rarity,
    priceFlies: item.priceFlies,
    availableFrom: toDateInput(item.availableFrom),
    availableUntil: toDateInput(item.availableUntil),
    hidden: !!item.hidden,
  };
}

export function AdminCosmeticsManager() {
  const [activeSlot, setActiveSlot] = useState<CosmeticSlot>('skin');
  const [items, setItems] = useState<DbItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [rarity, setRarity] = useState<Rarity | 'all'>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  const load = async () => {
    try {
      const res = await fetch('/api/admin/cosmetics', { credentials: 'include' });
      if (res.ok) setItems((await res.json()).items ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const slotCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    items.forEach((item) => {
      counts[item.slot] = (counts[item.slot] ?? 0) + 1;
    });
    return counts;
  }, [items]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items
      .filter((item) => item.slot === activeSlot)
      .filter((item) => rarity === 'all' || item.rarity === rarity)
      .filter((item) =>
        status === 'shop' ? !item.hidden : status === 'hidden' ? !!item.hidden : status === 'timed' ? !!windowOf(item) : true,
      )
      .filter((item) => !needle || item.name.toLowerCase().includes(needle) || String(item.riveIndex) === needle)
      .sort((a, b) => a.riveIndex - b.riveIndex);
  }, [items, activeSlot, rarity, status, query]);

  const open = items.find((item) => item.id === openId) ?? null;

  return (
    <AdminPage
      title="Cosmetics"
      subtitle="Every skin, hat, outfit and hand item players can collect."
      icon={<Paintbrush />}
      wide
      actions={
        <PondButton onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          New {SLOT_CONFIG[activeSlot].one}
        </PondButton>
      }
      tabs={
        <PageTabs<CosmeticSlot>
          value={activeSlot}
          onChange={setActiveSlot}
          options={SLOTS.map((slot) => ({ value: slot, label: SLOT_CONFIG[slot].label, badge: slotCounts[slot] ?? 0 }))}
        />
      }
    >
      {loading ? (
        <LoadingBlock rows={3} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name or number"
                className={cn(inputClass, 'pl-9')}
              />
            </label>
            <Segmented<Rarity | 'all'>
              size="sm"
              value={rarity}
              onChange={setRarity}
              options={[{ value: 'all', label: 'Any rarity' }, ...RARITIES.map((r) => ({ value: r, label: RARITY_STYLE[r].label }))]}
            />
            <Segmented<StatusFilter>
              size="sm"
              value={status}
              onChange={setStatus}
              options={[
                { value: 'all', label: 'All' },
                { value: 'shop', label: 'In shop' },
                { value: 'hidden', label: 'Hidden' },
                { value: 'timed', label: 'Dated' },
              ]}
            />
          </div>

          {shown.length === 0 ? (
            <EmptyState>No {SLOT_CONFIG[activeSlot].label.toLowerCase()} match.</EmptyState>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
              {shown.map((item) => (
                <CosmeticTile key={item.id} item={item} slot={activeSlot} onOpen={() => setOpenId(item.id)} />
              ))}
            </div>
          )}

          <div className="rounded-[22px] border border-dashed border-border bg-card/50">
            <button
              type="button"
              onClick={() => setBulkOpen((prev) => !prev)}
              className="flex w-full items-center gap-3 px-5 py-4 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-black">Bulk changes</span>
                <span className="block text-[12px] font-medium text-muted-foreground">
                  Reprice a whole rarity at once, or replace the catalog from a CSV.
                </span>
              </span>
              <ChevronDown className={cn('h-5 w-5 text-muted-foreground transition', bulkOpen && 'rotate-180')} />
            </button>
            {bulkOpen ? (
              <div className="space-y-4 px-5 pb-5">
                <EconomyUpdatePanel onApplied={() => void load()} />
                <CsvImport onImported={() => void load()} />
              </div>
            ) : null}
          </div>
        </div>
      )}

      <CosmeticEditor
        item={open}
        slot={activeSlot}
        onClose={() => setOpenId(null)}
        onChanged={() => void load()}
      />
      <CosmeticEditor
        item={null}
        create={creating}
        slot={activeSlot}
        nextIndex={Math.max(0, ...items.filter((item) => item.slot === activeSlot).map((item) => item.riveIndex)) + 1}
        onClose={() => setCreating(false)}
        onChanged={() => void load()}
      />
    </AdminPage>
  );
}

function FrogPreview({ slot, riveIndex, rarity, className }: { slot: CosmeticSlot; riveIndex: number; rarity: string; className?: string }) {
  const indices = { skin: 0, mood: 0, hat: 0, body: 0, hand_item: 0, [slot]: riveIndex };
  return (
    <div className={cn('relative overflow-hidden bg-gradient-to-br', PREVIEW_BG[rarity] ?? PREVIEW_BG.common, className)}>
      <Frog className="h-[125%] w-[125%] translate-y-[10%] object-contain" indices={indices} width={140} height={140} />
    </div>
  );
}

function CosmeticTile({ item, slot, onOpen }: { item: DbItem; slot: CosmeticSlot; onOpen: () => void }) {
  const dated = windowOf(item);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group overflow-hidden rounded-[20px] border border-border bg-card text-left shadow-[0_3px_0_0_hsl(var(--border))] transition hover:-translate-y-0.5 hover:border-primary/40"
    >
      <div className="relative">
        <FrogPreview
          slot={slot}
          riveIndex={item.riveIndex}
          rarity={item.rarity}
          className={cn('flex aspect-[1/0.8] items-center justify-center', item.hidden && 'opacity-40 grayscale')}
        />
        <span className="absolute left-2 top-2 flex flex-wrap gap-1">
          {item.hidden ? (
            <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-black text-white">Hidden</span>
          ) : null}
          {dated ? (
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-black',
                dated.tone === 'sky' && 'bg-sky-500 text-white',
                dated.tone === 'rose' && 'bg-rose-500 text-white',
                dated.tone === 'emerald' && 'bg-emerald-500 text-white',
              )}
            >
              {dated.label}
            </span>
          ) : null}
        </span>
        <span className="absolute right-2 top-2 rounded-full bg-card/80 px-1.5 py-0.5 font-mono text-[10px] font-bold text-muted-foreground">
          #{item.riveIndex}
        </span>
      </div>
      <div className="space-y-1 px-3 py-2.5">
        <p className="truncate text-[13px] font-black">{item.name}</p>
        <p className="flex items-center gap-1.5">
          <span className={cn('rounded-full border px-1.5 py-0.5 text-[10px] font-black', RARITY_STYLE[item.rarity as Rarity]?.chip)}>
            {RARITY_STYLE[item.rarity as Rarity]?.label ?? item.rarity}
          </span>
          <span className="text-[12px] font-black tabular-nums text-muted-foreground">🪰 {item.priceFlies}</span>
        </p>
      </div>
    </button>
  );
}

function CosmeticEditor({
  item,
  create = false,
  slot,
  nextIndex = 1,
  onClose,
  onChanged,
}: {
  item: DbItem | null;
  create?: boolean;
  slot: CosmeticSlot;
  nextIndex?: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const visible = create || !!item;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setConfirmDelete(false);
    setDraft(
      item
        ? toDraft(item)
        : { name: '', riveIndex: nextIndex, rarity: 'common', priceFlies: 100, availableFrom: '', availableUntil: '', hidden: false },
    );
  }, [visible, item?.id]);

  if (!visible || !draft) return null;

  const saved = item ? toDraft(item) : null;
  const dirty = !saved || JSON.stringify(saved) !== JSON.stringify(draft);

  const request = async (method: 'POST' | 'PUT' | 'DELETE', body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/cosmetics', {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!draft.name.trim()) {
      setError('Give it a name first.');
      return;
    }
    if (create) {
      void request('POST', {
        name: draft.name.trim(),
        slot,
        riveIndex: draft.riveIndex,
        rarity: draft.rarity,
        priceFlies: draft.priceFlies,
      });
      return;
    }
    void request('PUT', {
      id: item!.id,
      name: draft.name.trim(),
      riveIndex: draft.riveIndex,
      rarity: draft.rarity,
      priceFlies: draft.priceFlies,
      availableFrom: draft.availableFrom || null,
      availableUntil: draft.availableUntil || null,
      hidden: draft.hidden,
    });
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto rounded-[28px]">
        <div className="grid gap-5 sm:grid-cols-[11rem_minmax(0,1fr)]">
          <FrogPreview
            slot={slot}
            riveIndex={draft.riveIndex}
            rarity={draft.rarity}
            className="flex aspect-square items-center justify-center rounded-[22px]"
          />
          <div className="min-w-0 space-y-4">
            <DialogHeader className="text-left">
              <DialogTitle className="text-[22px] font-black">
                {create ? `New ${SLOT_CONFIG[slot].one}` : item?.name}
              </DialogTitle>
              <DialogDescription className="text-[12px] font-medium">
                {create ? 'It shows up in the shop as soon as you add it.' : `id ${item?.id}`}
              </DialogDescription>
            </DialogHeader>
            <Field label="Name">
              <input
                autoFocus={create}
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                className={inputClass}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Price">
                <NumberInput value={draft.priceFlies} max={100000} suffix="flies" onChange={(priceFlies) => setDraft({ ...draft, priceFlies })} />
              </Field>
              <Field label="Art number" hint="Its input in the frog art file.">
                <NumberInput value={draft.riveIndex} max={9999} onChange={(riveIndex) => setDraft({ ...draft, riveIndex })} />
              </Field>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {error ? <Notice type="error">{error}</Notice> : null}
          <Field label="Rarity">
            <div className="flex flex-wrap gap-1.5">
              {RARITIES.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setDraft({ ...draft, rarity: option })}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-[12px] font-black transition',
                    draft.rarity === option
                      ? RARITY_STYLE[option].chip
                      : 'border-transparent bg-muted/60 text-muted-foreground hover:text-foreground',
                  )}
                >
                  {RARITY_STYLE[option].label}
                </button>
              ))}
            </div>
          </Field>
          {!create ? (
            <>
              <ToggleRow
                title={draft.hidden ? 'Hidden from the shop' : 'In the shop'}
                description="Hidden items stay with players who own them."
                checked={!draft.hidden}
                onChange={(on) => setDraft({ ...draft, hidden: !on })}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field label="In the shop from" hint="Blank means right away.">
                  <input
                    type="date"
                    value={draft.availableFrom}
                    onChange={(event) => setDraft({ ...draft, availableFrom: event.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Until" hint="Blank means forever.">
                  <input
                    type="date"
                    value={draft.availableUntil}
                    onChange={(event) => setDraft({ ...draft, availableUntil: event.target.value })}
                    className={inputClass}
                  />
                </Field>
              </div>
            </>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            {!create ? (
              <PondButton
                variant={confirmDelete ? 'danger' : 'ghost'}
                disabled={busy}
                onClick={() => (confirmDelete ? void request('DELETE', { id: item!.id }) : setConfirmDelete(true))}
              >
                <Trash2 className="h-4 w-4" />
                {confirmDelete ? 'Delete for good' : 'Delete'}
              </PondButton>
            ) : null}
            <span className="flex-1" />
            <PondButton variant="secondary" onClick={onClose}>
              {dirty && !create ? 'Cancel' : create ? 'Cancel' : 'Done'}
            </PondButton>
            {dirty ? (
              <PondButton onClick={save} loading={busy}>
                {create ? 'Add' : 'Save'}
              </PondButton>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CsvImport({ onImported }: { onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const run = async () => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/admin/cosmetics/import', { method: 'POST', credentials: 'include', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Import failed');
      setResult({
        type: 'success',
        text: `Imported ${data.imported ?? 0}, removed ${data.removed ?? 0}${data.scheduled ? `, ${data.scheduled} scheduled` : ''}${
          data.expired ? `, ${data.expired} already ended` : ''
        }${data.colorGroups ? `, ${data.colorGroups} color groups` : ''}.`,
      });
      setFile(null);
      onImported();
    } catch (err) {
      setResult({ type: 'error', text: err instanceof Error ? err.message : 'Import failed' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl bg-muted/40 p-4">
      <div>
        <p className="text-[14px] font-black">Replace the catalog from a CSV</p>
        <p className="text-[12px] font-medium text-muted-foreground">
          Columns: id, name, rarity, price, skin, body, hat, handItem, and optional startDate / endDate (YYYY-MM-DD) and season (YYYY-MM, keeps the item out of the shop, gifts and trade-up until that month ends). Use -1 in unused
          columns. Optional duplicate: rows with the same number are colors of one item. Optional color: a swatch hex like #4f8bff.
          This replaces every cosmetic.
        </p>
      </div>
      {result ? <Notice type={result.type}>{result.text}</Notice> : null}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            event.target.value = '';
            setResult(null);
          }}
        />
        <PondButton variant="secondary" onClick={() => inputRef.current?.click()}>
          <Upload className="h-4 w-4" />
          {file ? file.name : 'Choose CSV'}
        </PondButton>
        {file ? (
          <PondButton variant="danger" onClick={() => void run()} loading={busy}>
            Replace catalog
          </PondButton>
        ) : null}
      </div>
    </div>
  );
}
