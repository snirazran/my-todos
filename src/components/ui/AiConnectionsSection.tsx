'use client';

import { useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';
import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';

type ApiTokenInfo = {
  id: string;
  prefix: string;
  name: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
};

type ConnectionInfo = {
  clientId: string;
  name: string;
  scopes: string[];
  connectedAt: string;
  lastUsedAt: string | null;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useAiConnections() {
  const { user } = useAuth();
  const { data } = useSWR<{ connections: ConnectionInfo[] }>(
    user ? '/api/tokens' : null,
    fetcher,
    { revalidateOnFocus: true },
  );
  return { aiConnections: data?.connections?.length ?? 0 };
}

function timeAgo(value?: string | null) {
  if (!value) return null;
  const diff = Date.now() - new Date(value).getTime();
  if (Number.isNaN(diff)) return null;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function useCopy() {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }, []);
  return { copied, copy };
}

function CopyField({ value, label }: { value: string; label: string }) {
  const { copied, copy } = useCopy();
  return (
    <div>
      <p className="mb-1 px-1 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <button
        type="button"
        onClick={() => void copy(value)}
        className="flex w-full items-center gap-2 rounded-xl border border-border/60 bg-background px-3 py-2.5 text-left transition-colors hover:bg-accent/40"
      >
        <code className="min-w-0 flex-1 truncate font-mono text-[11px] font-semibold text-foreground">
          {value}
        </code>
        {copied ? (
          <Check className="h-4 w-4 shrink-0 text-emerald-500" />
        ) : (
          <Copy className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>
    </div>
  );
}

function NewTokenPanel({
  token,
  serverUrl,
  onDone,
}: {
  token: string;
  serverUrl: string;
  onDone: () => void;
}) {
  return (
    <div className="space-y-3 border-t border-border/50 bg-emerald-500/5 px-4 py-4">
      <div>
        <p className="text-sm font-black tracking-tight text-foreground">
          Copy your key now
        </p>
        <p className="mt-0.5 text-[11px] font-semibold leading-snug text-muted-foreground">
          This is the only time it will be shown. Paste it into your assistant,
          then come back and tap Done.
        </p>
      </div>

      <CopyField label="Key" value={token} />
      <CopyField
        label="Config snippet"
        value={JSON.stringify({
          mcpServers: {
            frogress: {
              url: serverUrl,
              headers: { Authorization: `Bearer ${token}` },
            },
          },
        })}
      />

      <button
        type="button"
        onClick={onDone}
        className="w-full rounded-2xl bg-emerald-500 py-3 text-sm font-black text-white transition-colors hover:bg-emerald-600"
      >
        Done
      </button>
    </div>
  );
}

function TokenRow({
  token,
  onRevoked,
}: {
  token: ApiTokenInfo;
  onRevoked: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const revoke = useCallback(async () => {
    setBusy(true);
    try {
      await fetch(`/api/tokens?id=${encodeURIComponent(token.id)}`, {
        method: 'DELETE',
      });
      onRevoked();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }, [token.id, onRevoked]);

  const used = timeAgo(token.lastUsedAt);

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold leading-tight text-foreground">
          {token.name}
        </p>
        <p className="mt-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
          {token.prefix}··· · {used ? `used ${used}` : 'never used'}
        </p>
      </div>
      {confirming ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-lg px-2 py-1 text-[11px] font-bold text-muted-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void revoke()}
            className="flex items-center gap-1 rounded-lg bg-red-500 px-2.5 py-1 text-[11px] font-black text-white disabled:opacity-60"
          >
            {busy && <Loader2 className="h-3 w-3 animate-spin" />}
            Revoke
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`Revoke ${token.name}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function ConnectionRow({
  connection,
  onRevoked,
}: {
  connection: ConnectionInfo;
  onRevoked: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const disconnect = useCallback(async () => {
    setBusy(true);
    try {
      await fetch(
        `/api/tokens?clientId=${encodeURIComponent(connection.clientId)}`,
        { method: 'DELETE' },
      );
      onRevoked();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }, [connection.clientId, onRevoked]);

  const used = timeAgo(connection.lastUsedAt);

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
        <Check className="h-4 w-4 text-emerald-500" strokeWidth={3} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold leading-tight text-foreground">
          {connection.name}
        </p>
        <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">
          Connected · {used ? `active ${used}` : 'not used yet'}
        </p>
      </div>
      {confirming ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-lg px-2 py-1 text-[11px] font-bold text-muted-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void disconnect()}
            className="flex items-center gap-1 rounded-lg bg-red-500 px-2.5 py-1 text-[11px] font-black text-white disabled:opacity-60"
          >
            {busy && <Loader2 className="h-3 w-3 animate-spin" />}
            Disconnect
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Disconnect
        </button>
      )}
    </div>
  );
}

export default function AiConnectionsSection() {
  const { user } = useAuth();
  const { data, mutate, isLoading } = useSWR<{
    tokens: ApiTokenInfo[];
    connections: ConnectionInfo[];
  }>(user ? '/api/tokens' : null, fetcher, {
    // A connection lands while the user is away in Claude, so re-check on return.
    revalidateOnFocus: true,
  });

  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState('');
  const [claudeInstallUrl, setClaudeInstallUrl] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}/api/mcp`;
    setServerUrl(url);
    setClaudeInstallUrl(
      `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=${encodeURIComponent('Frogress')}&connectorUrl=${encodeURIComponent(url)}`,
    );
  }, []);

  const tokens = data?.tokens ?? [];
  const connections = data?.connections ?? [];

  const createToken = useCallback(async () => {
    setError(null);
    setCreating(true);
    try {
      const res = await fetch('/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'AI assistant' }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload?.error ?? 'Could not create a key. Try again.');
        return;
      }
      setNewToken(payload.token);
      await mutate();
    } finally {
      setCreating(false);
    }
  }, [mutate]);

  return (
    <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
      <div className="flex items-center gap-3 px-4 pb-3 pt-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-muted/60">
          <Sparkles className="h-5 w-5 text-emerald-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black leading-tight tracking-tight">
            AI assistants
          </p>
          <p className="mt-0.5 text-[11px] font-semibold leading-snug text-muted-foreground">
            Let Claude, ChatGPT, Dia or Cursor add and complete tasks for you
          </p>
        </div>
      </div>

      {connections.length > 0 && (
        <div className="divide-y divide-border/50 border-t border-border/50">
          {connections.map((connection) => (
            <ConnectionRow
              key={connection.clientId}
              connection={connection}
              onRevoked={() => void mutate()}
            />
          ))}
        </div>
      )}

      <div className="space-y-2 border-t border-border/50 px-4 py-4">
        <a
          href={claudeInstallUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-3 text-sm font-black text-white transition-colors hover:bg-emerald-600"
        >
          {connections.length > 0 ? 'Connect another' : 'Connect to Claude'}
          <ExternalLink className="h-4 w-4" />
        </a>

        <p className="px-1 pt-1 text-[11px] font-semibold leading-relaxed text-muted-foreground">
          You&apos;ll be asked to review and approve before anything connects.
          No key needed. Connections appear here once approved.
        </p>
      </div>

      <details className="group border-t border-border/50">
        <summary className="cursor-pointer list-none px-4 py-3 text-xs font-black tracking-tight text-foreground transition-colors hover:bg-accent/40">
          ChatGPT or another assistant?
        </summary>
        <div className="px-4 pb-4">
          <CopyField label="Server URL" value={serverUrl} />
          <p className="mt-2 px-1 text-[11px] font-semibold leading-relaxed text-muted-foreground">
            Paste this wherever your assistant asks for an MCP server. In
            ChatGPT, go to Settings &gt; Connectors &gt; Advanced and turn on
            Developer Mode first, then Create. It needs a paid ChatGPT plan.
          </p>
        </div>
      </details>

      <details className="group border-t border-border/50">
        <summary className="cursor-pointer list-none px-4 py-3 text-xs font-black tracking-tight text-foreground transition-colors hover:bg-accent/40">
          Using a config file? (Claude Desktop, Cursor)
        </summary>

        <div className="px-4 pb-4">
          <p className="mb-3 px-1 text-[11px] font-semibold leading-relaxed text-muted-foreground">
            Editors that read a JSON config need a key instead. Treat it like a
            password — anyone with it can read and change your tasks.
          </p>

          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : tokens.length > 0 ? (
            <div className="mb-3 divide-y divide-border/50 overflow-hidden rounded-xl border border-border/50">
              {tokens.map((token) => (
                <TokenRow
                  key={token.id}
                  token={token}
                  onRevoked={() => void mutate()}
                />
              ))}
            </div>
          ) : null}

          {newToken ? (
            <NewTokenPanel
              token={newToken}
              serverUrl={serverUrl}
              onDone={() => setNewToken(null)}
            />
          ) : (
            <>
              <button
                type="button"
                disabled={creating}
                onClick={() => void createToken()}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-border bg-card py-3 text-sm font-black text-foreground transition-colors hover:bg-accent/50 disabled:opacity-60"
              >
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                {tokens.length > 0 ? 'Create another key' : 'Create a key'}
              </button>
              {error && (
                <p className="mt-2 px-1 text-xs font-bold text-red-500">
                  {error}
                </p>
              )}
            </>
          )}
        </div>
      </details>
    </div>
  );
}
