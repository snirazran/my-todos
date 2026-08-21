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
import { MAX_HUNGER_MS } from '@/lib/hungerLogic';
import { getWidgetPinState } from '@/lib/widget/bridge';
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

type SummaryResponse = {
  wardrobe?: { hunger?: number; lastHungerUpdate?: string | Date };
};

type StreakResponse = { view?: { count?: number } | null };

function fullnessFrom(wardrobe: SummaryResponse['wardrobe']): number | null {
  if (
    !wardrobe ||
    typeof wardrobe.hunger !== 'number' ||
    Number.isNaN(wardrobe.hunger) ||
    !wardrobe.lastHungerUpdate
  ) {
    return null;
  }
  const last = new Date(wardrobe.lastHungerUpdate).getTime();
  if (Number.isNaN(last)) return null;
  const remaining = wardrobe.hunger - (Date.now() - last);
  return Math.max(0, Math.min(1, remaining / MAX_HUNGER_MS));
}

/**
 * Mirrors today's list, the frog's mood and the streak into the home screen
 * widget, and replays anything the widget queued while the webview was closed.
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

  // revalidateOnMount:false — mirror whatever the app already fetched, never
  // trigger a request just to feed the widget.
  const shared = { revalidateOnMount: false, revalidateOnFocus: false };
  const { data: tasksData } = useSWR<TasksResponse>(tasksKey, null, shared);
  const { data: summary } = useSWR<SummaryResponse>(
    enabled ? INVENTORY_SUMMARY_KEY : null,
    null,
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
    void syncWidget(
      buildPayload({
        uid,
        guest,
        tasks: tasksData.tasks,
        fullness: fullnessFrom(summary?.wardrobe),
        streak,
      }),
    );
  }, [enabled, tasksData, summary, streak, uid, guest]);

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
    void flushWidgetQueue(uid).then((res) => {
      if (res.added > 0 || res.toggled > 0) {
        // Cheapest correct refresh: let SWR refetch the keys the app owns.
        void import('swr').then(({ mutate }) => {
          void mutate(
            (key) => typeof key === 'string' && key.startsWith('/api/tasks'),
          );
          void mutate(INVENTORY_SUMMARY_KEY);
        });
      }
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
