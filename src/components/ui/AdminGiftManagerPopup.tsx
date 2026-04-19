'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle,
  Eye,
  EyeOff,
  Gift,
  Plus,
  Save,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GiftRive } from '@/components/ui/gift-box/GiftBox';
import {
  RewardTile,
  type QuestRewardCatalogItem,
} from '@/components/ui/QuestCards';
import { cn } from '@/lib/utils';
import type { ItemDef } from '@/lib/skins/catalog';

type DbItem = ItemDef & {
  hidden?: boolean;
};

type GiftDrop = {
  itemId: string;
  chance: number;
  item?: ItemDef;
};

type GiftConfig = {
  gift: DbItem;
  drops: GiftDrop[];
};

const RARITIES: ItemDef['rarity'][] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
];

const RARITY_TEXT: Record<ItemDef['rarity'], string> = {
  common: 'text-muted-foreground',
  uncommon: 'text-emerald-700 dark:text-emerald-400',
  rare: 'text-sky-700 dark:text-sky-400',
  epic: 'text-violet-700 dark:text-violet-400',
  legendary: 'text-amber-700 dark:text-amber-400',
};

export function AdminGiftManagerPopup({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [gifts, setGifts] = useState<GiftConfig[]>([]);
  const [catalog, setCatalog] = useState<DbItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [itemRarityFilter, setItemRarityFilter] = useState<'all' | ItemDef['rarity']>('all');
  const [form, setForm] = useState({
    name: '',
    riveIndex: '0',
    rarity: 'common',
    priceFlies: '100',
    hidden: false,
  });
  const [drops, setDrops] = useState<GiftDrop[]>([]);

  useEffect(() => {
    if (!open) return;
    loadData();
  }, [open]);

  const selectedGift = useMemo(
    () => gifts.find((config) => config.gift.id === selectedId) ?? null,
    [gifts, selectedId],
  );

  const totalChance = useMemo(
    () => drops.reduce((sum, drop) => sum + Math.max(0, Number(drop.chance) || 0), 0),
    [drops],
  );
  const rewardCatalog = useMemo<Record<string, QuestRewardCatalogItem>>(
    () => Object.fromEntries(catalog.map((item) => [item.id, item])),
    [catalog],
  );
  const filteredCatalog = useMemo(
    () =>
      itemRarityFilter === 'all'
        ? catalog
        : catalog.filter((item) => item.rarity === itemRarityFilter),
    [catalog, itemRarityFilter],
  );

  const loadData = async (preferredId?: string) => {
    try {
      const res = await fetch('/api/admin/gifts', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) {
        setResult({ type: 'error', message: data.error || 'Could not load gifts' });
        return;
      }
      const nextGifts: GiftConfig[] = data.gifts ?? [];
      setGifts(nextGifts);
      setCatalog(data.catalog ?? []);
      const nextSelected =
        preferredId && nextGifts.some((config) => config.gift.id === preferredId)
          ? preferredId
          : selectedId && nextGifts.some((config) => config.gift.id === selectedId)
            ? selectedId
            : nextGifts[0]?.gift.id ?? null;
      setSelectedId(nextSelected);
      const active = nextGifts.find((config) => config.gift.id === nextSelected);
      if (active) hydrateForm(active);
    } catch {
      setResult({ type: 'error', message: 'Network error' });
    }
  };

  const hydrateForm = (config: GiftConfig) => {
    setAddingNew(false);
    setConfirmDelete(false);
    setConfirmSave(false);
    setForm({
      name: config.gift.name,
      riveIndex: String(config.gift.riveIndex),
      rarity: config.gift.rarity,
      priceFlies: String(config.gift.priceFlies ?? 100),
      hidden: !!config.gift.hidden,
    });
    setDrops(config.drops.map((drop) => ({ itemId: drop.itemId, chance: drop.chance, item: drop.item })));
  };

  const startAdd = () => {
    setAddingNew(true);
    setSelectedId(null);
    setConfirmDelete(false);
    setConfirmSave(false);
    setResult(null);
    setForm({
      name: '',
      riveIndex: '0',
      rarity: 'common',
      priceFlies: '100',
      hidden: false,
    });
    setDrops([]);
  };

  const selectGift = (config: GiftConfig) => {
    setSelectedId(config.gift.id);
    setResult(null);
    setConfirmSave(false);
    hydrateForm(config);
  };

  const addDrop = () => {
    setConfirmSave(false);
    const first = catalog.find((item) => !drops.some((drop) => drop.itemId === item.id));
    if (!first) return;
    setDrops((prev) => [...prev, { itemId: first.id, chance: 1, item: first }]);
  };

  const toggleDropItem = (item: DbItem) => {
    setConfirmSave(false);
    setDrops((prev) => {
      const exists = prev.some((drop) => drop.itemId === item.id);
      if (exists) return prev.filter((drop) => drop.itemId !== item.id);
      return [...prev, { itemId: item.id, chance: 1, item }];
    });
  };

  const updateDrop = (index: number, patch: Partial<GiftDrop>) => {
    setConfirmSave(false);
    setDrops((prev) =>
      prev.map((drop, i) => {
        if (i !== index) return drop;
        const next = { ...drop, ...patch };
        if (patch.itemId) next.item = catalog.find((item) => item.id === patch.itemId);
        return next;
      }),
    );
  };

  const removeDrop = (index: number) => {
    setConfirmSave(false);
    setDrops((prev) => prev.filter((_, i) => i !== index));
  };

  const saveGift = async () => {
    if (!form.name.trim()) return;
    if (!confirmSave) {
      setConfirmSave(true);
      setResult({
        type: 'success',
        message: 'Review the gift and click Confirm Save to apply changes.',
      });
      return;
    }
    setSaving(true);
    setResult(null);
    try {
      const body = {
        name: form.name.trim(),
        riveIndex: Number(form.riveIndex) || 0,
        rarity: form.rarity,
        priceFlies: Number(form.priceFlies) || 0,
        hidden: form.hidden,
        drops: drops.map((drop) => ({
          itemId: drop.itemId,
          chance: Number(drop.chance) || 0,
        })),
      };
      const res = await fetch('/api/admin/gifts', {
        method: addingNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(addingNew ? body : { id: selectedId, ...body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ type: 'error', message: data.error || 'Could not save gift' });
        setConfirmSave(false);
        return;
      }
      setResult({ type: 'success', message: addingNew ? 'Gift added' : 'Gift saved' });
      setAddingNew(false);
      setConfirmSave(false);
      await loadData(data.gift?.id);
    } catch {
      setResult({ type: 'error', message: 'Network error' });
    } finally {
      setSaving(false);
    }
  };

  const deleteGift = async () => {
    if (!selectedId) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      setConfirmSave(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/gifts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: selectedId }),
      });
      if (res.ok) {
        setResult({ type: 'success', message: 'Gift deleted' });
        setSelectedId(null);
        setDrops([]);
        await loadData();
      } else {
        const data = await res.json();
        setResult({ type: 'error', message: data.error || 'Could not delete gift' });
      }
    } catch {
      setResult({ type: 'error', message: 'Network error' });
    } finally {
      setSaving(false);
      setConfirmDelete(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[1100] bg-black/60 backdrop-blur-md"
      />
      <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-2xl"
        >
          <div className="shrink-0 border-b border-border/40 bg-gradient-to-br from-emerald-500/10 to-amber-500/10 px-6 py-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <Gift className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-black tracking-tight text-foreground">
                    Gift Manager
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Edit gift boxes, Rive colors, prices, and drop chances
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted"
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="flex min-h-0 flex-col border-b border-border/50 p-4 md:border-b-0 md:border-r">
              <Button onClick={startAdd} className="mb-3 h-10 gap-2 font-bold">
                <Plus className="h-4 w-4" />
                Add Gift
              </Button>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {gifts.map((config) => {
                  const active = selectedId === config.gift.id;
                  return (
                    <button
                      key={config.gift.id}
                      onClick={() => selectGift(config)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-2xl border p-2 text-left transition-all',
                        active
                          ? 'border-primary/30 bg-primary/10 ring-1 ring-primary/20'
                          : 'border-border/50 bg-muted/20 hover:bg-muted/40',
                        config.gift.hidden && 'opacity-50',
                      )}
                    >
                      <GiftPreview
                        color={config.gift.riveIndex}
                        className="h-14 w-14 shrink-0 rounded-xl"
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-foreground">
                          {config.gift.name}
                        </div>
                        <div className={cn('text-[10px] font-black uppercase', RARITY_TEXT[config.gift.rarity])}>
                          {config.gift.rarity} · {config.drops.length} drops
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>

            <section className="min-h-0 overflow-y-auto p-4 md:p-5">
              {result && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    'mb-4 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium',
                    result.type === 'success'
                      ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'border border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400',
                  )}
                >
                  {result.type === 'success' ? (
                    <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 shrink-0" />
                  )}
                  {result.message}
                </motion.div>
              )}

              {!addingNew && !selectedGift ? (
                <div className="rounded-3xl border border-dashed border-border p-8 text-center text-sm font-bold text-muted-foreground">
                  Pick a gift or add a new one.
                </div>
              ) : (
                <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="space-y-3">
                    <div className="rounded-3xl border border-border/50 bg-card p-4">
                      <div className="mx-auto h-40 w-40">
                        <GiftPreview
                          key={`preview-${selectedId ?? 'new'}-${form.riveIndex}`}
                          color={Number(form.riveIndex) || 0}
                          className="h-full w-full rounded-2xl"
                        />
                      </div>
                      <p className="text-center text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                        Rive color {Number(form.riveIndex) || 0}
                      </p>
                    </div>
                    {!addingNew && (
                      <Button
                        onClick={() => {
                          setConfirmSave(false);
                          setForm((prev) => ({ ...prev, hidden: !prev.hidden }));
                        }}
                        variant="outline"
                        className="w-full gap-2"
                      >
                        {form.hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        {form.hidden ? 'Show Gift' : 'Hide Gift'}
                      </Button>
                    )}
                    {!addingNew && (
                      <Button
                        onClick={deleteGift}
                        variant={confirmDelete ? 'destructive' : 'outline'}
                        className="w-full gap-2"
                        disabled={saving}
                      >
                        <Trash2 className="h-4 w-4" />
                        {confirmDelete ? 'Confirm Delete' : 'Delete Gift'}
                      </Button>
                    )}
                  </div>

                  <div className="space-y-5">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Name">
                        <input
                          value={form.name}
                          onChange={(e) => {
                            setConfirmSave(false);
                            setForm((prev) => ({ ...prev, name: e.target.value }));
                          }}
                          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/25"
                        />
                      </Field>
                      <Field label="Rive color input">
                        <input
                          type="number"
                          min={0}
                          value={form.riveIndex}
                          onChange={(e) => {
                            setConfirmSave(false);
                            setForm((prev) => ({ ...prev, riveIndex: e.target.value }));
                          }}
                          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/25"
                        />
                      </Field>
                      <Field label="Rarity">
                        <select
                          value={form.rarity}
                          onChange={(e) => {
                            setConfirmSave(false);
                            setForm((prev) => ({ ...prev, rarity: e.target.value }));
                          }}
                          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/25"
                        >
                          {RARITIES.map((rarity) => (
                            <option key={rarity} value={rarity}>
                              {rarity}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Price">
                        <input
                          type="number"
                          min={0}
                          value={form.priceFlies}
                          onChange={(e) => {
                            setConfirmSave(false);
                            setForm((prev) => ({ ...prev, priceFlies: e.target.value }));
                          }}
                          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/25"
                        />
                      </Field>
                    </div>

                    <div className="rounded-3xl border border-border/50 bg-card p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-black text-foreground">
                            Drops
                          </h3>
                          <p className="text-[11px] text-muted-foreground">
                            Chances are weights. Current total: {totalChance.toLocaleString()}
                          </p>
                        </div>
                        <Button onClick={addDrop} size="sm" variant="outline" className="gap-2">
                          <Plus className="h-4 w-4" />
                          Add Drop
                        </Button>
                      </div>

                      <div className="mb-4 rounded-2xl border border-border/50 bg-background/70 p-3">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                            Pick Items
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {(['all', ...RARITIES] as const).map((rarity) => {
                              const active = itemRarityFilter === rarity;
                              return (
                                <button
                                  key={rarity}
                                  type="button"
                                  onClick={() => setItemRarityFilter(rarity)}
                                  className={cn(
                                    'rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide transition',
                                    active
                                      ? 'border-primary/30 bg-primary/10 text-primary'
                                      : 'border-border/50 bg-card text-muted-foreground hover:bg-muted/50',
                                  )}
                                >
                                  {rarity}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="grid max-h-64 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
                          {filteredCatalog.map((item) => {
                            const selected = drops.some((drop) => drop.itemId === item.id);
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => toggleDropItem(item)}
                                className={cn(
                                  'flex items-center gap-3 rounded-2xl border p-3 text-left transition',
                                  selected
                                    ? 'border-primary/30 bg-primary/10 ring-1 ring-primary/20'
                                    : 'border-border/50 bg-card hover:bg-muted/40',
                                )}
                              >
                                <RewardTile
                                  reward={{ type: 'ITEM', itemId: item.id }}
                                  rewardCatalog={rewardCatalog}
                                  isPremium={false}
                                />
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-black text-foreground">
                                    {item.name}
                                  </p>
                                  <p className={cn('text-[10px] font-black uppercase', RARITY_TEXT[item.rarity])}>
                                    {item.rarity}
                                  </p>
                                </div>
                              </button>
                            );
                          })}
                          {filteredCatalog.length === 0 && (
                            <div className="col-span-full rounded-2xl border border-dashed border-border p-5 text-center text-xs font-bold text-muted-foreground">
                              No items match this rarity.
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        {drops.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-border p-5 text-center text-xs font-bold text-muted-foreground">
                            No drops yet. Add at least one item before opening this gift.
                          </div>
                        ) : (
                          drops.map((drop, index) => {
                            const pct = totalChance > 0 ? (drop.chance / totalChance) * 100 : 0;
                            const item = drop.item ?? catalog.find((option) => option.id === drop.itemId);
                            return (
                              <div
                                key={`${drop.itemId}-${index}`}
                                className="grid grid-cols-[minmax(0,1fr)_88px_44px] items-center gap-2 rounded-2xl border border-border/50 bg-background p-2"
                              >
                                <div className="flex min-w-0 items-center gap-3">
                                  <RewardTile
                                    reward={{ type: 'ITEM', itemId: drop.itemId }}
                                    rewardCatalog={rewardCatalog}
                                    isPremium={false}
                                  />
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-black text-foreground">
                                      {item?.name ?? drop.itemId}
                                    </p>
                                    <p className={cn('text-[10px] font-black uppercase', RARITY_TEXT[item?.rarity ?? 'common'])}>
                                      {item?.rarity ?? 'unknown'}
                                    </p>
                                  </div>
                                </div>
                                <div>
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.000001"
                                    value={drop.chance}
                                    onChange={(e) => updateDrop(index, { chance: Number(e.target.value) })}
                                    className="w-full rounded-xl border border-border bg-background px-2 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-primary/25"
                                  />
                                  <div className="mt-0.5 text-center text-[9px] font-black text-muted-foreground">
                                    {pct >= 1 ? pct.toFixed(1) : pct.toFixed(4)}%
                                  </div>
                                </div>
                                <button
                                  onClick={() => removeDrop(index)}
                                  className="flex h-9 w-9 items-center justify-center rounded-xl text-red-500 hover:bg-red-500/10"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    <Button
                      onClick={saveGift}
                      disabled={saving || !form.name.trim()}
                      className={cn(
                        'h-11 w-full gap-2 font-black',
                        confirmSave && 'bg-amber-500 text-white hover:bg-amber-600',
                      )}
                    >
                      {saving ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      {confirmSave
                        ? 'Confirm Save'
                        : addingNew
                          ? 'Create Gift'
                          : 'Save Gift'}
                    </Button>
                  </div>
                </div>
              )}
            </section>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body,
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function GiftPreview({
  color,
  className,
}: {
  color: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden bg-gradient-to-br from-emerald-100 to-emerald-50 shadow-inner dark:from-emerald-900/40 dark:to-emerald-950/40',
        className,
      )}
    >
      <div className="absolute inset-0 flex items-end justify-center">
        <div className="h-[110%] w-[110%] -translate-y-1 drop-shadow-xl">
          <GiftRive color={color} />
        </div>
      </div>
    </div>
  );
}
