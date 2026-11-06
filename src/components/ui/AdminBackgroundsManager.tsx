'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Image as ImageIcon,
  Loader2,
  Monitor,
  MonitorSpeaker,
  Plus,
  Smartphone,
  Tablet,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AdminPage,
  EmptyState,
  Field,
  LoadingBlock,
  Notice,
  NumberInput,
  PondButton,
  Segmented,
  ToggleRow,
  inputClass,
} from '@/components/admin/kit';
import { RARITY_STYLE } from '@/components/admin/economy/rarity';
import { cn } from '@/lib/utils';

type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
type SizeKey = 'mobile' | 'tablet' | 'web' | 'webLarge';
type BackgroundImages = Record<SizeKey, string>;

type BackgroundItem = {
  id: string;
  name: string;
  rarity: Rarity;
  priceFlies: number;
  images: BackgroundImages;
  hidden: boolean;
};

type Filter = 'all' | 'shop' | 'hidden' | 'fix';

const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

const SIZE_FIELDS: { key: SizeKey; label: string; hint: string; icon: React.ReactNode }[] = [
  { key: 'mobile', label: 'Phone', hint: 'under 768px', icon: <Smartphone className="h-4 w-4" /> },
  { key: 'tablet', label: 'Tablet', hint: '768px and up', icon: <Tablet className="h-4 w-4" /> },
  { key: 'web', label: 'Desktop', hint: '1280px and up', icon: <Monitor className="h-4 w-4" /> },
  { key: 'webLarge', label: 'Large desktop', hint: '1920px and up', icon: <MonitorSpeaker className="h-4 w-4" /> },
];

function normalizeItem(item: any): BackgroundItem {
  return {
    id: String(item.id),
    name: String(item.name ?? ''),
    rarity: RARITIES.includes(item.rarity) ? item.rarity : 'common',
    priceFlies: Number(item.priceFlies ?? 0),
    images: {
      mobile: item.images?.mobile ?? '',
      tablet: item.images?.tablet ?? '',
      web: item.images?.web ?? '',
      webLarge: item.images?.webLarge ?? '',
    },
    hidden: !!item.hidden,
  };
}

const coverOf = (images: BackgroundImages) => images.web || images.tablet || images.mobile || images.webLarge;
const missingSizes = (images: BackgroundImages) => SIZE_FIELDS.filter((field) => !images[field.key]);

export function AdminBackgroundsManager() {
  const [items, setItems] = useState<BackgroundItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch('/api/admin/backgrounds', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setItems(Array.isArray(data.items) ? data.items.map(normalizeItem) : []))
      .catch(() => setError('Could not load backgrounds'))
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(
    () => ({
      all: items.length,
      shop: items.filter((item) => !item.hidden).length,
      hidden: items.filter((item) => item.hidden).length,
      fix: items.filter((item) => missingSizes(item.images).length > 0).length,
    }),
    [items],
  );

  const shown = items.filter((item) =>
    filter === 'shop'
      ? !item.hidden
      : filter === 'hidden'
        ? item.hidden
        : filter === 'fix'
          ? missingSizes(item.images).length > 0
          : true,
  );

  const open = items.find((item) => item.id === openId) ?? null;
  const replaceItem = (next: BackgroundItem) =>
    setItems((prev) => prev.map((item) => (item.id === next.id ? next : item)));

  return (
    <AdminPage
      title="Backgrounds"
      subtitle="Scenes players buy in the shop and set behind their frog."
      icon={<ImageIcon />}
      actions={
        <PondButton onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          New background
        </PondButton>
      }
    >
      {loading ? (
        <LoadingBlock rows={3} />
      ) : error ? (
        <Notice type="error">{error}</Notice>
      ) : (
        <div className="space-y-4">
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: `All ${counts.all}` },
              { value: 'shop', label: `In the shop ${counts.shop}` },
              { value: 'hidden', label: `Hidden ${counts.hidden}` },
              ...(counts.fix > 0 ? [{ value: 'fix' as Filter, label: `Missing sizes ${counts.fix}` }] : []),
            ]}
          />
          {shown.length === 0 ? (
            <EmptyState>Nothing here.</EmptyState>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((item) => (
                <BackgroundTile key={item.id} item={item} onOpen={() => setOpenId(item.id)} />
              ))}
            </div>
          )}
        </div>
      )}

      <BackgroundEditor
        item={open}
        onClose={() => setOpenId(null)}
        onSaved={replaceItem}
        onDeleted={(id) => {
          setItems((prev) => prev.filter((item) => item.id !== id));
          setOpenId(null);
        }}
      />
      <CreateBackgroundDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(item) => {
          setItems((prev) => [item, ...prev]);
          setCreating(false);
          setOpenId(item.id);
        }}
      />
    </AdminPage>
  );
}

function BackgroundTile({ item, onOpen }: { item: BackgroundItem; onOpen: () => void }) {
  const cover = coverOf(item.images);
  const missing = missingSizes(item.images);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group overflow-hidden rounded-[22px] border border-border bg-card text-left shadow-[0_3px_0_0_hsl(var(--border))] transition hover:-translate-y-0.5 hover:border-primary/40"
    >
      <div className="relative aspect-[16/10] bg-muted">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className={cn('h-full w-full object-cover', item.hidden && 'opacity-50 grayscale')} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[13px] font-black text-muted-foreground">
            No image yet
          </div>
        )}
        <span className="absolute left-2.5 top-2.5 flex gap-1.5">
          {item.hidden ? (
            <span className="rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-black text-white backdrop-blur">Hidden</span>
          ) : null}
          {missing.length > 0 && cover ? (
            <span className="rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-black text-amber-950">
              {missing.length === 1 ? `No ${missing[0].label.toLowerCase()} size` : `${missing.length} sizes missing`}
            </span>
          ) : null}
        </span>
      </div>
      <div className="flex items-center gap-2 px-3.5 py-3">
        <span className="min-w-0 flex-1 truncate text-[15px] font-black">{item.name || 'Untitled'}</span>
        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-black capitalize', RARITY_STYLE[item.rarity]?.chip)}>
          {item.rarity}
        </span>
        <span className="text-[13px] font-black tabular-nums text-muted-foreground">🪰 {item.priceFlies}</span>
      </div>
    </button>
  );
}

function RarityPicker({ value, onChange }: { value: Rarity; onChange: (next: Rarity) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {RARITIES.map((rarity) => (
        <button
          key={rarity}
          type="button"
          onClick={() => onChange(rarity)}
          className={cn(
            'rounded-full px-3 py-1.5 text-[12px] font-black capitalize transition',
            value === rarity ? RARITY_STYLE[rarity]?.chip : 'bg-muted/60 text-muted-foreground hover:text-foreground',
            value === rarity && 'shadow-[0_2px_0_0_rgba(0,0,0,0.12)]',
          )}
        >
          {rarity}
        </button>
      ))}
    </div>
  );
}

function BackgroundEditor({
  item,
  onClose,
  onSaved,
  onDeleted,
}: {
  item: BackgroundItem | null;
  onClose: () => void;
  onSaved: (item: BackgroundItem) => void;
  onDeleted: (id: string) => void;
}) {
  const [draft, setDraft] = useState<BackgroundItem | null>(item);
  const [saving, setSaving] = useState(false);
  const [busySize, setBusySize] = useState<SizeKey | 'all' | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showSizes, setShowSizes] = useState(false);

  useEffect(() => {
    setDraft(item);
    setMessage(null);
    setConfirmDelete(false);
    setShowSizes(false);
  }, [item?.id]);

  if (!item || !draft) return null;

  const dirty =
    draft.name !== item.name ||
    draft.rarity !== item.rarity ||
    draft.priceFlies !== item.priceFlies ||
    draft.hidden !== item.hidden;
  const cover = coverOf(item.images);
  const missing = missingSizes(item.images);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/backgrounds', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: draft.id,
          name: draft.name,
          rarity: draft.rarity,
          priceFlies: draft.priceFlies,
          hidden: draft.hidden,
          images: item.images,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      onSaved({ ...item, name: draft.name, rarity: draft.rarity, priceFlies: draft.priceFlies, hidden: draft.hidden });
      setMessage({ type: 'success', text: 'Saved' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const upload = async (size: SizeKey | 'all', file: File) => {
    setBusySize(size);
    setMessage(null);
    try {
      const form = new FormData();
      form.set('id', item.id);
      form.set('size', size);
      form.set('file', file);
      const res = await fetch('/api/admin/backgrounds/upload', { method: 'POST', credentials: 'include', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      const urls = (data.urls ?? { [size]: data.url }) as Partial<BackgroundImages>;
      onSaved({ ...item, images: { ...item.images, ...urls } });
      setMessage({ type: 'success', text: size === 'all' ? 'Image set for every screen size' : 'Image uploaded' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Upload failed' });
    } finally {
      setBusySize(null);
    }
  };

  const removeImage = async (size: SizeKey) => {
    setBusySize(size);
    try {
      const res = await fetch('/api/admin/backgrounds/upload', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, size }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Remove failed');
      onSaved({ ...item, images: { ...item.images, [size]: '' } });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Remove failed' });
    } finally {
      setBusySize(null);
    }
  };

  const remove = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/backgrounds', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Delete failed');
      onDeleted(item.id);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Delete failed' });
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto rounded-[28px] p-0">
        <div className="relative aspect-[16/7] bg-muted">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="h-full w-full object-cover" />
          ) : null}
          <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 via-transparent to-transparent p-4">
            <UploadButton
              busy={busySize === 'all'}
              disabled={busySize !== null}
              onPick={(file) => void upload('all', file)}
              label={cover ? 'Replace image' : 'Upload image'}
              tone="light"
            />
          </div>
        </div>
        <div className="space-y-5 p-5">
          <DialogHeader className="text-left">
            <DialogTitle className="text-[22px] font-black">{item.name || 'Untitled'}</DialogTitle>
            <DialogDescription className="text-[13px] font-medium">
              One wide image fills every screen size. A 5120px-wide picture stays sharp on large desktops.
            </DialogDescription>
          </DialogHeader>

          {message ? <Notice type={message.type}>{message.text}</Notice> : null}

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <Field label="Name">
              <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={inputClass} />
            </Field>
            <Field label="Price">
              <NumberInput value={draft.priceFlies} max={100000} suffix="flies" onChange={(priceFlies) => setDraft({ ...draft, priceFlies })} />
            </Field>
          </div>
          <Field label="Rarity">
            <RarityPicker value={draft.rarity} onChange={(rarity) => setDraft({ ...draft, rarity })} />
          </Field>
          <ToggleRow
            title={draft.hidden ? 'Hidden from the shop' : 'In the shop'}
            description="Hidden backgrounds stay with players who own them."
            checked={!draft.hidden}
            onChange={(on) => setDraft({ ...draft, hidden: !on })}
          />

          <div className="rounded-2xl bg-muted/40">
            <button
              type="button"
              onClick={() => setShowSizes((prev) => !prev)}
              className="flex w-full items-center gap-2 px-4 py-3 text-left"
            >
              <span className="flex-1 text-[13px] font-black">
                Each screen size
                <span className="ml-2 font-bold text-muted-foreground">
                  {missing.length === 0 ? 'all 4 set' : `${4 - missing.length} of 4 set`}
                </span>
              </span>
              <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition', showSizes && 'rotate-180')} />
            </button>
            {showSizes ? (
              <ul className="space-y-2 px-3 pb-3">
                {SIZE_FIELDS.map((field) => {
                  const url = item.images[field.key];
                  return (
                    <li key={field.key} className="flex items-center gap-3 rounded-xl bg-card px-3 py-2">
                      <span className="h-10 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                        {url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={url} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-[13px] font-black">
                          {field.icon}
                          {field.label}
                        </span>
                        <span className={cn('block text-[11px] font-bold', url ? 'text-muted-foreground' : 'text-amber-600')}>
                          {url ? field.hint : 'Missing'}
                        </span>
                      </span>
                      <UploadButton
                        busy={busySize === field.key}
                        disabled={busySize !== null}
                        onPick={(file) => void upload(field.key, file)}
                        label={url ? 'Replace' : 'Upload'}
                        small
                      />
                      {url ? (
                        <button
                          type="button"
                          disabled={busySize !== null}
                          onClick={() => void removeImage(field.key)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-red-500/10 hover:text-red-500 disabled:opacity-40"
                          aria-label={`Remove ${field.label} image`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <PondButton variant={confirmDelete ? 'danger' : 'ghost'} onClick={() => void remove()} disabled={saving}>
              <Trash2 className="h-4 w-4" />
              {confirmDelete ? 'Delete for good' : 'Delete'}
            </PondButton>
            <span className="flex-1" />
            <PondButton variant="secondary" onClick={onClose}>
              {dirty ? 'Cancel' : 'Done'}
            </PondButton>
            {dirty ? (
              <PondButton onClick={() => void save()} loading={saving}>
                Save
              </PondButton>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UploadButton({
  onPick,
  busy,
  disabled,
  label,
  small,
  tone,
}: {
  onPick: (file: File) => void;
  busy: boolean;
  disabled: boolean;
  label: string;
  small?: boolean;
  tone?: 'light';
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onPick(file);
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-xl font-black transition disabled:opacity-50',
          small ? 'h-8 px-3 text-[12px]' : 'h-10 px-4 text-[13px]',
          tone === 'light'
            ? 'bg-white/90 text-foreground shadow-[0_3px_0_0_rgba(0,0,0,0.25)] hover:bg-white'
            : 'border border-border bg-card shadow-[0_2px_0_0_hsl(var(--border))] hover:bg-muted/50',
        )}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {busy ? 'Uploading…' : label}
      </button>
    </>
  );
}

function CreateBackgroundDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (item: BackgroundItem) => void;
}) {
  const [name, setName] = useState('');
  const [rarity, setRarity] = useState<Rarity>('common');
  const [priceFlies, setPriceFlies] = useState(200);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setRarity('common');
    setPriceFlies(200);
    setError(null);
  }, [open]);

  const create = async () => {
    if (!name.trim()) {
      setError('Give it a name first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/backgrounds', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          rarity,
          priceFlies,
          images: { mobile: '', tablet: '', web: '', webLarge: '' },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Create failed');
      onCreated(normalizeItem(data.item));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md rounded-[28px]">
        <DialogHeader className="text-left">
          <DialogTitle className="text-[20px] font-black">New background</DialogTitle>
          <DialogDescription className="text-[13px] font-medium">You add the image on the next screen.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {error ? <Notice type="error">{error}</Notice> : null}
          <Field label="Name">
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void create();
              }}
              placeholder="Forest Glade"
              className={inputClass}
            />
          </Field>
          <Field label="Rarity">
            <RarityPicker value={rarity} onChange={setRarity} />
          </Field>
          <Field label="Price">
            <NumberInput value={priceFlies} max={100000} suffix="flies" onChange={setPriceFlies} />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <PondButton variant="secondary" onClick={onClose}>
              Cancel
            </PondButton>
            <PondButton onClick={() => void create()} loading={busy}>
              Create
            </PondButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
