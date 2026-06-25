'use client';

import { useEffect, type ReactNode } from 'react';
import {
  bindTaskSyncMessages,
  notifyTaskSync,
} from '@/lib/taskSyncClient';

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

export function TaskSyncProvider({ children }: { children: ReactNode }) {
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
      window.removeEventListener('focus', announceResume);
      window.removeEventListener('online', announceResume);
      window.removeEventListener('pageshow', announceResume);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return children;
}
