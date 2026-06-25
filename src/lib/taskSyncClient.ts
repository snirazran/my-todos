'use client';

export const TASK_SYNC_EVENT = 'task-sync';
const CHANNEL_NAME = 'frogress-task-sync';
const SOURCE_KEY = 'frogress.taskSyncSource';
const fallbackSourceId =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

export type TaskSyncReason =
  | 'local-mutation'
  | 'remote-message'
  | 'resume'
  | 'service-worker';

export type TaskSyncDetail = {
  reason: TaskSyncReason;
  changedAt?: string;
};

function sourceId() {
  try {
    let id = sessionStorage.getItem(SOURCE_KEY);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;
      sessionStorage.setItem(SOURCE_KEY, id);
    }
    return id;
  } catch {
    return fallbackSourceId;
  }
}

function dispatch(detail: TaskSyncDetail) {
  window.dispatchEvent(new CustomEvent<TaskSyncDetail>(TASK_SYNC_EVENT, { detail }));
  window.dispatchEvent(new Event('board-refresh'));
}

export function notifyTaskSync(
  detail: TaskSyncDetail,
  options: { broadcast?: boolean } = {},
) {
  if (typeof window === 'undefined') return;
  const payload = { ...detail, changedAt: detail.changedAt ?? new Date().toISOString() };
  dispatch(payload);
  if (!options.broadcast) return;

  try {
    const message = { ...payload, sourceId: sourceId() };
    if ('BroadcastChannel' in window) {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage(message);
      channel.close();
      return;
    }
    localStorage.setItem(CHANNEL_NAME, JSON.stringify(message));
    localStorage.removeItem(CHANNEL_NAME);
  } catch {
    /* best-effort sync only */
  }
}

export function bindTaskSyncMessages(onSync?: (detail: TaskSyncDetail) => void) {
  if (typeof window === 'undefined') return () => {};
  const selfId = sourceId();
  let channel: BroadcastChannel | null = null;

  const receive = (raw: unknown) => {
    const data = raw as (TaskSyncDetail & { sourceId?: string }) | null;
    if (!data || data.sourceId === selfId) return;
    const detail: TaskSyncDetail = {
      reason: data.reason ?? 'local-mutation',
      changedAt: data.changedAt,
    };
    dispatch(detail);
    onSync?.(detail);
  };

  if ('BroadcastChannel' in window) {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event) => receive(event.data);
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== CHANNEL_NAME || !event.newValue) return;
    try {
      receive(JSON.parse(event.newValue));
    } catch {
      /* ignore malformed messages */
    }
  };
  window.addEventListener('storage', onStorage);

  const onServiceWorkerMessage = (event: MessageEvent) => {
    const data = event.data as { type?: string; changedAt?: string } | undefined;
    if (data?.type !== 'task_sync') return;
    const detail: TaskSyncDetail = {
      reason: 'service-worker',
      changedAt: data.changedAt,
    };
    dispatch(detail);
    onSync?.(detail);
  };
  navigator.serviceWorker?.addEventListener('message', onServiceWorkerMessage);

  return () => {
    channel?.close();
    window.removeEventListener('storage', onStorage);
    navigator.serviceWorker?.removeEventListener('message', onServiceWorkerMessage);
  };
}
