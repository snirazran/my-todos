'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Pencil, Crown, Shirt, Hand, Paintbrush, CheckCircle, XCircle, Eye, EyeOff, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createPortal } from 'react-dom';
import Frog from '@/components/ui/frog';
import { cn } from '@/lib/utils';

type CosmeticSlot = 'skin' | 'hat' | 'body' | 'hand_item';

const SLOT_CONFIG: Record<CosmeticSlot, { label: string; icon: React.ReactNode }> = {
  skin: { label: 'Skins', icon: <Paintbrush className="w-4 h-4" /> },
  hat: { label: 'Hats', icon: <Crown className="w-4 h-4" /> },
  body: { label: 'Body', icon: <Shirt className="w-4 h-4" /> },
  hand_item: { label: 'Hand Items', icon: <Hand className="w-4 h-4" /> },
};

const SLOTS: CosmeticSlot[] = ['skin', 'hat', 'body', 'hand_item'];

type DbItem = {
  _id?: string;
  id: string;
  name: string;
  slot: string;
  riveIndex: number;
  rarity: string;
  priceFlies: number;
  hidden?: boolean;
};

export function AdminCosmeticsPopup({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [activeSlot, setActiveSlot] = useState<CosmeticSlot>('skin');
  const [dbItems, setDbItems] = useState<DbItem[]>([]);
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIndex, setNewIndex] = useState('');
  const [newRarity, setNewRarity] = useState('common');
  const [newPrice, setNewPrice] = useState('100');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ name: string; riveIndex: string; rarity: string; priceFlies: string }>({ name: '', riveIndex: '', rarity: 'common', priceFlies: '100' });
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvInputKey, setCsvInputKey] = useState(0);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!open) return;
    loadDbItems();
  }, [open]);

  const loadDbItems = async () => {
    try {
      const res = await fetch('/api/admin/cosmetics', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setDbItems(data.items ?? []);
      }
    } catch { /* silent */ }
  };

  const slotItems = useMemo(() => {
    return dbItems
      .filter((i) => i.slot === activeSlot)
      .sort((a, b) => a.riveIndex - b.riveIndex);
  }, [activeSlot, dbItems]);

  const handleAddItem = async () => {
    if (!newName.trim() || !newIndex.trim()) return;
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/cosmetics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: newName.trim(),
          slot: activeSlot,
          riveIndex: Number(newIndex),
          rarity: newRarity,
          priceFlies: Number(newPrice) || 100,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ type: 'success', message: `Added "${newName.trim()}"` });
        setNewName('');
        setNewIndex('');
        setNewPrice('100');
        setAddingNew(false);
        await loadDbItems();
      } else {
        setResult({ type: 'error', message: data.error || 'Failed to add' });
      }
    } catch {
      setResult({ type: 'error', message: 'Network error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    try {
      const res = await fetch('/api/admin/cosmetics', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setResult({ type: 'success', message: 'Item deleted' });
        await loadDbItems();
      }
    } catch {
      setResult({ type: 'error', message: 'Failed to delete' });
    }
  };

  const handleToggleHidden = async (id: string, currentlyHidden: boolean) => {
    try {
      const res = await fetch('/api/admin/cosmetics', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, hidden: !currentlyHidden }),
      });
      if (res.ok) {
        setResult({ type: 'success', message: currentlyHidden ? 'Item restored' : 'Item hidden' });
        await loadDbItems();
      }
    } catch {
      setResult({ type: 'error', message: 'Failed to update' });
    }
  };

  const startEdit = (item: DbItem) => {
    setEditingId(item.id);
    setEditValues({
      name: item.name,
      riveIndex: String(item.riveIndex),
      rarity: item.rarity,
      priceFlies: String(item.priceFlies),
    });
    setResult(null);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editValues.name.trim()) return;
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/cosmetics', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: editingId,
          name: editValues.name.trim(),
          riveIndex: Number(editValues.riveIndex),
          rarity: editValues.rarity,
          priceFlies: Number(editValues.priceFlies) || 0,
        }),
      });
      if (res.ok) {
        setResult({ type: 'success', message: 'Saved changes' });
        setEditingId(null);
        await loadDbItems();
      } else {
        const data = await res.json();
        setResult({ type: 'error', message: data.error || 'Failed to save' });
      }
    } catch {
      setResult({ type: 'error', message: 'Network error' });
    } finally {
      setSaving(false);
    }
  };

  const handleImportCsv = async () => {
    if (!csvFile) return;
    setImporting(true);
    setResult(null);
    setAddingNew(false);
    setEditingId(null);
    try {
      const formData = new FormData();
      formData.append('file', csvFile);
      const res = await fetch('/api/admin/cosmetics/import', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setResult({
          type: 'success',
          message: `Imported ${data.imported ?? 0} cosmetics; removed ${data.removed ?? 0} old IDs`,
        });
        setCsvFile(null);
        setCsvInputKey((key) => key + 1);
        await loadDbItems();
      } else {
        setResult({ type: 'error', message: data.error || 'Failed to import CSV' });
      }
    } catch {
      setResult({ type: 'error', message: 'Network error' });
    } finally {
      setImporting(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="cosmetics-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[1100] bg-black/60 backdrop-blur-md"
      />
      <div key="cosmetics-dialog-shell" className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-2xl bg-background border border-border rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        >
          {/* Header */}
          <div className="relative px-6 py-5 border-b border-border/40 bg-gradient-to-br from-purple-500/10 to-pink-500/10 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-purple-500/20 text-purple-600 dark:text-purple-400">
                  <Paintbrush className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-black tracking-tight text-foreground">
                    Cosmetics Manager
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    All items from DB &middot; Edit, hide, or delete any item
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-muted transition-colors"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Category Tabs */}
          <div className="flex gap-2 px-6 pt-4 pb-2 shrink-0 overflow-x-auto">
            {SLOTS.map((slot) => {
              const config = SLOT_CONFIG[slot];
              const isActive = activeSlot === slot;
              return (
                <button
                  key={slot}
                  onClick={() => { setActiveSlot(slot); setAddingNew(false); setEditingId(null); setResult(null); }}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold whitespace-nowrap transition-all border-2',
                    isActive
                      ? 'bg-primary/10 text-primary border-primary/20'
                      : 'bg-muted/40 text-muted-foreground border-transparent hover:bg-muted/60',
                  )}
                >
                  {config.icon}
                  {config.label}
                </button>
              );
            })}
          </div>

          {/* Items Grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {result && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium mb-4',
                  result.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                    : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20',
                )}
              >
                {result.type === 'success' ? (
                  <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 shrink-0" />
                )}
                {result.message}
              </motion.div>
            )}

            <div className="mb-4 rounded-2xl border border-border/60 bg-muted/25 p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border bg-background px-3 py-2 text-sm transition hover:border-primary/40">
                  <Upload className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate font-semibold text-muted-foreground">
                    {csvFile ? csvFile.name : 'Choose CSV file'}
                  </span>
                  <input
                    key={csvInputKey}
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    onChange={(e) => {
                      setCsvFile(e.target.files?.[0] ?? null);
                      setResult(null);
                    }}
                  />
                </label>
                <Button
                  onClick={handleImportCsv}
                  disabled={!csvFile || importing}
                  className="shrink-0 font-black"
                >
                  {importing ? (
                    <div className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                  ) : (
                    'Import CSV'
                  )}
                </Button>
              </div>
              <p className="mt-2 text-[11px] font-medium text-muted-foreground">
                Replaces all skins, body items, hats, and hand items. Use -1 in inactive columns.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {slotItems.map((item) => {
                const itemKey = item._id || item.id || `${item.slot}-${item.riveIndex}-${item.name}`;
                return editingId === item.id ? (
                  /* ─── Inline Edit Form ─── */
                  <div key={`edit-${itemKey}`} className="flex flex-col gap-2 p-3 rounded-2xl border-2 border-amber-400/50 bg-amber-500/5">
                    <div className="text-[10px] font-mono text-muted-foreground mb-1">id: {item.id}</div>
                    <input
                      type="text"
                      placeholder="Name"
                      value={editValues.name}
                      onChange={(e) => setEditValues((p) => ({ ...p, name: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                    />
                    <input
                      type="number"
                      placeholder="Rive Input #"
                      value={editValues.riveIndex}
                      onChange={(e) => setEditValues((p) => ({ ...p, riveIndex: e.target.value }))}
                      min={0}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                    />
                    <select
                      value={editValues.rarity}
                      onChange={(e) => setEditValues((p) => ({ ...p, rarity: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                    >
                      <option value="common">Common</option>
                      <option value="uncommon">Uncommon</option>
                      <option value="rare">Rare</option>
                      <option value="epic">Epic</option>
                      <option value="legendary">Legendary</option>
                    </select>
                    <input
                      type="number"
                      placeholder="Price (flies)"
                      value={editValues.priceFlies}
                      onChange={(e) => setEditValues((p) => ({ ...p, priceFlies: e.target.value }))}
                      min={0}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={handleSaveEdit}
                        disabled={saving || !editValues.name.trim()}
                        size="sm"
                        className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold"
                      >
                        {saving ? (
                          <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          'Save'
                        )}
                      </Button>
                      <Button onClick={() => setEditingId(null)} variant="ghost" size="sm">
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* ─── Normal Card ─── */
                  <CosmeticCard
                    key={`card-${itemKey}`}
                    item={item}
                    slot={activeSlot}
                    onEdit={() => startEdit(item)}
                    onDelete={() => handleDeleteItem(item.id)}
                    onToggleHidden={() => handleToggleHidden(item.id, !!item.hidden)}
                  />
                );
              })}

              {/* Add New Card */}
              {!addingNew ? (
                <button
                  onClick={() => { setAddingNew(true); setEditingId(null); setResult(null); }}
                  className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary/5 transition-all min-h-[200px]"
                >
                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted">
                    <Plus className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <span className="text-sm font-bold text-muted-foreground">Add New</span>
                </button>
              ) : (
                <div className="flex flex-col gap-2 p-3 rounded-2xl border-2 border-primary/30 bg-primary/5">
                  <input
                    type="text"
                    placeholder="Name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <input
                    type="number"
                    placeholder="Rive Input #"
                    value={newIndex}
                    onChange={(e) => setNewIndex(e.target.value)}
                    min={0}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <select
                    value={newRarity}
                    onChange={(e) => setNewRarity(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="common">Common</option>
                    <option value="uncommon">Uncommon</option>
                    <option value="rare">Rare</option>
                    <option value="epic">Epic</option>
                    <option value="legendary">Legendary</option>
                  </select>
                  <input
                    type="number"
                    placeholder="Price (flies)"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    min={0}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={handleAddItem}
                      disabled={saving || !newName.trim() || !newIndex.trim()}
                      size="sm"
                      className="flex-1 bg-primary text-primary-foreground font-bold"
                    >
                      {saving ? (
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        'Save'
                      )}
                    </Button>
                    <Button onClick={() => setAddingNew(false)} variant="ghost" size="sm">
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body,
  );
}

/* ─── Individual Cosmetic Card ─────────────────────── */

const RARITY_BORDER: Record<string, string> = {
  common: 'border-border',
  uncommon: 'border-emerald-500',
  rare: 'border-sky-500',
  epic: 'border-violet-500',
  legendary: 'border-amber-500',
};

const RARITY_BG: Record<string, string> = {
  common: 'from-muted/50 to-muted/20',
  uncommon: 'from-emerald-100 to-emerald-50 dark:from-emerald-900/40 dark:to-emerald-950/40',
  rare: 'from-sky-100 to-sky-50 dark:from-sky-900/40 dark:to-sky-950/40',
  epic: 'from-violet-100 to-violet-50 dark:from-violet-900/40 dark:to-violet-950/40',
  legendary: 'from-amber-100 to-amber-50 dark:from-amber-900/40 dark:to-amber-950/40',
};

const RARITY_TEXT: Record<string, string> = {
  common: 'text-muted-foreground',
  uncommon: 'text-emerald-700 dark:text-emerald-400',
  rare: 'text-sky-700 dark:text-sky-400',
  epic: 'text-violet-700 dark:text-violet-400',
  legendary: 'text-amber-700 dark:text-amber-400',
};

function CosmeticCard({
  item,
  slot,
  onEdit,
  onDelete,
  onToggleHidden,
}: {
  item: DbItem;
  slot: CosmeticSlot;
  onEdit: () => void;
  onDelete: () => void;
  onToggleHidden: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const previewIndices = {
    skin: 0,
    mood: 0,
    hat: 0,
    body: 0,
    hand_item: 0,
    [slot]: item.riveIndex,
  };

  const isHidden = !!item.hidden;
  const border = RARITY_BORDER[item.rarity] || RARITY_BORDER.common;
  const bg = RARITY_BG[item.rarity] || RARITY_BG.common;
  const text = RARITY_TEXT[item.rarity] || RARITY_TEXT.common;

  return (
    <div
      className={cn(
        'relative flex flex-col p-2.5 rounded-2xl border-[3px] overflow-hidden w-full transition-opacity',
        border,
        isHidden && 'opacity-40',
      )}
    >
      {/* Rarity tag */}
      <div
        className={cn(
          'absolute top-0 left-0 px-2 py-0.5 rounded-br-2xl text-[9px] font-black uppercase tracking-wider border-b border-r z-20',
          border,
          text,
        )}
      >
        {item.rarity}
      </div>

      {/* Hidden badge */}
      {isHidden && (
        <div className="absolute top-0 right-0 px-2 py-0.5 rounded-bl-xl text-[9px] font-bold bg-red-500 text-white z-20">
          HIDDEN
        </div>
      )}

      {/* Frog Preview */}
      <div
        className={cn(
          'mt-4 mb-1 mx-auto w-full aspect-[1/0.75] rounded-xl flex items-center justify-center relative overflow-hidden',
          'bg-gradient-to-br shadow-inner',
          bg,
        )}
      >
        <Frog
          className="w-[125%] h-[125%] object-contain translate-y-[10%]"
          indices={previewIndices}
          width={140}
          height={140}
        />
      </div>

      {/* Info */}
      <div className="flex flex-col items-center gap-0.5 py-1">
        <h4 className="text-xs font-bold text-foreground text-center truncate w-full">
          {item.name}
        </h4>
        <span className="text-[10px] font-mono text-muted-foreground">
          {slot}: {item.riveIndex}
        </span>
        {item.priceFlies ? (
          <span className="text-[10px] text-muted-foreground">
            {item.priceFlies} flies
          </span>
        ) : null}
      </div>

      {/* Action buttons */}
      <div className="flex gap-1 mt-1">
        <button
          onClick={onEdit}
          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl text-[10px] font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors border border-transparent hover:border-amber-200 dark:hover:border-amber-900"
        >
          <Pencil className="w-3 h-3" />
          Edit
        </button>
        <button
          onClick={onToggleHidden}
          className={cn(
            'flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl text-[10px] font-bold transition-colors border border-transparent',
            isHidden
              ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:border-emerald-200 dark:hover:border-emerald-900'
              : 'text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/30 hover:border-orange-200 dark:hover:border-orange-900',
          )}
        >
          {isHidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          {isHidden ? 'Show' : 'Hide'}
        </button>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl text-[10px] font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors border border-transparent hover:border-red-200 dark:hover:border-red-900"
          >
            <Trash2 className="w-3 h-3" />
            Delete
          </button>
        ) : (
          <button
            onClick={() => { onDelete(); setConfirmDelete(false); }}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl text-[10px] font-black text-white bg-red-500 hover:bg-red-600 transition-colors"
          >
            Confirm?
          </button>
        )}
      </div>
    </div>
  );
}
