'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { useAuth } from '@/components/auth/AuthContext';
import { INVENTORY_SUMMARY_KEY } from '@/hooks/useInventory';
import { todayTasksKey } from '@/hooks/useTaskData';
import { streakKey } from '@/hooks/useLoginStreak';
import { TASK_SYNC_EVENT } from '@/lib/taskSyncClient';
import { getWidgetPinState } from '@/lib/widget/bridge';
import { requestQuickAdd } from '@/lib/widget/quickAdd';
import {
  TASK_COMPLETED_EVENT,
  readCompletedEver,
  shouldAskForWidget,
} from '@/lib/widget/prompt';
import {
  buildPayload,
  clientTimezone,
  flushWidgetQueue,
  signOutWidget,
  syncWidget,
  todayKey,
} from '@/lib/widget/sync';
import type { WidgetPinState } from '@/lib/widget/types';
import { WidgetPromptSheet } from '@/components/ui/WidgetPromptSheet';

type TasksResponse = {
  tasks?: { id: string; text: string; completed: boolean }[];
};

type StreakResponse = {
  view?: { count?: number } | null;
};

const cacheFetcher = (url: string) =>
  fetch(url, { credentials: 'include' }).then((r) => r.json());

/**
 * Mirrors today's list into the home screen widget, and replays anything the
 * widget queued while the webview was closed.
 *
 * Everything here reads from SWR caches the app already fills — the widget
 * never causes a fetch of its own.
 */
export function WidgetSyncProvider() {
  const { user, loading } = useAuth();
  const native = Capacitor.isNativePlatform();
  const enabled = native && !loading && Boolean(user);

  const uid = user?.uid ?? '';
  const guest = user?.isAnonymous ?? false;

  const tasksKey = enabled ? todayTasksKey(todayKey(), clientTimezone()) : null;

  // revalidateOnMount:false — read whatever the app already fetched rather than
  // firing a request just to feed the widget. The tasks key keeps a real
  // fetcher so the task-sync listener below can refresh it on demand; the
  // streak key is a pure cache mirror, read only by the widget ask.
  const shared = { revalidateOnMount: false, revalidateOnFocus: false };
  const { data: tasksData, mutate: refreshTasks } = useSWR<TasksResponse>(
    tasksKey,
    cacheFetcher,
    shared,
  );
  const { data: streakData } = useSWR<StreakResponse>(
    enabled ? streakKey() : null,
    null,
    shared,
  );

  const [pinState, setPinState] = useState<WidgetPinState>('unsupported');
  const [promptOpen, setPromptOpen] = useState(false);
  const wasSignedIn = useRef(false);

  const streak = streakData?.view?.count ?? 0;

  // --- push state out ---------------------------------------------------
  useEffect(() => {
    if (!enabled || !tasksData?.tasks) return;
    void syncWidget(buildPayload({ uid, guest, tasks: tasksData.tasks }));
  }, [enabled, tasksData, uid, guest]);

  // --- sign-out wipes the widget ---------------------------------------
  useEffect(() => {
    if (!native) return;
    if (user) {
      wasSignedIn.current = true;
      return;
    }
    if (loading || !wasSignedIn.current) return;
    wasSignedIn.current = false;
    // Never leave the previous account's task titles on the home screen.
    void signOutWidget();
  }, [native, user, loading]);

  // --- replay the native queue -----------------------------------------
  const drain = useCallback(() => {
    if (!enabled || !uid) return;
    void flushWidgetQueue(uid).then(async (res) => {
      if (res.added > 0 || res.toggled > 0) {
        // Cheapest correct refresh: let SWR refetch the keys the app owns.
        const { mutate } = await import('swr');
        await mutate(
          (key) => typeof key === 'string' && key.startsWith('/api/tasks'),
        );
        void mutate(INVENTORY_SUMMARY_KEY);
      }
      // The widget's add button, honoured once today's list is current.
      if (res.quickAdd) requestQuickAdd();
    });
  }, [enabled, uid]);

  useEffect(() => {
    if (!enabled) return;
    drain();

    let handle: PluginListenerHandle | undefined;
    void App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) drain();
    }).then((h) => {
      handle = h;
    });

    return () => {
      void handle?.remove();
    };
  }, [enabled, drain]);

  // --- follow the app's own task-change broadcast ------------------------
  // Fires on every successful task mutation (add, tick, edit, delete) plus on
  // resume, so the widget never sits on a stale list.
  useEffect(() => {
    if (!enabled) return;
    const onTaskSync = () => {
      void refreshTasks();
    };
    window.addEventListener(TASK_SYNC_EVENT, onTaskSync);
    return () => window.removeEventListener(TASK_SYNC_EVENT, onTaskSync);
  }, [enabled, refreshTasks]);

  // --- the ask ----------------------------------------------------------
  useEffect(() => {
    if (!enabled) return;
    void getWidgetPinState().then(setPinState);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const consider = () => {
      if (
        shouldAskForWidget({
          pinState,
          completedEver: readCompletedEver(),
          streak,
        })
      ) {
        setPromptOpen(true);
      }
    };
    consider();
    window.addEventListener(TASK_COMPLETED_EVENT, consider);
    return () => window.removeEventListener(TASK_COMPLETED_EVENT, consider);
  }, [enabled, pinState, streak]);

  if (!native) return null;

  return (
    <WidgetPromptSheet
      open={promptOpen}
      onOpenChange={setPromptOpen}
      streak={streak}
      onPinned={() => setPinState('pinned')}
    />
  );
}
