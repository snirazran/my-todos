'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle,
  Download,
  Gift,
  Bug,
  RotateCcw,
  Save,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import Frog from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import { GiftRive } from '@/components/ui/gift-box/GiftBox';
import { cn } from '@/lib/utils';
import type { ManagedRiveAssetId } from '@/lib/riveAssets';

type RiveBackup = {
  name: string;
  size: number;
  updatedAt: string;
  url: string;
};

type RiveAssetView = {
  id: ManagedRiveAssetId;
  label: string;
  description: string;
  fileName: string;
  publicPath: string;
  size: number;
  updatedAt: string | null;
  backups: RiveBackup[];
};

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(value: string | null) {
  if (!value) return 'Missing';
  return new Date(value).toLocaleString();
}

export function AdminRiveManagerPopup({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [assets, setAssets] = useState<RiveAssetView[]>([]);
  const [selectedId, setSelectedId] = useState<ManagedRiveAssetId>('frog');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    loadAssets();
  }, [open]);

  const selected = useMemo(
    () => assets.find((asset) => asset.id === selectedId) ?? assets[0] ?? null,
    [assets, selectedId],
  );

  const loadAssets = async () => {
    try {
      const res = await fetch('/api/admin/rive-assets', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) {
        setResult({ type: 'error', message: data.error || 'Could not load Rive assets' });
        return;
      }
      setAssets(data.assets ?? []);
      if (data.assets?.length && !data.assets.some((asset: RiveAssetView) => asset.id === selectedId)) {
        setSelectedId(data.assets[0].id);
      }
    } catch {
      setResult({ type: 'error', message: 'Network error' });
    }
  };

  const postAction = async (assetId: string, action: string, extra?: Record<string, string | Blob>) => {
    setLoading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.set('assetId', assetId);
      formData.set('action', action);
      Object.entries(extra ?? {}).forEach(([key, value]) => {
        formData.set(key, value);
      });

      const res = await fetch('/api/admin/rive-assets', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ type: 'error', message: data.error || 'Action failed' });
        return;
      }

      setResult({
        type: 'success',
        message:
          action === 'upload'
            ? 'Uploaded. Refresh open pages to load the new Rive file.'
            : action === 'restore'
              ? 'Restored backup. Refresh open pages to load it.'
              : 'Backup created.',
      });
      setConfirmRestore(null);
      await loadAssets();
    } catch {
      setResult({ type: 'error', message: 'Network error' });
    } finally {
      setLoading(false);
    }
  };

  const uploadFile = async (file: File | null) => {
    if (!selected || !file) return;
    if (!file.name.toLowerCase().endsWith('.riv')) {
      setResult({ type: 'error', message: 'Please choose a .riv file.' });
      return;
    }
    await postAction(selected.id, 'upload', { file });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (!open) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="rive-manager-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[1100] bg-black/60 backdrop-blur-md"
      />
      <div key="rive-manager-dialog" className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-2xl"
        >
          <div className="shrink-0 border-b border-border/40 bg-gradient-to-br from-sky-500/10 to-emerald-500/10 px-6 py-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400">
                  <Upload className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-black tracking-tight text-foreground">
                    Rive Manager
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Upload frog, fly, and gift .riv files with automatic backups
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
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {assets.map((asset) => {
                  const active = selected?.id === asset.id;
                  return (
                    <button
                      key={asset.id}
                      onClick={() => {
                        setSelectedId(asset.id);
                        setConfirmRestore(null);
                      }}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-all',
                        active
                          ? 'border-primary/30 bg-primary/10 ring-1 ring-primary/20'
                          : 'border-border/50 bg-muted/20 hover:bg-muted/40',
                      )}
                    >
                      <AssetIcon id={asset.id} />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-foreground">
                          {asset.label}
                        </div>
                        <div className="truncate text-[10px] font-bold text-muted-foreground">
                          {asset.fileName}
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

              {!selected ? (
                <div className="rounded-3xl border border-dashed border-border p-8 text-center text-sm font-bold text-muted-foreground">
                  No managed Rive assets found.
                </div>
              ) : (
                <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
                  <div className="space-y-3">
                    <div className="rounded-3xl border border-border/50 bg-card p-4">
                      <div className="mx-auto h-44 w-44 rounded-2xl bg-muted/30">
                        <AssetPreview id={selected.id} />
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border/50 bg-card p-3 text-xs">
                      <div className="font-black text-foreground">{selected.fileName}</div>
                      <div className="mt-1 text-muted-foreground">{selected.description}</div>
                      <div className="mt-3 grid gap-1 text-[11px] font-bold text-muted-foreground">
                        <span>Size: {formatBytes(selected.size)}</span>
                        <span>Updated: {formatDate(selected.updatedAt)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div className="rounded-3xl border border-border/50 bg-card p-4">
                      <h3 className="text-sm font-black text-foreground">
                        Replace File
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Uploading creates a backup of the current file first.
                      </p>
                      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".riv"
                          onChange={(event) => uploadFile(event.target.files?.[0] ?? null)}
                          className="min-w-0 flex-1 rounded-2xl border border-border bg-background px-3 py-2 text-sm"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          disabled={loading}
                          onClick={() => postAction(selected.id, 'backup')}
                          className="gap-2"
                        >
                          <Save className="h-4 w-4" />
                          Backup Current
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-border/50 bg-card p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-black text-foreground">
                            Backups
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            Restore creates a backup of the current file first.
                          </p>
                        </div>
                        <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-black text-muted-foreground">
                          {selected.backups.length}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {selected.backups.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-border p-5 text-center text-xs font-bold text-muted-foreground">
                            No backups yet.
                          </div>
                        ) : (
                          selected.backups.map((backup) => {
                            const confirming = confirmRestore === backup.name;
                            return (
                              <div
                                key={backup.name}
                                className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-2xl border border-border/50 bg-background p-3"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-black text-foreground">
                                    {backup.name}
                                  </p>
                                  <p className="text-[10px] font-bold text-muted-foreground">
                                    {formatBytes(backup.size)} · {formatDate(backup.updatedAt)}
                                  </p>
                                </div>
                                <a
                                  href={backup.url}
                                  download
                                  className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
                                  title="Download backup"
                                >
                                  <Download className="h-4 w-4" />
                                </a>
                                <Button
                                  size="sm"
                                  variant={confirming ? 'default' : 'outline'}
                                  disabled={loading}
                                  onClick={() => {
                                    if (!confirming) {
                                      setConfirmRestore(backup.name);
                                      return;
                                    }
                                    postAction(selected.id, 'restore', { backup: backup.name });
                                  }}
                                  className={cn('gap-2', confirming && 'bg-amber-500 text-white hover:bg-amber-600')}
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                  {confirming ? 'Confirm' : 'Restore'}
                                </Button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
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

function AssetIcon({ id }: { id: ManagedRiveAssetId }) {
  if (id === 'frog') {
    return (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <span className="text-lg font-black">F</span>
      </div>
    );
  }
  if (id === 'fly') {
    return (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
        <Bug className="h-5 w-5" />
      </div>
    );
  }
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
      <Gift className="h-5 w-5" />
    </div>
  );
}

function AssetPreview({ id }: { id: ManagedRiveAssetId }) {
  if (id === 'frog') {
    return (
      <div className="flex h-full w-full items-center justify-center overflow-hidden">
        <Frog className="h-[135%] w-[135%] object-contain translate-y-[10%]" />
      </div>
    );
  }
  if (id === 'fly') {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Fly size={110} />
      </div>
    );
  }
  return (
    <div className="h-full w-full">
      <GiftRive color={0} />
    </div>
  );
}
