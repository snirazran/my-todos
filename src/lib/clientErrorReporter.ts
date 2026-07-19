'use client';

const STORAGE_KEY = 'frogress.diag';
const MAX_REPORTS = 10;
const HEARTBEAT_MS = 15_000;

type DiagState = {
  bootPending?: { t: number; url: string };
  lastBeat?: number;
  visible?: boolean;
  endedClean?: boolean;
};

let installed = false;
let reportsSent = 0;
const seen = new Set<string>();

function readState(): DiagState {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function writeState(state: DiagState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

function send(type: string, data: Record<string, unknown>) {
  if (reportsSent >= MAX_REPORTS) return;
  const key = `${type}:${data.message ?? data.src ?? ''}`;
  if (seen.has(key)) return;
  seen.add(key);
  reportsSent += 1;

  const platform = (
    window as typeof window & {
      Capacitor?: { getPlatform?: () => string };
    }
  ).Capacitor?.getPlatform?.();

  void fetch('/api/client-log', {
    method: 'POST',
    credentials: 'include',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type,
      ...data,
      url: window.location.href,
      ua: navigator.userAgent,
      platform,
      t: Date.now(),
    }),
  }).catch(() => {});
}

export function installClientErrorReporter() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const prev = readState();
  if (prev.bootPending) {
    send('boot_failed', {
      startedAt: prev.bootPending.t,
      startUrl: prev.bootPending.url,
    });
  } else if (prev.lastBeat && prev.visible && !prev.endedClean) {
    send('abnormal_end', {
      lastBeat: prev.lastBeat,
      gapMs: Date.now() - prev.lastBeat,
    });
  }

  const state: DiagState = {
    bootPending: { t: Date.now(), url: window.location.pathname },
  };
  writeState(state);

  const heartbeat = () => {
    state.lastBeat = Date.now();
    state.visible = document.visibilityState === 'visible';
    state.endedClean = false;
    writeState(state);
  };

  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      delete state.bootPending;
      heartbeat();
    }),
  );

  window.setInterval(heartbeat, HEARTBEAT_MS);
  document.addEventListener('visibilitychange', heartbeat);
  window.addEventListener('pagehide', () => {
    state.lastBeat = Date.now();
    state.endedClean = true;
    writeState(state);
  });

  window.addEventListener(
    'error',
    (event) => {
      if (event.target && event.target !== window) {
        const el = event.target as HTMLElement & { src?: string; href?: string };
        const src = el.src || el.href;
        if (src) send('resource_error', { tag: el.tagName, src });
        return;
      }
      send('error', {
        message: event.message,
        source: event.filename,
        line: event.lineno,
        col: event.colno,
        stack:
          event.error instanceof Error
            ? event.error.stack?.slice(0, 4000)
            : undefined,
      });
    },
    true,
  );

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    send('unhandledrejection', {
      message:
        reason instanceof Error
          ? reason.message
          : String(reason).slice(0, 500),
      stack: reason instanceof Error ? reason.stack?.slice(0, 4000) : undefined,
    });
  });
}
