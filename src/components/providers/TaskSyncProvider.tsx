'use client';

import { useEffect, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import {
  TASK_SYNC_EVENT,
  bindTaskSyncMessages,
  notifyTaskSync,
  type TaskSyncDetail,
  type TaskSyncEventKind,
} from '@/lib/taskSyncClient';
import { mutateBackgrounds } from '@/hooks/useBackgrounds';
import { mutateInventoryCaches } from '@/hooks/useInventory';
import { mutateFriendsCaches } from '@/hooks/useFriendsSync';

const NATIVE_SYNC_INTERVAL_MS = 10_000;
const TASK_EVENT_LAST_ID_KEY = 'frogress.taskSyncLastEventId';

function isTaskMutation(input: RequestInfo | URL, init?: RequestInit) {
  const method =
    init?.method ??
    (typeof Request !== 'undefined' && input instanceof Request
      ? input.method
      : 'GET');
  if (method.toUpperCase() === 'GET') return false;

  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin && parsed.pathname.startsWith('/api/tasks');
  } catch {
    return false;
  }
}

function isTaskSyncEventKind(value: unknown): value is TaskSyncEventKind {
  return (
    value === 'tasks-changed' ||
    value === 'task-completed' ||
    value === 'task-uncompleted' ||
    value === 'background-equipped' ||
    value === 'wardrobe-equipped' ||
    value === 'friend-updated'
  );
}

function readLastEventId() {
  try {
    return localStorage.getItem(TASK_EVENT_LAST_ID_KEY);
  } catch {
    return null;
  }
}

function writeLastEventId(eventId: string) {
  try {
    localStorage.setItem(TASK_EVENT_LAST_ID_KEY, eventId);
  } catch {
    /* best-effort replay cursor */
  }
}

function taskDetailFromStream(data: unknown): TaskSyncDetail | null {
  const event = data as Partial<TaskSyncDetail> | null;
  if (!event || !isTaskSyncEventKind(event.eventKind)) return null;
  if (typeof event.eventId === 'string') writeLastEventId(event.eventId);

  return {
    reason: 'stream',
    eventId: typeof event.eventId === 'string' ? event.eventId : undefined,
    changedAt:
      typeof event.changedAt === 'string' ? event.changedAt : undefined,
    eventKind: event.eventKind,
    taskId: typeof event.taskId === 'string' ? event.taskId : undefined,
    completed:
      typeof event.completed === 'boolean' ? event.completed : undefined,
    date: typeof event.date === 'string' ? event.date : undefined,
    backgroundId:
      typeof event.backgroundId === 'string' ? event.backgroundId : undefined,
    slot: typeof event.slot === 'string' ? event.slot : undefined,
    itemId:
      typeof event.itemId === 'string' || event.itemId === null
        ? event.itemId
        : undefined,
    replayed: event.replayed === true,
  };
}

function applySyncSideEffects(detail: TaskSyncDetail) {
  if (detail.eventKind === 'friend-updated') {
    mutateFriendsCaches();
    return;
  }
  if (detail.eventKind === 'background-equipped') {
    mutateBackgrounds();
    mutateInventoryCaches();
    return;
  }
  if (detail.eventKind === 'wardrobe-equipped') {
    mutateInventoryCaches();
  }
}

export function TaskSyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input, init) => {
      const shouldAnnounce = isTaskMutation(input, init);
      const response = await originalFetch(input, init);
      if (shouldAnnounce && response.ok) {
        notifyTaskSync({ reason: 'local-mutation' }, { broadcast: true });
      }
      return response;
    };

    const unbindMessages = bindTaskSyncMessages();
    const onTaskSync = (event: Event) => {
      applySyncSideEffects((event as CustomEvent<TaskSyncDetail>).detail);
    };
    window.addEventListener(TASK_SYNC_EVENT, onTaskSync);

    const announceResume = () => {
      notifyTaskSync({ reason: 'resume' });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') announceResume();
    };

    window.addEventListener('focus', announceResume);
    window.addEventListener('online', announceResume);
    window.addEventListener('pageshow', announceResume);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.fetch = originalFetch;
      unbindMessages();
      window.removeEventListener(TASK_SYNC_EVENT, onTaskSync);
      window.removeEventListener('focus', announceResume);
      window.removeEventListener('online', announceResume);
      window.removeEventListener('pageshow', announceResume);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let es: EventSource | null = null;

    const connect = () => {
      if (cancelled || es) return;
      try {
        const since = readLastEventId();
        const query = since ? `?since=${encodeURIComponent(since)}` : '';
        const source = new EventSource(`/api/tasks/events${query}`, {
          withCredentials: true,
        });
        source.addEventListener('task-sync', (event) => {
          try {
            const detail = taskDetailFromStream(JSON.parse(event.data));
            if (detail) notifyTaskSync(detail);
          } catch {
            /* ignore malformed stream events */
          }
        });
        source.onerror = () => {
          if (source.readyState === EventSource.CLOSED && es === source) {
            es = null;
          }
        };
        es = source;
      } catch {
        es = null;
      }
    };

    const reconnect = () => {
      if (es) {
        es.close();
        es = null;
      }
      connect();
    };

    connect();
    const reconnectPoll = window.setInterval(() => {
      if (!es) connect();
    }, 30000);

    const onVisible = () => {
      if (document.visibilityState === 'visible') reconnect();
    };
    const onOnline = () => reconnect();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);

    return () => {
      cancelled = true;
      window.clearInterval(reconnectPoll);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      es?.close();
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (!Capacitor.isNativePlatform()) return;
    if (pathname !== '/' && pathname !== '/planner') return;

    const poll = () => {
      if (document.visibilityState !== 'visible') return;
      notifyTaskSync({ reason: 'native-poll' });
    };
    const intervalId = window.setInterval(poll, NATIVE_SYNC_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [pathname, user]);

  return children;
}
