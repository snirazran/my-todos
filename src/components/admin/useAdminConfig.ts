'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Options<T> = {
  url: string;
  read: (payload: any) => T | null | undefined;
  write?: (config: T) => unknown;
  method?: 'PUT' | 'POST' | 'PATCH';
};

export type AdminConfigHandle<T> = {
  config: T | null;
  saved: T | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  dirty: boolean;
  payload: any;
  set: (updater: (prev: T) => T) => void;
  patch: (next: Partial<T>) => void;
  save: () => Promise<boolean>;
  discard: () => void;
  reload: () => Promise<void>;
};

export function useAdminConfig<T>({ url, read, write, method = 'PUT' }: Options<T>): AdminConfigHandle<T> {
  const [config, setConfig] = useState<T | null>(null);
  const [saved, setSaved] = useState<T | null>(null);
  const [payload, setPayload] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readRef = useRef(read);
  readRef.current = read;
  const writeRef = useRef(write);
  writeRef.current = write;

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, { credentials: 'include' });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Could not load');
      const next = readRef.current(body) ?? null;
      setPayload(body);
      setConfig(next);
      setSaved(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load');
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const dirty = useMemo(
    () => config !== null && saved !== null && JSON.stringify(config) !== JSON.stringify(saved),
    [config, saved],
  );

  const set = useCallback((updater: (prev: T) => T) => {
    setConfig((prev) => (prev === null ? prev : updater(prev)));
  }, []);

  const patch = useCallback((next: Partial<T>) => {
    setConfig((prev) => (prev === null ? prev : { ...prev, ...next }));
  }, []);

  const save = useCallback(async () => {
    if (config === null) return false;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(writeRef.current ? writeRef.current(config) : config),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Could not save');
      const next = readRef.current(body) ?? config;
      setPayload((prev: any) => ({ ...(prev ?? {}), ...(body ?? {}) }));
      setConfig(next);
      setSaved(next);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
      return false;
    } finally {
      setSaving(false);
    }
  }, [config, method, url]);

  const discard = useCallback(() => setConfig(saved), [saved]);

  return { config, saved, loading, saving, error, dirty, payload, set, patch, save, discard, reload };
}

export function useSaveAll(handles: AdminConfigHandle<any>[]) {
  const dirty = handles.some((handle) => handle.dirty);
  const saving = handles.some((handle) => handle.saving);
  const error = handles.map((handle) => handle.error).find(Boolean) ?? null;
  const save = async () => {
    const results = await Promise.all(handles.filter((handle) => handle.dirty).map((handle) => handle.save()));
    return results.every(Boolean);
  };
  const discard = () => handles.forEach((handle) => handle.discard());
  return { dirty, saving, error, save, discard };
}
