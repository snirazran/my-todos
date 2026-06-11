'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { format } from 'date-fns';
import {
  Calendar,
  LayoutDashboard,
  CalendarCheck,
  CalendarClock,
  EllipsisVertical,
  Plus,
  Sparkles,
  ChevronRight,
  Filter,
} from 'lucide-react';
import BacklogTray from '@/components/board/BacklogTray';
//fix
import { useAuth } from '@/components/auth/AuthContext';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { useUIStore } from '@/lib/uiStore';
import { useSheetStore } from '@/lib/sheetStore';
import { type FrogHandle } from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import TaskList from '@/components/ui/TaskList';
import QuickAddSheet from '@/components/ui/QuickAddSheet';
import FrogodoroSheet from '@/components/ui/FrogodoroSheet';
import FrogodoroPill from '@/components/ui/FrogodoroPill';
import { FilterDropdown } from '@/components/ui/FilterDropdown';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { useBackgrounds } from '@/hooks/useBackgrounds';
import { FrogDisplay } from '@/components/ui/FrogDisplay';
import { PageBackground } from '@/components/ui/PageBackground';
import { getQuestsUrl } from '@/components/ui/QuestsPanel';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { HungerWarningModal } from '@/components/ui/HungerWarningModal';
import {
  MissedTasksPopup,
  type MissedTasksStatus,
} from '@/components/ui/MissedTasksPopup';
import { useFrogTongue, TONGUE_STROKE } from '@/hooks/useFrogTongue';
import { useNotification } from '@/components/providers/NotificationProvider';
import useSWR, { mutate as swrMutate } from 'swr';
import { cn } from '@/lib/utils';
import {
  useTaskData,
  Task,
  FlyStatus,
  HungerStatus,
} from '@/hooks/useTaskData';
import { useFrogodoroStore } from '@/lib/frogodoroStore';
import { QuestOnboardingPopup } from '@/components/ui/QuestOnboardingPopup';
import WeeklyWrapped from '@/components/ui/WeeklyWrapped';
import type { WeeklyRecapData } from '@/app/api/weekly-recap/route';
import type {
  FocusCategoryTagMap,
  MacroCategoryDefinition,
  MacroCategoryId,
} from '@/lib/quests/types';

// Force re-compilation of this file to pick up useTaskData.tsx change

const FLY_PX = 40;
type HomeTab = 'all' | 'today';

const demoTasks: Task[] = [
  {
    id: 'g6',
    text: 'Check there is no monster under the bed',
    completed: false,
    order: 1,
  },
  { id: 'g1', text: 'Meditation', completed: true, order: 2 },
  { id: 'g2', text: 'Read a book', completed: true, order: 3 },
  { id: 'g3', text: 'Walk 5,000 steps', completed: true, order: 4 },
  { id: 'g4', text: 'Drink 2 liters of water', completed: true, order: 5 },
  { id: 'g5', text: 'Eat a healthy meal', completed: true, order: 6 },
];

export default function Home() {
  const { user, loading } = useAuth();
  const sessionLoading = loading;
  const router = useRouter();
  const {
    isQuestOnboardingOpen,
    closeQuestOnboarding,
    isWardrobeOpen,
    setWardrobeOpen,
    setIsCinematicActive,
    isDebugMode,
  } = useUIStore();

  // -- NEW STATE HOOK --
  const {
    tasks,
    backlogTasks,
    isLoading,
    flyStatus,
    hungerStatus,
    weeklyIds,
    toggleTask,
    moveTaskToBacklog,
    moveTaskToToday,
    deleteTask,
    deleteBacklogTask,
    deleteTaskSeries,
    reorderTasks,
    editTask,
    scheduleTask,
    mutateToday,
    mutateBacklog,
    pendingToBacklog,
    pendingToToday,
    toggleRepeat,
    updateTaskDetails,
    setTaskRepeat,
    updateTaskTags,
    duplicateTask,
    tags,
  } = useTaskData();

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [dismissMissedReview, setDismissMissedReview] = useState(false);
  const { data: missedTasksData, mutate: mutateMissedTasks } =
    useSWR<MissedTasksStatus>(
      user
        ? `/api/missed-tasks?timezone=${encodeURIComponent(timezone)}`
        : null,
      (url: string) => fetch(url).then((res) => res.json()),
      { revalidateOnFocus: false },
    );
  const debugMockTags = [
    { id: 'debug-tag-work', name: 'Work', color: '#3b82f6' },
    { id: 'debug-tag-health', name: 'Health', color: '#22c55e' },
    { id: 'debug-tag-personal', name: 'Personal', color: '#f59e0b' },
  ];
  const debugYesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  })();
  const debugMissedTasksData: MissedTasksStatus | undefined = isDebugMode
    ? {
        today: new Date().toISOString().split('T')[0],
        yesterday: debugYesterday,
        reviewedToday: false,
        isPremium: false,
        flyBalance: 12,
        completionCost: 1,
        items: [
          {
            id: 'debug-1',
            text: 'Finish project report',
            completed: false,
            date: debugYesterday,
            type: 'regular' as const,
            tags: ['debug-tag-work'],
          },
          {
            id: 'debug-2',
            text: 'Review pull requests',
            completed: false,
            date: debugYesterday,
            type: 'weekly' as const,
            tags: ['debug-tag-work', 'debug-tag-personal'],
          },
          {
            id: 'debug-5',
            text: 'Go grocery shopping',
            completed: false,
            date: debugYesterday,
            type: 'regular' as const,
          },
        ],
      }
    : undefined;
  const activeMissedTasksData = isDebugMode
    ? debugMissedTasksData
    : missedTasksData;
  const shouldShowMissedReview = isDebugMode
    ? !dismissMissedReview
    : !!user &&
      !!activeMissedTasksData &&
      !dismissMissedReview &&
      !activeMissedTasksData.reviewedToday &&
      (activeMissedTasksData.items?.length ?? 0) > 0;

  // Weekly Recap
  const [dismissRecap, setDismissRecap] = useState(false);
  const { data: recapData } = useSWR<WeeklyRecapData>(
    user ? `/api/weekly-recap?timezone=${encodeURIComponent(timezone)}` : null,
    (url: string) => fetch(url).then((res) => res.json()),
    { revalidateOnFocus: false },
  );
  const debugRecapData: WeeklyRecapData | undefined = isDebugMode
    ? (() => {
        const d = (offset: number) => {
          const dt = new Date();
          dt.setDate(dt.getDate() + offset);
          return dt.toISOString().split('T')[0];
        };
        return {
          weekStart: d(-7),
          weekEnd: d(-1),
          isPremium: true,
          tasksAdded: 18,
          tasksCompleted: 14,
          completionRate: 78,
          activeDays: 6,
          bestDay: {
            date: d(-4),
            dayName: 'Wed',
            tasksTotal: 5,
            tasksCompleted: 5,
            focusMinutes: 45,
          },
          totalFocusMinutes: 185,
          fliesEarned: 14,
          currentStreak: 4,
          days: [
            {
              date: d(-7),
              dayName: 'Mon',
              tasksTotal: 3,
              tasksCompleted: 2,
              focusMinutes: 25,
            },
            {
              date: d(-6),
              dayName: 'Tue',
              tasksTotal: 4,
              tasksCompleted: 3,
              focusMinutes: 30,
            },
            {
              date: d(-5),
              dayName: 'Wed',
              tasksTotal: 5,
              tasksCompleted: 5,
              focusMinutes: 45,
            },
            {
              date: d(-4),
              dayName: 'Thu',
              tasksTotal: 2,
              tasksCompleted: 1,
              focusMinutes: 25,
            },
            {
              date: d(-3),
              dayName: 'Fri',
              tasksTotal: 3,
              tasksCompleted: 2,
              focusMinutes: 35,
            },
            {
              date: d(-2),
              dayName: 'Sat',
              tasksTotal: 1,
              tasksCompleted: 1,
              focusMinutes: 15,
            },
            {
              date: d(-1),
              dayName: 'Sun',
              tasksTotal: 0,
              tasksCompleted: 0,
              focusMinutes: 10,
            },
          ],
          topTags: [
            {
              tagId: 'debug-tag-work',
              tagName: 'Work',
              tagColor: '#3b82f6',
              completedCount: 8,
              totalCount: 10,
            },
            {
              tagId: 'debug-tag-health',
              tagName: 'Health',
              tagColor: '#22c55e',
              completedCount: 5,
              totalCount: 7,
            },
            {
              tagId: 'debug-tag-personal',
              tagName: 'Personal',
              tagColor: '#f59e0b',
              completedCount: 3,
              totalCount: 5,
            },
          ],
          focusAreas: [
            {
              categoryId: 'sport',
              categoryName: 'Sport',
              accent: '#22c55e',
              tagIds: ['debug-tag-health'],
              tasksTotal: 7,
              tasksCompleted: 5,
              focusMinutes: 60,
              topTags: [
                {
                  tagId: 'debug-tag-health',
                  tagName: 'Health',
                  tagColor: '#22c55e',
                  completedCount: 5,
                  totalCount: 7,
                },
              ],
            },
            {
              categoryId: 'mindfulness',
              categoryName: 'Mindfulness',
              accent: '#8b5cf6',
              tagIds: ['debug-tag-personal'],
              tasksTotal: 5,
              tasksCompleted: 3,
              focusMinutes: 45,
              topTags: [
                {
                  tagId: 'debug-tag-personal',
                  tagName: 'Personal',
                  tagColor: '#f59e0b',
                  completedCount: 3,
                  totalCount: 5,
                },
              ],
            },
          ],
          selectedCategoryIds: ['sport', 'mindfulness'],
          prevWeek: {
            tasksCompleted: 10,
            completionRate: 62,
            totalFocusMinutes: 120,
            activeDays: 4,
          },
          alreadySeen: false,
          skinsNew: 2,
          skinsRarest: 'Wizard Hat',
          skinsRarestDetail: { slot: 'hat', riveIndex: 5, name: 'Wizard Hat' },
        };
      })()
    : undefined;

  const frogRef = useRef<FrogHandle>(null);
  const flyRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const isInitialLoad = useRef(true);

  const [guestTasks, setGuestTasks] = useState<Task[]>(demoTasks);

  const [quickText, setQuickText] = useState('');
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [timerTask, setTimerTask] = useState<Task | null>(null);
  const [showTimer, setShowTimer] = useState(false);
  const [frogodoroHydrated, setFrogodoroHydrated] = useState(
    () => useFrogodoroStore.persist?.hasHydrated?.() ?? false,
  );
  const lastHandledTimerCompletionRef = useRef<number | null>(null);
  const homeMountTimeRef = useRef<number>(Date.now());

  /* State */
  const [activeTab, setActiveTab] = useState<HomeTab>('all');
  const [isBacklogOpen, setIsBacklogOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const headerMenuBtnRef = useRef<HTMLButtonElement>(null);
  const headerMenuRef = useRef<HTMLDivElement>(null);

  // Ref for scrolling to task list
  const taskListRef = useRef<HTMLDivElement>(null);
  // State for task glow effect
  const [isTaskGlow, setIsTaskGlow] = useState(false);

  const frogBoxRef = useRef<HTMLDivElement | null>(null);
  const mainScrollRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    mainScrollRef.current = document.getElementById('main-scroll');
  }, []);
  const {
    vp,
    cinematic,
    grab,
    tipGroupEl,
    tonguePathEl,
    triggerTongue,
    visuallyDone,
    speedUpTongue,
  } = useFrogTongue({
    frogRef,
    frogBoxRef,
    flyRefs,
    scrollContainerRef: mainScrollRef,
  });

  // Any sheet/popup open (BaseSheet popups + bespoke sheets register here).
  const anySheetOpen = useSheetStore((s) => s.count > 0);
  const isAnyPanelOpen =
    isWardrobeOpen ||
    isQuestOnboardingOpen ||
    shouldShowMissedReview ||
    showQuickAdd ||
    showTimer ||
    isBacklogOpen ||
    anySheetOpen;

  // Sync cinematic state with UI store
  useEffect(() => {
    setIsCinematicActive(cinematic);
  }, [cinematic, setIsCinematicActive]);

  const { showNotification, stackHeight: notificationStackHeight } = useNotification();

  useEffect(() => {
    const persistApi = useFrogodoroStore.persist;
    if (!persistApi) return;

    const prime = () => {
      // Capture the persisted lastCompletionId at the exact moment hydration
      // settles, so we don't mistake the default→persisted bump for a new
      // completion and auto-open the timer on every refresh.
      lastHandledTimerCompletionRef.current =
        useFrogodoroStore.getState().lastCompletionId;
      setFrogodoroHydrated(true);
    };

    if (persistApi.hasHydrated()) {
      prime();
      return;
    }

    return persistApi.onFinishHydration(prime);
  }, []);

  // Live frogodoro session stats for the active task
  const {
    selectedTaskId: frogTaskId,
    sessionStats,
    settings: frogSettings,
    phase: frogPhase,
    timeLeft: frogTimeLeft,
    isRunning: frogRunning,
    timerActive: frogTimerActive,
    phaseElapsed: frogPhaseElapsed,
    stopTimer: frogStopTimer,
    lastCompletionId,
    lastCompletedTaskId,
  } = useFrogodoroStore();
  const frogPhaseDuration =
    frogPhase === 'focus'
      ? frogSettings.focusDuration * 60
      : frogSettings.breakDuration * 60;
  const frogLiveElapsed = frogPhaseDuration - frogTimeLeft;
  const frogHasActivity =
    sessionStats.focusTime > 0 ||
    sessionStats.breakTime > 0 ||
    frogRunning ||
    frogLiveElapsed > 0;

  // Data Switching
  const rawData = user ? tasks : guestTasks;
  const data =
    frogTaskId && frogHasActivity
      ? rawData.map((t) => {
          if (t.id !== frogTaskId) return t;
          const db = t.frogodoroSession;
          const unsavedLiveElapsed = Math.max(0, frogLiveElapsed - frogPhaseElapsed);
          return {
            ...t,
            frogodoroSession: {
              date: format(new Date(), 'yyyy-MM-dd'),
              focusTime:
                Math.max(sessionStats.focusTime, db?.focusTime ?? 0) +
                (frogPhase === 'focus' ? unsavedLiveElapsed : 0),
              breakTime:
                Math.max(sessionStats.breakTime, db?.breakTime ?? 0) +
                (frogPhase === 'break' ? unsavedLiveElapsed : 0),
            },
          };
        })
      : rawData;
  const doneCount = data.filter((t) => t.completed).length;

  // Clear a dangling Frogodoro timer whose task no longer exists in the user's
  // current lists (e.g. a regular task from a previous day that has rolled
  // off). The timer state is persisted in localStorage and republished to the
  // server on every load, so without this it keeps getting restored on login
  // for a task the user can no longer see. Stopping it locally also triggers
  // GlobalTimer to delete the server-side copy.
  useEffect(() => {
    if (!user || isLoading) return;
    if (!frogTimerActive || !frogTaskId) return;
    const taskStillExists =
      tasks.some((t) => t.id === frogTaskId) ||
      backlogTasks.some((t) => t.id === frogTaskId);
    if (!taskStillExists) {
      frogStopTimer();
      setShowTimer(false);
    }
  }, [
    user,
    isLoading,
    frogTimerActive,
    frogTaskId,
    tasks,
    backlogTasks,
    frogStopTimer,
  ]);

  useEffect(() => {
    if (!frogodoroHydrated) return;
    // Ref is primed in the hydration effect above; null means not yet primed.
    if (lastHandledTimerCompletionRef.current === null) return;
    if (lastCompletionId === lastHandledTimerCompletionRef.current) return;

    // GlobalTimer rehydrates server-side timer state on mount and may fire a
    // synthetic completePhase if the persisted endTime had already passed.
    // Treat completions that arrive in the first few seconds as rehydration
    // artifacts and only update the ref — don't open the timer popup.
    const isRehydrationArtifact =
      Date.now() - homeMountTimeRef.current < 4000;

    lastHandledTimerCompletionRef.current = lastCompletionId;
    if (isRehydrationArtifact) return;

    const completedTask =
      data.find((t) => t.id === lastCompletedTaskId) ??
      data.find((t) => t.id === frogTaskId);

    if (completedTask) setTimerTask(completedTask);
    setShowTimer(true);
  }, [
    data,
    frogTaskId,
    frogodoroHydrated,
    lastCompletedTaskId,
    lastCompletionId,
  ]);

  useEffect(() => {
    if (!timerTask) return;
    const updatedTask = rawData.find((t) => t.id === timerTask.id);
    const currentSession = JSON.stringify(timerTask.frogodoroSession ?? null);
    const updatedSession = JSON.stringify(updatedTask?.frogodoroSession ?? null);
    if (
      updatedTask &&
      (updatedTask.text !== timerTask.text ||
        updatedTask.completed !== timerTask.completed ||
        updatedSession !== currentSession)
    ) {
      setTimerTask(updatedTask);
    }
  }, [rawData, timerTask]);

  // Note: We don't rely purely on 'rate' anymore for triggering, but we keep it for the progress bar
  const rate = data.length > 0 ? (doneCount / data.length) * 100 : 0;

  const openTaskCount = data.filter((t) => !t.completed).length;
  const giftDone = doneCount;
  const giftTotal = data.length;
  const flyBalance = user ? flyStatus.balance : 5;
  const laterThisWeek = user ? backlogTasks : [];
  const [dismissQuestOnboarding, setDismissQuestOnboarding] = useState(false);
  const { data: questsData, mutate: mutateQuests } = useSWR<{
    isPremium?: boolean;
    claimableCount?: number;
    activeCount?: number;
    onboarding?: {
      complete: boolean;
      selectedCategoryIds: MacroCategoryId[];
      categoryTagMap: FocusCategoryTagMap[];
    };
    macroCategories?: MacroCategoryDefinition[];
  }>(
    user
      ? `/api/quests?view=home&timezone=${encodeURIComponent(timezone)}`
      : null,
    (url: string) => fetch(url).then((res) => res.json()),
    { revalidateOnFocus: false },
  );
  const isPremium = !!questsData?.isPremium;
  const questOnboarding = questsData?.onboarding;
  const wasMissedReviewOpen = useRef(false);

  const [showWeeklyWrapped, setShowWeeklyWrapped] = useState(false);
  const isFirstDayOfWeek = [0, 1].includes(new Date().getDay()); // Sunday or Monday

  // Allow manual force show via ?wrapped=1
  const forceShowWrapped =
    typeof window !== 'undefined' &&
    window.location.search.includes('wrapped=1');

  const showRecapIndicator = !!user && !!recapData && !showWeeklyWrapped;

  useEffect(() => {
    if (wasMissedReviewOpen.current && !shouldShowMissedReview) {
      void mutateToday();
      void mutateBacklog();
      void mutateQuests();
    }
    wasMissedReviewOpen.current = shouldShowMissedReview;
  }, [shouldShowMissedReview, mutateToday, mutateBacklog, mutateQuests]);

  useEffect(() => {
    if (questOnboarding?.complete) {
      setDismissQuestOnboarding(false);
    }
  }, [questOnboarding?.complete]);

  // Block Scrolling during cinematic
  useEffect(() => {
    if (!cinematic) return;
    const el = mainScrollRef.current ?? window;
    const stop = (e: Event) => e.preventDefault();
    el.addEventListener('wheel', stop, { passive: false });
    el.addEventListener('touchmove', stop, { passive: false });
    return () => {
      el.removeEventListener('wheel', stop as any);
      el.removeEventListener('touchmove', stop as any);
    };
  }, [cinematic]);

  const persistGuestTask = (taskId: string, completed: boolean) => {
    setGuestTasks((prev) => {
      const toggled = prev.map((t) =>
        t.id === taskId ? { ...t, completed } : t,
      );
      // Sort for guest
      return [...toggled].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    });
  };

  const handleToggle = async (taskId: string, explicitCompleted?: boolean) => {
    if (cinematic || grab) return;
    const task = data.find((t) => t.id === taskId);
    if (!task) return;
    const completed =
      explicitCompleted !== undefined ? explicitCompleted : !task.completed;

    if (!completed) {
      if (user) {
        await toggleTask(taskId, false);
        await mutateQuests();
        void swrMutate(getQuestsUrl(timezone));
      } else {
        persistGuestTask(taskId, false);
      }
      return;
    }

    // If this task has an active timer (running or paused), flush any unsaved
    // elapsed time, then fully stop the timer so the pill disappears.
    if (frogTaskId === taskId && frogTimerActive) {
      const unsavedElapsed = Math.max(0, frogLiveElapsed - frogPhaseElapsed);
      if (unsavedElapsed > 0) {
        const today = format(new Date(), 'yyyy-MM-dd');
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        void fetch(`/api/tasks/${taskId}/frogodoro`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session: {
              date: today,
              focusTime: frogPhase === 'focus' ? unsavedElapsed : 0,
              breakTime: frogPhase === 'break' ? unsavedElapsed : 0,
            },
            timezone: tz,
          }),
        })
          .then(() => mutateToday())
          .catch(() => {});
      }
      frogStopTimer();
    }

    await triggerTongue({
      key: taskId,
      completed,
      onPersist: async () => {
        if (user) {
          await toggleTask(taskId, true);
          await mutateQuests();
          void swrMutate(getQuestsUrl(timezone));
        } else {
          persistGuestTask(taskId, true);
        }
      },
    });
  };

  const { indices } = useWardrobeIndices(!!user);
  const { data: backgroundsData } = useBackgrounds(!!user);
  const equippedBackground = useMemo(() => {
    if (!backgroundsData?.equipped) return null;
    return (
      backgroundsData.catalog.find((b) => b.id === backgroundsData.equipped) ?? null
    );
  }, [backgroundsData]);
  const bgImages = {
    mobile: equippedBackground?.images?.mobile || '/bg-mobile.webp',
    tablet: equippedBackground?.images?.tablet || '/bg-tablet.webp',
    web: equippedBackground?.images?.web || '/bg-web.webp',
    webLarge: equippedBackground?.images?.webLarge || '/bg-web-large.webp',
  };

  const renderGuestPrompt = () =>
    !user ? (
      <div className="relative mx-3 mb-2 overflow-hidden border shadow-sm rounded-xl bg-primary/5 border-primary/10">
        <div className="relative flex items-center gap-3 p-3">
          <div className="flex items-center justify-center flex-shrink-0 shadow-sm w-9 h-9 rounded-xl bg-background text-primary ring-1 ring-primary/20">
            <Fly size={24} y={-4} paused={isAnyPanelOpen} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-black text-foreground tracking-tight mb-0.5">
              The Frog is Hungry!
            </h3>
            <p className="text-xs font-medium leading-relaxed text-muted-foreground">
              Catch a fly to make her happy and unlock a special{' '}
              <span className="font-bold text-primary">Gift</span>!
            </p>
          </div>
        </div>
      </div>
    ) : null;

  if (sessionLoading || (user && isLoading && tasks.length === 0)) {
    return <LoadingScreen />;
  }

  return (
    <main className="min-h-screen pb-20 overflow-x-hidden md:pb-8">
      <div className="px-3 pt-[calc(3rem+env(safe-area-inset-top))] pb-4 mx-auto max-w-4xl md:px-6 md:pt-12">
        <Header router={router} />

        <div className="relative flex flex-col items-stretch gap-2 lg:gap-5">
          <div className="relative z-10 flex flex-col gap-2 lg:gap-4">
            <FrogDisplay
              frogRef={frogRef}
              frogBoxRef={frogBoxRef}
              mouthOpen={!!grab}
              mouthOffset={{ y: -4 }}
              indices={indices}
              openWardrobe={isWardrobeOpen}
              onOpenChange={setWardrobeOpen}
              flyBalance={flyBalance}
              rate={rate}
              done={giftDone}
              total={giftTotal}
              isCatching={cinematic}
              hunger={user ? hungerStatus.hunger : 1000}
              maxHunger={user ? hungerStatus.maxHunger : 10000}
              animateHunger={!!user}
              isGuest={!user}
              questClaimableCount={questsData?.claimableCount ?? 0}
              questActiveCount={questsData?.activeCount ?? 0}
              paused={isAnyPanelOpen}
            />
          </div>

          <div
            className="relative z-20 -mx-3 -mt-2 flex flex-col gap-2 rounded-t-[24px] bg-background px-1.5 pt-6 md:mx-auto md:-mt-4 md:w-full md:max-w-2xl md:px-8 lg:gap-4"
            style={{ pointerEvents: cinematic ? 'none' : 'auto' }}
          >
            <div className="flex flex-col gap-2 w-full">
              <div className="flex items-center justify-between px-2 md:px-0">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 ml-3 cursor-pointer group md:gap-2.5">
                    <Icon name="planner" className="w-7 h-7 md:w-8 md:h-8" />
                    <span className="text-sm font-black tracking-tight lowercase text-foreground md:text-base">
                      {openTaskCount}{' '}
                      {openTaskCount === 1 ? 'fly' : 'flies'}{' '}
                      left for today!
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    ref={headerMenuBtnRef}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsHeaderMenuOpen(!isHeaderMenuOpen);
                    }}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all md:text-[13px] md:px-4 md:py-2',
                      isHeaderMenuOpen ||
                        selectedTags.length > 0 ||
                        showCompleted
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                    )}
                  >
                    <Filter className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    <span>Filter</span>
                    {(selectedTags.length > 0 || showCompleted) && (
                      <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    )}
                  </button>
                  <FilterDropdown
                    isOpen={isHeaderMenuOpen}
                    onClose={() => setIsHeaderMenuOpen(false)}
                    triggerRef={headerMenuBtnRef}
                    showTypeFilters={false}
                    showCompleted={showCompleted}
                    onShowCompletedChange={setShowCompleted}
                    availableTags={tags || []}
                    selectedTags={selectedTags}
                    onTagsChange={setSelectedTags}
                  />
                </div>
              </div>

              <div className="min-h-[360px] pb-16" ref={taskListRef}>
                {renderGuestPrompt()}
                <TaskList
                  tasks={data}
                  toggle={handleToggle}
                  showConfetti={rate === 100}
                  visuallyCompleted={visuallyDone}
                  renderBullet={(task, isVisuallyDone, isPaused) =>
                    task.completed || isVisuallyDone ? null : (
                      <div
                        ref={(el) => {
                          flyRefs.current[task.id] = el;
                        }}
                        className="flex items-center justify-center w-11 h-11 border rounded-full bg-muted border-muted-foreground/10 shrink-0 md:h-12 md:w-12"
                      >
                        <Fly
                          onClick={() => null}
                          size={40}
                          y={-3}
                          x={0}
                          paused={isPaused}
                        />
                      </div>
                    )
                  }
                  onAddRequested={(prefill) => {
                    if (!user) {
                      router.push('/login');
                      return;
                    }
                    setQuickText(prefill || '');
                    setShowQuickAdd(true);
                  }}
                  weeklyIds={weeklyIds}
                  onDeleteToday={(id) => {
                    if (!user) {
                      router.push('/login');
                      return;
                    }
                    deleteTask(id);
                  }}
                  onDeleteFromWeek={(taskId) => {
                    if (!user) {
                      router.push('/login');
                      return;
                    }
                    // Delete the whole repeat series (group or weekly).
                    deleteTaskSeries(taskId);
                  }}
                  onDoLater={(id) => {
                    if (!user) {
                      router.push('/login');
                      return;
                    }
                    moveTaskToBacklog(id);
                  }}
                  onReorder={(reordered) => {
                    reorderTasks(reordered);
                  }}
                  pendingToToday={pendingToToday}
                  onToggleRepeat={(id) => {
                    if (!user) {
                      router.push('/login');
                      return;
                    }
                    toggleRepeat(id);
                  }}
                  onEditTask={(id, text, scope) => {
                    if (!user) {
                      router.push('/login');
                      return;
                    }
                    editTask(id, text, false, scope);
                  }}
                  onScheduleTask={(id, data, scope) => {
                    if (!user) {
                      router.push('/login');
                      return;
                    }
                    return scheduleTask(id, data, scope);
                  }}
                  onStartTimer={(t) => {
                    if (!user) {
                      router.push('/login');
                      return;
                    }
                    setTimerTask(t as Task);
                    setShowTimer(true);
                  }}
                  onUpdateDetails={(id, details) => {
                    if (!user) {
                      router.push('/login');
                      return;
                    }
                    updateTaskDetails(id, details);
                  }}
                  onSetRepeat={(id, mode, dayOfWeek, endDate, rule) => {
                    if (!user) {
                      router.push('/login');
                      return;
                    }
                    setTaskRepeat(id, mode, dayOfWeek, endDate, rule);
                  }}
                  onUpdateTags={(id, t, scope) => {
                    if (!user) {
                      router.push('/login');
                      return;
                    }
                    updateTaskTags(id, t, scope);
                  }}
                  onDuplicate={(id, when) => {
                    if (!user) {
                      router.push('/login');
                      return;
                    }
                    duplicateTask(id, when);
                  }}
                  isGuest={!user}
                  tags={tags}
                  showCompleted={showCompleted}
                  selectedTags={selectedTags}
                  onSetSelectedTags={setSelectedTags}
                  isGlowActive={isTaskGlow}
                  isFrozen={cinematic}
                  quickAddOpen={showQuickAdd}
                  paused={isAnyPanelOpen}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SVG Tongue Overlay */}
      {grab && (
        <svg
          key={grab.startAt}
          className="fixed inset-0 z-40 pointer-events-none"
          width={vp.w}
          height={vp.h}
          viewBox={`0 0 ${vp.w} ${vp.h}`}
          preserveAspectRatio="none"
          style={{ width: vp.w, height: vp.h }}
        >
          <defs>
            <linearGradient id="tongue-grad" x1="0" y1="0" x2="0" y2="1">
              <stop stopColor="#ff6b6b" />
              <stop offset="1" stopColor="#f43f5e" />
            </linearGradient>
          </defs>

          {/* Plain <path> — stroke visibility driven entirely by the RAF
              loop via stroke-dasharray (no framer-motion needed). */}
          <path
            ref={tonguePathEl}
            d="M0 0 L0 0"
            fill="none"
            stroke="url(#tongue-grad)"
            strokeWidth={TONGUE_STROKE}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* Tip group is always in the DOM; the RAF loop toggles its
              visibility and transform directly — no React re-renders. */}
          <g ref={tipGroupEl} style={{ visibility: 'hidden' }}>
            <circle r={10} fill="transparent" />
            <image
              href="/fly.svg"
              x={-FLY_PX / 2}
              y={-FLY_PX / 2}
              width={FLY_PX}
              height={FLY_PX}
            />
          </g>
        </svg>
      )}

      {/* Full-screen blocker + skip button during tongue animation */}
      {cinematic && <CinematicOverlay onSkip={speedUpTongue} />}

      <QuickAddSheet
        open={showQuickAdd}
        onOpenChange={setShowQuickAdd}
        initialText={quickText}
        defaultRepeat="this-week"
        focusCategoryIds={questOnboarding?.selectedCategoryIds}
        categoryTagMap={questOnboarding?.categoryTagMap}
        onSubmit={async ({
          text,
          days,
          dates,
          repeat,
          tags,
          startTime,
          endTime,
          reminder,
          repeatEndDate,
          repeatRule,
          notes,
          checklist,
        }) => {
          try {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const dateStr = format(new Date(), 'yyyy-MM-dd');

            const hasExplicitDates = Array.isArray(dates) && dates.length > 0;
            const res = await fetch('/api/tasks?view=board', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text,
                days: hasExplicitDates ? [] : days,
                dates,
                repeat,
                tags,
                timezone: tz,
                startTime,
                endTime,
                reminder,
                repeatEndDate,
                repeatRule,
                notes,
                checklist,
              }),
            });
            const data = await res.json();

            if (user && data.ok && data.tasks) {
              const newTasks = data.tasks;
              // Check backlog based on days array or repeat type if casted
              const isBacklog =
                (repeat as string) === 'backlog' ||
                (Array.isArray(days) && days.includes(-1));

              if (isBacklog) {
                mutateBacklog((curr) => {
                  if (!curr) return newTasks;
                  return [...curr, ...newTasks];
                }, false);
              } else {
                const currentDayOfWeek = new Date().getDay();
                // Filter to only add tasks that match TODAY's date
                const relevantTasks = newTasks.filter((t: any) => {
                  if (t.type === 'weekly') {
                    return t.dayOfWeek === currentDayOfWeek;
                  }
                  return !t.date || t.date === dateStr;
                });

                if (relevantTasks.length > 0) {
                  mutateToday((curr) => {
                    if (!curr) return undefined;
                    return {
                      ...curr,
                      tasks: [...curr.tasks, ...relevantTasks],
                    };
                  }, false);
                }

                // Monthly / custom repeats are stored without a fixed dayOfWeek,
                // so the optimistic filter above can't place them. Revalidate so
                // the server's occurrence engine decides if they land on today.
                const needsRevalidate = newTasks.some(
                  (t: any) =>
                    t.repeatMode === 'monthly' ||
                    t.repeatMode === 'custom' ||
                    t.repeatRule,
                );
                if (needsRevalidate) mutateToday();
              }
            } else if (user) {
              // Fallback
              const isBacklog =
                (repeat as string) === 'backlog' ||
                (Array.isArray(days) && days.includes(-1));
              if (isBacklog) mutateBacklog();
              else mutateToday();
            } else {
              setGuestTasks((prev) => [
                ...prev,
                { id: crypto.randomUUID(), text, completed: false, tags },
              ]);
            }
          } catch (e) {
            console.error('Failed to add task or refresh state:', e);
          }
        }}
      />

      <FrogodoroSheet
        open={showTimer}
        onOpenChange={setShowTimer}
        task={timerTask}
        tags={tags}
        onMutateToday={() => mutateToday()}
      />

      {!showTimer && !shouldShowMissedReview && (
        <FrogodoroPill
          onClick={() => {
            const t = tasks.find((t) => t.id === frogTaskId);
            if (t) setTimerTask(t);
            setShowTimer(true);
          }}
          taskName={
            data.find((t) => t.id === frogTaskId)?.text ??
            backlogTasks.find((t) => t.id === frogTaskId)?.text
          }
        />
      )}

      <HungerWarningModal
        open={!!user && hungerStatus.stolenFlies > 0 && !shouldShowMissedReview}
        stolenFlies={hungerStatus.stolenFlies}
        indices={indices}
        onAcknowledge={async () => {
          // Optimistic clear handled in hook? No, exposure should be in hook if commonly used,
          // but here we can just do manual fetch or add 'acknowledgeHunger' to hook.
          // For now, manual fetch + mutate.
          await fetch('/api/hunger/acknowledge', { method: 'POST' });
          mutateToday();
        }}
      />

      {activeMissedTasksData && (
        <MissedTasksPopup
          show={shouldShowMissedReview}
          status={activeMissedTasksData}
          tags={isDebugMode ? [...tags, ...debugMockTags] : tags}
          hunger={user ? hungerStatus.hunger : undefined}
          maxHunger={user ? hungerStatus.maxHunger : undefined}
          questClaimableCount={questsData?.claimableCount ?? 0}
          questActiveCount={questsData?.activeCount ?? 0}
          isPremium={isPremium}
          onClose={() => setDismissMissedReview(true)}
          onItemResolved={async (id, nextFlyBalance) => {
            await mutateMissedTasks(
              (current) =>
                current
                  ? {
                      ...current,
                      flyBalance: nextFlyBalance ?? current.flyBalance,
                      items: current.items.filter((item) => item.id !== id),
                    }
                  : current,
              { revalidate: false },
            );
          }}
          onStatusChanged={async () => {
            await mutateMissedTasks();
          }}
        />
      )}

      <QuestOnboardingPopup
        show={
          !!user &&
          !!questOnboarding &&
          (isQuestOnboardingOpen ||
            (!questOnboarding.complete && !dismissQuestOnboarding))
        }
        isCompleted={!!questOnboarding?.complete}
        initialSelectedCategoryIds={questOnboarding?.selectedCategoryIds ?? []}
        initialCategoryTagMap={questOnboarding?.categoryTagMap ?? []}
        categories={questsData?.macroCategories ?? []}
        isPremium={!!questsData?.isPremium}
        onClose={() => {
          closeQuestOnboarding();
          setDismissQuestOnboarding(true);
        }}
        onCompleted={() => {
          closeQuestOnboarding();
          setDismissQuestOnboarding(false);
          mutateQuests();
          mutateToday();
        }}
      />

      {/* Floating Add Task FAB */}
      <button
        type="button"
        aria-label="Add task"
        onClick={() => {
          if (!user) {
            router.push('/login');
            return;
          }
          setQuickText('');
          setShowQuickAdd(true);
        }}
        className="fixed right-6 z-[40] grid h-14 w-14 place-items-center rounded-full bg-primary/15 text-primary ring-1 ring-primary/30 shadow-lg backdrop-blur-sm transition-all hover:bg-primary/25 active:scale-95 md:hidden"
        style={{
          bottom: `calc(env(safe-area-inset-bottom) + ${
            notificationStackHeight > 0 ? 80 + notificationStackHeight : 88
          }px)`,
          transition: 'bottom 200ms ease',
        }}
      >
        <Plus className="h-6 w-6 stroke-[3]" />
      </button>

      <BacklogTray
        isOpen={isBacklogOpen}
        onClose={() => setIsBacklogOpen(false)}
        tasks={laterThisWeek.map((t) => ({ ...t, order: t.order || 0 }))}
        onGrab={() => {}}
        setCardRef={() => {}}
        activeDragId={null}
        onDoToday={(id) => {
          if (!user) {
            router.push('/login');
            return;
          }
          const item = laterThisWeek.find((t) => t.id === id);
          if (item) moveTaskToToday(item);
        }}
        onEdit={(id, text) => {
          if (!user) {
            router.push('/login');
            return;
          }
          editTask(id, text, true);
        }}
        onRemove={(id) => {
          if (!user) {
            router.push('/login');
            return;
          }
          deleteBacklogTask(id);
        }}
        userTags={tags}
      />
    </main>
  );
}

/* ------------------------------------------------------------------ */
/*  Cinematic overlay: full-screen tap blocker + skip indicator       */
/* ------------------------------------------------------------------ */
function CinematicOverlay({ onSkip }: Readonly<{ onSkip: () => void }>) {
  const [active, setActive] = React.useState(false);
  const [portalTarget, setPortalTarget] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    // Render into the shared notification stack so the hint rises and stacks
    // exactly like the fly toast / Frogodoro pill (same container + motion).
    setPortalTarget(document.getElementById('frog-bottom-stack-bottom'));
  }, []);

  const handleSkip = React.useCallback(() => {
    if (active) return;
    setActive(true);
    onSkip();
  }, [active, onSkip]);

  return (
    <>
      {/* Invisible full-screen tap target */}
      <button
        type="button"
        aria-label="Tap anywhere to fast-forward tongue animation"
        className="fixed inset-0 z-[55] cursor-default bg-transparent"
        onClick={handleSkip}
        onTouchStart={handleSkip}
      />

      {portalTarget &&
        createPortal(
          <motion.div
            layout
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className={`pointer-events-none w-full md:w-[380px] md:self-end flex items-center gap-3 px-4 py-3 rounded-[18px] border shadow-sm backdrop-blur-2xl transition-colors duration-200 ${
              active
                ? 'bg-card/90 text-foreground border-primary/40'
                : 'bg-card/90 text-foreground border-border/50'
            }`}
          >
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary ring-1 ring-primary/25 shrink-0"
              aria-hidden
            >
              {active ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M13 19V5l8 7-8 7z" fill="currentColor" />
                  <path d="M3 19V5l8 7-8 7z" fill="currentColor" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M5 3l14 9-14 9V3z" fill="currentColor" />
                </svg>
              )}
            </span>
            <span
              className={`flex-1 text-sm font-semibold select-none transition-colors duration-200 ${active ? 'text-primary' : 'text-foreground'}`}
            >
              {active ? 'x2 speed' : 'Tap anywhere to speed up'}
            </span>
          </motion.div>,
          portalTarget,
        )}
    </>
  );
}

// Compact Header
function Header({ router }: { router: any }) {
  return (
    <div className="flex flex-col gap-1 mb-1 md:mb-2 md:flex-row md:items-center md:justify-between">
      {/* Date removed as per request */}
    </div>
  );
}

function OverviewSectionHeader({
  icon,
  title,
  count,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  detail: string;
}) {
  return (
    <div className="flex items-center justify-between px-4 pt-1 pb-0">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span className="flex items-center justify-center w-6 h-6 border rounded-full shadow-sm bg-card border-border/60 text-primary">
          {icon}
        </span>
        <span className="text-[10px] font-black uppercase tracking-[0.16em]">
          {title}
        </span>
      </div>
      <span className="text-[10px] font-bold text-muted-foreground/70">
        {count} {detail}
      </span>
    </div>
  );
}

// Helper component for add-only animation
// Helper component for add-only animation
function TaskCounter({
  count,
  pendingCount,
  isActive = false,
}: {
  count: number;
  pendingCount?: number;
  isActive?: boolean;
}) {
  const controls = useAnimation();
  const prevCount = React.useRef(count);

  React.useEffect(() => {
    if (count > prevCount.current) {
      // Only animate if count INCREASED
      controls.start({
        scale: [1, 1.35, 1],
        color: [
          'hsl(var(--muted-foreground))',
          'hsl(var(--primary))',
          'hsl(var(--muted-foreground))',
        ],
        transition: {
          duration: 0.3,
          ease: 'easeInOut',
        },
      });
    }
    prevCount.current = count;
  }, [count, controls]);

  if (count === 0 && (!pendingCount || pendingCount === 0)) return null;

  return (
    <div className="flex items-center -ml-0.5">
      {count > 0 && (
        <motion.span
          animate={controls}
          className={cn(
            'flex h-[17px] min-w-[17px] px-1 items-center justify-center rounded-full text-[9px] font-black leading-none tracking-normal pt-px transition-colors',
            isActive
              ? 'bg-primary/10 text-primary'
              : 'bg-muted text-muted-foreground/70',
          )}
        >
          {count}
        </motion.span>
      )}
      {(pendingCount ?? 0) > 0 && (
        <svg
          className="w-3.5 h-3.5 animate-spin text-muted-foreground/60"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
      )}
    </div>
  );
}
