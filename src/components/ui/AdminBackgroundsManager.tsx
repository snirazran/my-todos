'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Image as ImageIcon,
  ChevronLeft,
  Plus,
  Save,
  Trash2,
  Eye,
  EyeOff,
  Smartphone,
  Tablet,
  Monitor,
  MonitorSpeaker,
  Upload,
  X,
  Loader2,
} from 'lucide-react';

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

const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

const RARITY_STYLE: Record<Rarity, string> = {
  common: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  uncommon: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  rare: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  epic: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  legendary: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
};

const SIZE_FIELDS: {
  key: SizeKey;
  label: string;
  hint: string;
  icon: React.ReactNode;
}[] = [
  { key: 'mobile', label: 'Mobile', hint: 'default (<768px)', icon: <Smartphone className="w-4 h-4" /> },
  { key: 'tablet', label: 'Tablet', hint: '≥768px', icon: <Tablet className="w-4 h-4" /> },
  { key: 'web', label: 'Web', hint: '≥1280px', icon: <Monitor className="w-4 h-4" /> },
  { key: 'webLarge', label: 'Web Large', hint: '≥1920px', icon: <MonitorSpeaker className="w-4 h-4" /> },
];

function emptyImages(): BackgroundImages {
  return { mobile: '', tablet: '', web: '', webLarge: '' };
}

export function AdminBackgroundsManager() {
  const router = useRouter();
  const [items, setItems] = useState<BackgroundItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [draft, setDraft] = useState<{ name: string; rarity: Rarity; priceFlies: number }>({
    name: '',
    rarity: 'common',
    priceFlies: 200,
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/backgrounds');
      const data = await res.json();
      if (Array.isArray(data.items)) {
        setItems(data.items.map(normalizeItem));
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to load backgrounds' });
    } finally {
      setLoading(false);
    }
  };

  function normalizeItem(item: any): BackgroundItem {
    return {
      id: String(item.id),
      name: String(item.name ?? ''),
      rarity: (item.rarity as Rarity) ?? 'common',
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

  const flash = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3500);
  };

  const updateLocal = (id: string, patch: Partial<BackgroundItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const setImageUrl = (id: string, key: SizeKey, value: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, images: { ...item.images, [key]: value } } : item,
      ),
    );
  };

  const save = async (item: BackgroundItem) => {
    setSavingId(item.id);
    try {
      const res = await fetch('/api/admin/backgrounds', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          name: item.name,
          rarity: item.rarity,
          priceFlies: item.priceFlies,
          images: item.images,
          hidden: item.hidden,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      flash('success', `Saved "${item.name}"`);
    } catch (err) {
      flash('error', err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingId(null);
    }
  };

  const remove = async (item: BackgroundItem) => {
    if (!confirm(`Delete "${item.name}"? This will also delete any uploaded images.`)) return;
    setSavingId(item.id);
    try {
      const res = await fetch('/api/admin/backgrounds', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      setItems((prev) => prev.filter((it) => it.id !== item.id));
      flash('success', 'Deleted');
    } catch (err) {
      flash('error', err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setSavingId(null);
    }
  };

  const create = async () => {
    if (!draft.name.trim()) {
      flash('error', 'Name is required');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/admin/backgrounds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name,
          rarity: draft.rarity,
          priceFlies: draft.priceFlies,
          images: emptyImages(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Create failed');
      setItems((prev) => [normalizeItem(data.item), ...prev]);
      setDraft({ name: '', rarity: 'common', priceFlies: 200 });
      flash('success', 'Created. Upload images below.');
    } catch (err) {
      flash('error', err instanceof Error ? err.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6 md:p-12">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="p-2 rounded-full bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </Link>
            <div className="p-3 rounded-2xl bg-primary/10 text-primary">
              <ImageIcon className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight">Backgrounds</h1>
              <p className="text-sm text-muted-foreground font-medium">
                Upload an image per screen size. Users buy and equip these in the shop.
              </p>
            </div>
          </div>
        </div>

        {message && (
          <div
            className={`rounded-xl px-4 py-3 text-sm font-bold ${
              message.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-red-500/10 text-red-600 dark:text-red-400'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Create new */}
        <div className="rounded-3xl border border-border bg-card shadow-sm p-5 md:p-6 space-y-4">
          <h2 className="text-lg font-black tracking-tight flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary" /> New Background
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Name
              </label>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Forest Glade"
                className="mt-1 w-full px-3 py-2 rounded-xl border border-border bg-background text-sm font-medium focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Rarity
              </label>
              <select
                value={draft.rarity}
                onChange={(e) => setDraft({ ...draft, rarity: e.target.value as Rarity })}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-border bg-background text-sm font-medium focus:outline-none focus:border-primary"
              >
                {RARITIES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Cost (flies)
              </label>
              <input
                type="number"
                min={0}
                value={draft.priceFlies}
                onChange={(e) =>
                  setDraft({ ...draft, priceFlies: Number(e.target.value) || 0 })
                }
                className="mt-1 w-full px-3 py-2 rounded-xl border border-border bg-background text-sm font-medium focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Create the background first, then upload an image for each screen size on its row.
          </p>

          <div className="flex justify-end">
            <button
              onClick={create}
              disabled={creating}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-black inline-flex items-center gap-2 disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create
            </button>
          </div>
        </div>

        {/* List */}
        <div className="space-y-4">
          <h2 className="text-lg font-black tracking-tight">
            All Backgrounds{' '}
            {items.length > 0 && (
              <span className="text-muted-foreground font-bold">({items.length})</span>
            )}
          </h2>

          {loading ? (
            <div className="rounded-3xl border border-border bg-card p-6 text-sm text-muted-foreground">
              Loading...
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
              No backgrounds yet. Create one above.
            </div>
          ) : (
            items.map((item) => (
              <BackgroundRow
                key={item.id}
                item={item}
                saving={savingId === item.id}
                onChange={(patch) => updateLocal(item.id, patch)}
                onImageUrl={(key, value) => setImageUrl(item.id, key, value)}
                onSave={() => save(item)}
                onDelete={() => remove(item)}
                onFlash={flash}
              />
            ))
          )}
        </div>

        <div className="pt-4 flex justify-center">
          <button
            onClick={() => router.push('/admin')}
            className="text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to Admin
          </button>
        </div>
      </div>
    </div>
  );
}

function BackgroundRow({
  item,
  saving,
  onChange,
  onImageUrl,
  onSave,
  onDelete,
  onFlash,
}: {
  item: BackgroundItem;
  saving: boolean;
  onChange: (patch: Partial<BackgroundItem>) => void;
  onImageUrl: (key: SizeKey, value: string) => void;
  onSave: () => void;
  onDelete: () => void;
  onFlash: (type: 'success' | 'error', text: string) => void;
}) {
  const preview =
    item.images.mobile || item.images.tablet || item.images.web || item.images.webLarge;
  return (
    <div className="rounded-3xl border border-border bg-card shadow-sm p-5 md:p-6 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-4">
        <div className="aspect-[4/3] rounded-2xl bg-muted overflow-hidden flex items-center justify-center text-xs text-muted-foreground">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt={item.name} className="w-full h-full object-cover" />
          ) : (
            <span className="opacity-60">No image</span>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 content-start">
          <div className="md:col-span-1">
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Name
            </label>
            <input
              value={item.name}
              onChange={(e) => onChange({ name: e.target.value })}
              className="mt-1 w-full px-3 py-2 rounded-xl border border-border bg-background text-sm font-medium focus:outline-none focus:border-primary"
            />
            <p className="mt-1 text-[10px] font-mono text-muted-foreground/70">{item.id}</p>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Rarity
            </label>
            <select
              value={item.rarity}
              onChange={(e) => onChange({ rarity: e.target.value as Rarity })}
              className={`mt-1 w-full px-3 py-2 rounded-xl border border-border bg-background text-sm font-bold focus:outline-none focus:border-primary ${RARITY_STYLE[item.rarity]}`}
            >
              {RARITIES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Cost (flies)
            </label>
            <input
              type="number"
              min={0}
              value={item.priceFlies}
              onChange={(e) => onChange({ priceFlies: Number(e.target.value) || 0 })}
              className="mt-1 w-full px-3 py-2 rounded-xl border border-border bg-background text-sm font-medium focus:outline-none focus:border-primary"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {SIZE_FIELDS.map((field) => (
          <ImageUploader
            key={field.key}
            backgroundId={item.id}
            sizeKey={field.key}
            label={field.label}
            hint={field.hint}
            icon={field.icon}
            value={item.images[field.key]}
            onChange={(value) => onImageUrl(field.key, value)}
            onFlash={onFlash}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <button
          onClick={() => onChange({ hidden: !item.hidden })}
          className={`px-3 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
            item.hidden
              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
              : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          }`}
        >
          {item.hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {item.hidden ? 'Hidden from shop' : 'Visible in shop'}
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={onDelete}
            disabled={saving}
            className="px-3 py-2 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-black inline-flex items-center gap-1.5 hover:bg-red-500/20 transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-black inline-flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ImageUploader({
  backgroundId,
  sizeKey,
  label,
  hint,
  icon,
  value,
  onChange,
  onFlash,
}: {
  backgroundId: string;
  sizeKey: SizeKey;
  label: string;
  hint: string;
  icon: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  onFlash: (type: 'success' | 'error', text: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  const triggerPick = () => inputRef.current?.click();

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.set('id', backgroundId);
      form.set('size', sizeKey);
      form.set('file', file);
      const res = await fetch('/api/admin/backgrounds/upload', {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      onChange(data.url);
      onFlash('success', `${label} image uploaded`);
    } catch (err) {
      onFlash('error', err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removeImage = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/backgrounds/upload', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: backgroundId, size: sizeKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Remove failed');
      onChange('');
      onFlash('success', `${label} image removed`);
    } catch (err) {
      onFlash('error', err instanceof Error ? err.message : 'Remove failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-background/40 p-3 space-y-2">
      <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        {icon}
        {label}
        <span className="text-[10px] font-medium text-muted-foreground/70 normal-case tracking-normal">
          ({hint})
        </span>
      </label>

      <div className="flex items-stretch gap-2">
        <div className="w-16 h-16 shrink-0 rounded-xl overflow-hidden bg-muted flex items-center justify-center text-[10px] text-muted-foreground">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="opacity-60">empty</span>
          )}
        </div>

        <div className="flex-1 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={triggerPick}
            disabled={uploading || busy}
            className="w-full h-9 rounded-xl bg-primary/10 text-primary text-xs font-black inline-flex items-center justify-center gap-1.5 hover:bg-primary/20 transition-colors disabled:opacity-60"
          >
            {uploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            {uploading ? 'Uploading…' : value ? 'Replace' : 'Upload image'}
          </button>

          {value && (
            <button
              type="button"
              onClick={removeImage}
              disabled={uploading || busy}
              className="w-full h-7 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 text-[11px] font-bold inline-flex items-center justify-center gap-1 hover:bg-red-500/20 transition-colors disabled:opacity-60"
            >
              <X className="w-3 h-3" /> Remove
            </button>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      <details className="text-[10px] text-muted-foreground/70">
        <summary className="cursor-pointer hover:text-muted-foreground">Use external URL instead</summary>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://example.com/image.png"
          className="mt-1 w-full px-2 py-1.5 rounded-lg border border-border bg-background text-[11px] font-mono focus:outline-none focus:border-primary"
        />
      </details>
    </div>
  );
}
