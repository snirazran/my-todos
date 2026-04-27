'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, subDays } from 'date-fns';
import {
  Calendar,
  LayoutDashboard,
  CalendarCheck,
  CalendarClock,
  EllipsisVertical,
  Plus,
} from 'lucide-react';
import { HabitPanel } from '@/components/ui/HabitPanel';
import BacklogTray from '@/components/board/BacklogTray';
import BacklogBox from '@/components/board/BacklogBox';
//fix
import { useAuth } from '@/components/auth/AuthContext';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { useUIStore } from '@/lib/uiStore';
import { type FrogHandle } from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import TaskList from '@/components/ui/TaskList';
import QuickAddSheet from '@/components/ui/QuickAddSheet';
import FrogodoroSheet from '@/components/ui/FrogodoroSheet';
import FrogodoroPill from '@/components/ui/FrogodoroPill';
import { AddTaskButton } from '@/components/ui/AddTaskButton';
import { FilterDropdown } from '@/components/ui/FilterDropdown';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { FrogDisplay } from '@/components/ui/FrogDisplay';
import { getQuestsUrl } from '@/components/ui/QuestsPopup';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { HungerWarningModal } from '@/components/ui/HungerWarningModal';
import { DailyRewardPopup } from '@/components/ui/daily-reward/DailyRewardPopup';
import { MissedTasksPopup, type MissedTasksStatus } from '@/components/ui/MissedTasksPopup';
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
import WeeklyRecap from '@/components/ui/WeeklyRecap';
import ProgressCoachPopup from '@/components/ui/ProgressCoachPopup';
import type { WeeklyRecapData } from '@/app/api/weekly-recap/route';
import type { FocusCategoryTagMap, MacroCategoryDefinition, MacroCategoryId } from '@/lib/quests/types';

// Force re-compilation of this file to pick up useTaskData.tsx change

const FLY_PX = 24;
type HomeTab = 'all' | 'today' | 'habits';

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
    isQuestsOpen,
    setIsCinematicActive,
    isDebugMode,
  } = useUIStore();

  // -- NEW STATE HOOK --
  const {
    tasks,
    backlogTasks,
    habits,
    isLoading,
    flyStatus,
    hungerStatus,
    weeklyIds,
    toggleTask,
    moveTaskToBacklog,
    moveTaskToToday,
    deleteTask,
    reorderTasks,
    editTask,
    scheduleTask,
    mutateToday,
    mutateBacklog,
    pendingToBacklog,
    pendingToToday,
    toggleRepeat,
    tags,
  } = useTaskData();

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [dismissMissedReview, setDismissMissedReview] = useState(false);
  const { data: missedTasksData, mutate: mutateMissedTasks } =
    useSWR<MissedTasksStatus>(
      user ? `/api/missed-tasks?timezone=${encodeURIComponent(timezone)}` : null,
      (url: string) => fetch(url).then((res) => res.json()),
      { revalidateOnFocus: false },
    );
  const debugMockTags = [
    { id: 'debug-tag-work', name: 'Work', color: '#3b82f6' },
    { id: 'debug-tag-health', name: 'Health', color: '#22c55e' },
    { id: 'debug-tag-personal', name: 'Personal', color: '#f59e0b' },
  ];
  const debugYesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]; })();
  const debugMissedTasksData: MissedTasksStatus | undefined = isDebugMode
    ? {
        today: new Date().toISOString().split('T')[0],
        yesterday: debugYesterday,
        reviewedToday: false,
        isPremium: false,
        flyBalance: 12,
        completionCost: 1,
        items: [
          { id: 'debug-1', text: 'Finish project report', completed: false, date: debugYesterday, type: 'regular' as const, tags: ['debug-tag-work'] },
          { id: 'debug-2', text: 'Review pull requests', completed: false, date: debugYesterday, type: 'weekly' as const, tags: ['debug-tag-work', 'debug-tag-personal'] },
          { id: 'debug-3', text: 'Morning meditation', completed: false, date: debugYesterday, type: 'habit' as const, timesPerWeek: 7, completedDates: [(() => { const d = new Date(); d.setDate(d.getDate() - 3); return d.toISOString().split('T')[0]; })(), (() => { const d = new Date(); d.setDate(d.getDate() - 5); return d.toISOString().split('T')[0]; })()], tags: ['debug-tag-health'] },
          { id: 'debug-4', text: 'Read 20 pages', completed: false, date: debugYesterday, type: 'habit' as const, timesPerWeek: 5, completedDates: [], tags: ['debug-tag-personal'] },
          { id: 'debug-5', text: 'Go grocery shopping', completed: false, date: debugYesterday, type: 'regular' as const },
        ],
      }
    : undefined;
  const activeMissedTasksData = isDebugMode ? debugMissedTasksData : missedTasksData;
  const shouldShowMissedReview = isDebugMode
    ? !dismissMissedReview
    : !!user &&
      !!activeMissedTasksData &&
      !dismissMissedReview &&
      !activeMissedTasksData.reviewedToday &&
      activeMissedTasksData.items.length > 0;

  // Weekly Recap
  const [dismissRecap, setDismissRecap] = useState(false);
  const { data: recapData } = useSWR<WeeklyRecapData>(
    user ? `/api/weekly-recap?timezone=${encodeURIComponent(timezone)}` : null,
    (url: string) => fetch(url).then((res) => res.json()),
    { revalidateOnFocus: false },
  );
  const debugRecapData: WeeklyRecapData | undefined = isDebugMode
    ? (() => {
        const d = (offset: number) => { const dt = new Date(); dt.setDate(dt.getDate() + offset); return dt.toISOString().split('T')[0]; };
        return {
          weekStart: d(-7),
          weekEnd: d(-1),
          isPremium: true,
          tasksAdded: 18,
          tasksCompleted: 14,
          completionRate: 78,
          activeDays: 6,
          bestDay: { date: d(-4), dayName: 'Wed', tasksTotal: 5, tasksCompleted: 5, habitsTotal: 3, habitsCompleted: 3, focusMinutes: 45, focusCycles: 3 },
          totalFocusMinutes: 185,
          totalFocusCycles: 12,
          fliesEarned: 14,
          currentStreak: 4,
          days: [
            { date: d(-7), dayName: 'Mon', tasksTotal: 3, tasksCompleted: 2, habitsTotal: 3, habitsCompleted: 2, focusMinutes: 25, focusCycles: 1 },
            { date: d(-6), dayName: 'Tue', tasksTotal: 4, tasksCompleted: 3, habitsTotal: 3, habitsCompleted: 3, focusMinutes: 30, focusCycles: 2 },
            { date: d(-5), dayName: 'Wed', tasksTotal: 5, tasksCompleted: 5, habitsTotal: 3, habitsCompleted: 3, focusMinutes: 45, focusCycles: 3 },
            { date: d(-4), dayName: 'Thu', tasksTotal: 2, tasksCompleted: 1, habitsTotal: 3, habitsCompleted: 2, focusMinutes: 25, focusCycles: 2 },
            { date: d(-3), dayName: 'Fri', tasksTotal: 3, tasksCompleted: 2, habitsTotal: 3, habitsCompleted: 1, focusMinutes: 35, focusCycles: 2 },
            { date: d(-2), dayName: 'Sat', tasksTotal: 1, tasksCompleted: 1, habitsTotal: 3, habitsCompleted: 2, focusMinutes: 15, focusCycles: 1 },
            { date: d(-1), dayName: 'Sun', tasksTotal: 0, tasksCompleted: 0, habitsTotal: 3, habitsCompleted: 0, focusMinutes: 10, focusCycles: 1 },
          ],
          topTags: [
            { tagId: 'debug-tag-work', tagName: 'Work', tagColor: '#3b82f6', completedCount: 8, totalCount: 10 },
            { tagId: 'debug-tag-health', tagName: 'Health', tagColor: '#22c55e', completedCount: 5, totalCount: 7 },
            { tagId: 'debug-tag-personal', tagName: 'Personal', tagColor: '#f59e0b', completedCount: 3, totalCount: 5 },
          ],
          habits: [
            { id: 'h1', text: 'Morning meditation', goal: 7, completed: 5, tags: ['debug-tag-health'] },
            { id: 'h2', text: 'Read 20 pages', goal: 5, completed: 3, tags: ['debug-tag-personal'] },
            { id: 'h3', text: 'Stretch for 10 minutes', goal: 6, completed: 6, tags: ['debug-tag-health'] },
          ],
          focusAreas: [
            { categoryId: 'sport', categoryName: 'Sport', accent: '#22c55e', tagIds: ['debug-tag-health'], tasksTotal: 7, tasksCompleted: 5, habitsTotal: 12, habitsCompleted: 9, focusMinutes: 60, topTags: [{ tagId: 'debug-tag-health', tagName: 'Health', tagColor: '#22c55e', completedCount: 5, totalCount: 7 }] },
            { categoryId: 'mindfulness', categoryName: 'Mindfulness', accent: '#8b5cf6', tagIds: ['debug-tag-personal'], tasksTotal: 5, tasksCompleted: 3, habitsTotal: 7, habitsCompleted: 4, focusMinutes: 45, topTags: [{ tagId: 'debug-tag-personal', tagName: 'Personal', tagColor: '#f59e0b', completedCount: 3, totalCount: 5 }] },
          ],
          selectedCategoryIds: ['sport', 'mindfulness'],
          prevWeek: { tasksCompleted: 10, completionRate: 62, totalFocusMinutes: 120, activeDays: 4, habitAvgRate: 55 },
          alreadySeen: false,
        };
      })()
    : undefined;
  const showWeeklyRecap = isDebugMode
    ? !dismissRecap
    : !!user &&
      !!recapData &&
      !dismissRecap &&
      !recapData.alreadySeen &&
      recapData.tasksCompleted + recapData.habits.length > 0 &&
      !shouldShowMissedReview;

  const frogRef = useRef<FrogHandle>(null);
  const flyRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const isInitialLoad = useRef(true);

  const [guestTasks, setGuestTasks] = useState<Task[]>(demoTasks);

  const [quickText, setQuickText] = useState('');
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddMode, setQuickAddMode] = useState<'pick' | 'habit'>('pick');
  const [timerTask, setTimerTask] = useState<Task | null>(null);
  const [showTimer, setShowTimer] = useState(false);
  const [showProgressCoach, setShowProgressCoach] = useState(false);

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
  } = useFrogTongue({ frogRef, frogBoxRef, flyRefs, scrollContainerRef: mainScrollRef });

  const isAnyPanelOpen =
    isWardrobeOpen ||
    isQuestsOpen ||
    isQuestOnboardingOpen ||
    shouldShowMissedReview ||
    showQuickAdd ||
    showTimer ||
    showProgressCoach ||
    isBacklogOpen;

  // Sync cinematic state with UI store
  useEffect(() => {
    setIsCinematicActive(cinematic);
  }, [cinematic, setIsCinematicActive]);

  const { showNotification } = useNotification();
  const [showDailyReward, setShowDailyReward] = useState(false);

  // Check Daily Reward Status
  useEffect(() => {
    if (!user) return;

    const checkReward = async () => {
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const res = await fetch(`/api/daily-reward/status?timezone=${encodeURIComponent(tz)}`);
        const data = await res.json();
        if (data.dailyRewards) {
          const today = new Date().getDate();
          const currentMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

          // Only show if it's the correct month AND today isn't claimed
          if (data.dailyRewards.month === currentMonthKey) {
            const hasClaimedToday =
              data.dailyRewards.claimedDays.includes(today);
            if (!hasClaimedToday) {
              setShowDailyReward(true);
            }
          } else {
            // New month, definitely show
            setShowDailyReward(true);
          }
        }
      } catch (e) {
        console.error('Failed to check daily reward', e);
      }
    };

    // customizable delay or check
    const timer = setTimeout(checkReward, 1000); // Small delay to let app load
    return () => clearTimeout(timer);
  }, [user]);

  // Live frogodoro session stats for the active task
  const { selectedTaskId: frogTaskId, sessionStats, settings: frogSettings, phase: frogPhase, timeLeft: frogTimeLeft, isRunning: frogRunning, pauseTimer: frogPauseTimer } = useFrogodoroStore();
  const frogPhaseDuration = frogPhase === 'focus'
    ? frogSettings.cycleDuration * 60
    : frogPhase === 'shortBreak'
      ? frogSettings.shortBreakDuration * 60
      : frogSettings.longBreakDuration * 60;
  const frogLiveElapsed = frogPhaseDuration - frogTimeLeft;
  const frogHasActivity = sessionStats.focusSessions > 0 || sessionStats.shortBreaks > 0 || sessionStats.longBreaks > 0 || frogRunning || frogLiveElapsed > 0;

  // Data Switching
  const rawData = user ? tasks : guestTasks;
  const data = frogTaskId && frogHasActivity
    ? rawData.map((t) =>
        t.id === frogTaskId
          ? {
              ...t,
              frogodoroSession: {
                date: format(new Date(), 'yyyy-MM-dd'),
                completedCycles: sessionStats.focusSessions + (frogPhase === 'focus' && frogLiveElapsed > 0 ? 1 : 0),
                timeSpent: sessionStats.focusTime + (frogPhase === 'focus' ? frogLiveElapsed : 0),
                shortBreaks: sessionStats.shortBreaks + (frogPhase === 'shortBreak' && frogLiveElapsed > 0 ? 1 : 0),
                shortBreakTime: sessionStats.shortBreakTime + (frogPhase === 'shortBreak' ? frogLiveElapsed : 0),
                longBreaks: sessionStats.longBreaks + (frogPhase === 'longBreak' && frogLiveElapsed > 0 ? 1 : 0),
                longBreakTime: sessionStats.longBreakTime + (frogPhase === 'longBreak' ? frogLiveElapsed : 0),
              },
            }
          : t,
      )
    : rawData;
  const doneCount = data.filter((t) => t.completed).length;
  // Note: We don't rely purely on 'rate' anymore for triggering, but we keep it for the progress bar
  const rate = data.length > 0 ? (doneCount / data.length) * 100 : 0;

  // Include completed habits in gift milestone progress
  const todayDateStr = format(new Date(), 'yyyy-MM-dd');
  const openTaskCount = data.filter((t) => !t.completed).length;
  const openHabitCount = habits.filter(
    (h) => !h.completedDates?.includes(todayDateStr) && !h.completed,
  ).length;
  const visibleTaskCount = showCompleted ? data.length : openTaskCount;
  const visibleHabitCount = showCompleted ? habits.length : openHabitCount;
  const visibleTodayCount = visibleTaskCount + visibleHabitCount;
  const habitsDone = user
    ? habits.filter(
        (h) => h.completedDates?.includes(todayDateStr) || h.completed,
      ).length
    : 0;
  const giftDone = doneCount + habitsDone;
  const giftTotal = data.length + (user ? habits.length : 0);
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
    user ? `/api/quests?view=home&timezone=${encodeURIComponent(timezone)}` : null,
    (url: string) => fetch(url).then((res) => res.json()),
    { revalidateOnFocus: false },
  );
  const isPremium = !!questsData?.isPremium;
  const coachHistoryFrom = format(subDays(new Date(), 6), 'yyyy-MM-dd');
  const coachHistoryTo = format(new Date(), 'yyyy-MM-dd');
  const { data: coachHistoryData } = useSWR<any[]>(
    user
      ? `/api/history?from=${coachHistoryFrom}&to=${coachHistoryTo}&timezone=${encodeURIComponent(timezone)}`
      : null,
    (url: string) => fetch(url).then((res) => res.json()),
    { revalidateOnFocus: false },
  );
  const questOnboarding = questsData?.onboarding;
  const wasMissedReviewOpen = useRef(false);

  useEffect(() => {
    if (wasMissedReviewOpen.current && !shouldShowMissedReview) {
      void mutateToday();
      void mutateBacklog();
      void mutateQuests();
    }
    wasMissedReviewOpen.current = shouldShowMissedReview;
  }, [
    shouldShowMissedReview,
    mutateToday,
    mutateBacklog,
    mutateQuests,
  ]);

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
    const task =
      data.find((t) => t.id === taskId) || habits.find((h) => h.id === taskId);
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

    // If this task has an active timer running, stop it and save the session
    if (frogTaskId === taskId && frogRunning) {
      frogPauseTimer();
      // pauseTimer triggers GlobalTimer's pause-detection effect which saves elapsed time to DB
    }

    // If there's in-progress focus time, the pause handler only saved time (completedCycles: 0).
    // Count it as a completed cycle in the DB.
    if (frogTaskId === taskId && frogPhase === 'focus' && frogLiveElapsed > 0) {
      const today = format(new Date(), 'yyyy-MM-dd');
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      fetch(`/api/tasks/${taskId}/frogodoro`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session: { date: today, completedCycles: 1, timeSpent: 0 },
          timezone,
        }),
      }).then(() => mutateToday()).catch(() => {});
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

  const renderGuestPrompt = () =>
    !user ? (
      <div className="relative mx-3 mb-2 overflow-hidden rounded-xl bg-primary/5 border border-primary/10 shadow-sm">
        <div className="relative flex items-center gap-3 p-3">
          <div className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-xl bg-background text-primary shadow-sm ring-1 ring-primary/20">
            <Fly size={24} y={-4} paused={isAnyPanelOpen} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-black text-foreground tracking-tight mb-0.5">
              The Frog is Hungry!
            </h3>
            <p className="text-xs font-medium text-muted-foreground leading-relaxed">
              Catch a fly to make her happy and unlock a special{' '}
              <span className="text-primary font-bold">Gift</span>!
            </p>
          </div>
        </div>
      </div>
    ) : null;

  if (sessionLoading || (user && isLoading && tasks.length === 0)) {
    return <LoadingScreen message="Loading your day..." />;
  }

  return (
    <main className="min-h-screen pb-20 md:pb-8 bg-background">
      <div className="px-3 pt-1 pb-4 mx-auto max-w-7xl md:px-6">
        <Header router={router} />

        <div className="relative grid items-start grid-cols-1 gap-2 lg:grid-cols-12 lg:gap-5">
          <div className="z-10 flex flex-col gap-2 lg:col-span-4 lg:sticky lg:top-4 lg:gap-4">
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
              onQuestsChanged={async () => {
                await mutateQuests();
              }}
              onOpenProgressCoach={() => setShowProgressCoach(true)}
              progressCoachIsPremium={isPremium}
              paused={isAnyPanelOpen}
            />
          </div>

          <div
            className="flex flex-col gap-2 lg:col-span-8 lg:gap-4"
            style={{ pointerEvents: cinematic ? 'none' : 'auto' }}
          >
            <div className="flex items-center justify-center w-full px-2 md:px-0 md:w-auto md:justify-start">
              <div className="flex items-center w-full max-w-[calc(100vw-1rem)] md:max-w-none md:w-auto p-0.5 rounded-[16px] bg-card/80 backdrop-blur-2xl border border-border/50 shadow-sm relative group z-20">
                <button
                  onClick={() => setActiveTab('all')}
                  className={`
        flex-1 md:flex-none justify-center relative px-2.5 sm:px-4 py-2 text-[10px] font-black uppercase rounded-[11px] transition-all flex items-center whitespace-nowrap
        ${
          activeTab === 'all'
            ? 'bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
        }
      `}
                >
                  <div className="flex items-center justify-center gap-2 mr-[-0.15em]">
                    <LayoutDashboard
                      className={`w-3.5 h-3.5 ${activeTab === 'all' ? 'text-primary' : 'text-muted-foreground'}`}
                    />
                    <span>All</span>
                    <TaskCounter
                      count={visibleTodayCount}
                      pendingCount={pendingToToday}
                      isActive={activeTab === 'all'}
                    />
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('today')}
                  className={`
        flex-1 md:flex-none justify-center relative px-2.5 sm:px-4 py-2 text-[10px] font-black uppercase rounded-[11px] transition-all flex items-center whitespace-nowrap
        ${
          activeTab === 'today'
            ? 'bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
        }
      `}
                >
                  <div className="flex items-center justify-center gap-2 mr-[-0.15em]">
                    <CalendarCheck
                      className={`w-3.5 h-3.5 ${activeTab === 'today' ? 'text-primary' : 'text-muted-foreground'}`}
                    />
                    <span>Tasks</span>
                    <TaskCounter
                      count={visibleTaskCount}
                      pendingCount={pendingToToday}
                      isActive={activeTab === 'today'}
                    />
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('habits')}
                  className={`
        flex-1 md:flex-none justify-center relative px-2.5 sm:px-4 py-2 text-[10px] font-black uppercase rounded-[11px] transition-all flex items-center whitespace-nowrap
        ${
          activeTab === 'habits'
            ? 'bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
        }
      `}
                >
                  <div className="flex items-center justify-center gap-2 mr-[-0.15em]">
                    <CalendarClock
                      className={`w-3.5 h-3.5 ${activeTab === 'habits' ? 'text-primary' : 'text-muted-foreground'}`}
                    />
                    <span>Habits</span>
                    <TaskCounter
                      count={visibleHabitCount}
                      isActive={activeTab === 'habits'}
                    />
                  </div>
                </button>

                {/* 3-DOTS MENU ADDED HERE */}
                <div className="w-[1px] h-5 bg-border/50 mx-0.5" />
                <button
                  ref={headerMenuBtnRef}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsHeaderMenuOpen(!isHeaderMenuOpen);
                  }}
                  className={`relative p-1.5 rounded-full transition-colors ${
                    isHeaderMenuOpen || selectedTags.length > 0 || showCompleted
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  }`}
                >
                  <EllipsisVertical className="w-[18px] h-[18px]" />
                  {(selectedTags.length > 0 || showCompleted) && (
                    <div className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-emerald-500 border-2 border-card shadow-sm" />
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
              <AnimatePresence mode="wait" initial={false}>
                {activeTab === 'all' ? (
                  <motion.div
                    key="all"
                    className="w-full"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    {renderGuestPrompt()}
                    <OverviewSectionHeader
                      icon={<CalendarClock className="w-3.5 h-3.5" />}
                      title="Habits"
                      count={visibleHabitCount}
                      detail={showCompleted ? 'visible' : 'left today'}
                    />
                    {habits.length > 0 ? (
                      <HabitPanel
                        habits={habits}
                        onToggle={handleToggle}
                        onEdit={(id, text) => {
                          if (!user) {
                            router.push('/login');
                            return;
                          }
                          editTask(id, text, false);
                        }}
                        onDelete={(id) => {
                          if (!user) {
                            router.push('/login');
                            return;
                          }
                          deleteTask(id, true);
                        }}
                        onSchedule={(id, data) => {
                          if (!user) {
                            router.push('/login');
                            return;
                          }
                          scheduleTask(id, data);
                        }}
                        onAddRequested={(prefill, isHabit) => {
                          if (!user) {
                            router.push('/login');
                            return;
                          }
                          setQuickText(prefill || '');
                          setQuickAddMode(isHabit ? 'habit' : 'pick');
                          setShowQuickAdd(true);
                        }}
                        tags={tags}
                        flyRefs={flyRefs}
                        showCompleted={showCompleted}
                        visuallyCompleted={visuallyDone}
                        onReorder={reorderTasks}
                        date={todayDateStr}
                        paused={isAnyPanelOpen}
                      />
                    ) : (
                      <div className="px-4 pt-2 pb-3">
                        <div className="rounded-[22px] bg-card/40 border border-border/50 shadow-sm overflow-hidden p-1.5">
                          <button
                            onClick={() => {
                              if (!user) {
                                router.push('/login');
                                return;
                              }
                              setQuickText('');
                              setQuickAddMode('habit');
                              setShowQuickAdd(true);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 border border-dashed border-muted-foreground/20 bg-muted/30 hover:bg-muted/50 rounded-xl transition-all cursor-pointer group"
                          >
                            <div className="flex items-center justify-center w-7 h-7 rounded-full bg-muted border border-muted-foreground/10">
                              <Plus className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                            </div>
                            <p className="text-sm font-semibold text-muted-foreground group-hover:text-primary transition-colors">
                              Add your first habit
                            </p>
                          </button>
                        </div>
                      </div>
                    )}
                    {data.length > 0 && (
                      <OverviewSectionHeader
                        icon={<CalendarCheck className="w-3.5 h-3.5" />}
                        title="Tasks"
                        count={visibleTaskCount}
                        detail={showCompleted ? 'visible' : 'left today'}
                      />
                    )}
                    {(data.length > 0 || habits.length === 0) && (
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
                              className="flex h-7 w-7 items-center justify-center rounded-full bg-muted/50 ring-1 ring-border/60"
                            >
                              <Fly
                                onClick={() => null}
                                size={24}
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
                          setQuickAddMode('pick');
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
                        onDeleteFromWeek={async (taskId) => {
                          if (!user) {
                            router.push('/login');
                            return;
                          }
                          const dow = new Date().getDay();
                          await fetch('/api/tasks?view=board', {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ day: dow, taskId }),
                          });
                          deleteTask(taskId);
                        }}
                        onDoLater={(id) => {
                          if (!user) {
                            router.push('/login');
                            return;
                          }
                          moveTaskToBacklog(id);
                        }}
                        onReorder={reorderTasks}
                        pendingToToday={pendingToToday}
                        onToggleRepeat={(id) => {
                          if (!user) {
                            router.push('/login');
                            return;
                          }
                          toggleRepeat(id);
                        }}
                        onEditTask={(id, text) => {
                          if (!user) {
                            router.push('/login');
                            return;
                          }
                          editTask(id, text, false);
                        }}
                        onScheduleTask={(id, data) => {
                          if (!user) {
                            router.push('/login');
                            return;
                          }
                          return scheduleTask(id, data);
                        }}
                        onStartTimer={(t) => {
                          if (!user) { router.push('/login'); return; }
                          setTimerTask(t as Task);
                          setShowTimer(true);
                        }}
                        isGuest={!user}
                        tags={tags}
                        showCompleted={showCompleted}
                        selectedTags={selectedTags}
                        onSetSelectedTags={setSelectedTags}
                        isGlowActive={isTaskGlow}
                        isFrozen={cinematic}
                        paused={isAnyPanelOpen}
                        onAcceptSuggestion={user ? async (text: string, tagIds?: string[]) => {
                          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                          const todayApiDay = new Date().getDay();
                          await fetch('/api/tasks?view=board', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              text,
                              days: [todayApiDay],
                              repeat: 'this-week',
                              tags: tagIds ?? [],
                              timezone: tz,
                            }),
                          });
                          mutateToday();
                        } : undefined}
                        aiSuggestionFocusCategoryIds={
                          questOnboarding?.selectedCategoryIds ?? []
                        }
                      />
                    )}
                  </motion.div>
                ) : activeTab === 'today' ? (
                  <motion.div
                    key="today"
                    className="w-full"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.2 }}
                  >
                    {!user && (
                      <div className="relative overflow-hidden mb-3 rounded-xl bg-primary/5 border border-primary/10 shadow-sm">
                        <div className="relative flex items-center gap-4 p-4">
                          <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-background text-primary shadow-sm ring-1 ring-primary/20">
                            <span className="text-xl animate-bounce">🍽️</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-black text-foreground tracking-tight mb-0.5">
                              The Frog is Hungry!
                            </h3>
                            <p className="text-xs font-medium text-muted-foreground leading-relaxed">
                              Catch a fly to make her happy and unlock a special{' '}
                              <span className="text-primary font-bold">
                                Gift
                              </span>
                              !
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
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
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-muted/50 ring-1 ring-border/60"
                          >
                            <Fly
                              onClick={() => null}
                              size={24}
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
                        setQuickAddMode('pick');
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
                      onDeleteFromWeek={async (taskId) => {
                        if (!user) {
                          router.push('/login');
                          return;
                        }
                        const dow = new Date().getDay();
                        await fetch('/api/tasks?view=board', {
                          method: 'DELETE',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ day: dow, taskId }),
                        });
                        deleteTask(taskId);
                      }}
                      onDoLater={(id) => {
                        if (!user) {
                          router.push('/login');
                          return;
                        }
                        moveTaskToBacklog(id);
                      }}
                      onReorder={reorderTasks}
                      pendingToToday={pendingToToday}
                      onToggleRepeat={(id) => {
                        if (!user) {
                          router.push('/login');
                          return;
                        }
                        toggleRepeat(id);
                      }}
                      onEditTask={(id, text) => {
                        if (!user) {
                          router.push('/login');
                          return;
                        }
                        editTask(id, text, false);
                      }}
                      onScheduleTask={(id, data) => {
                        if (!user) {
                          router.push('/login');
                          return;
                        }
                        return scheduleTask(id, data);
                      }}
                      onStartTimer={(t) => {
                        if (!user) { router.push('/login'); return; }
                        setTimerTask(t as Task);
                        setShowTimer(true);
                      }}
                      isGuest={!user}
                      tags={tags}
                      showCompleted={showCompleted}
                      selectedTags={selectedTags}
                      onSetSelectedTags={setSelectedTags}
                      isGlowActive={isTaskGlow}
                      isFrozen={cinematic}
                      paused={isAnyPanelOpen}
                      onAcceptSuggestion={user ? async (text: string, tagIds?: string[]) => {
                        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                        const todayApiDay = new Date().getDay();
                        await fetch('/api/tasks?view=board', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            text,
                            days: [todayApiDay],
                            repeat: 'this-week',
                            tags: tagIds ?? [],
                            timezone: tz,
                          }),
                        });
                        mutateToday();
                      } : undefined}
                      aiSuggestionFocusCategoryIds={
                        questOnboarding?.selectedCategoryIds ?? []
                      }
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="habits"
                    className="w-full"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <HabitPanel
                      habits={habits}
                      onToggle={handleToggle}
                      onEdit={(id, text) => {
                        if (!user) {
                          router.push('/login');
                          return;
                        }
                        editTask(id, text, false);
                      }}
                      onDelete={(id) => {
                        if (!user) {
                          router.push('/login');
                          return;
                        }
                        deleteTask(id, true);
                      }}
                      onSchedule={(id, data) => {
                        if (!user) {
                          router.push('/login');
                          return;
                        }
                        scheduleTask(id, data);
                      }}
                      onAddRequested={(prefill, isHabit) => {
                        if (!user) {
                          router.push('/login');
                          return;
                        }
                        setQuickText(prefill || '');
                        setQuickAddMode(isHabit ? 'habit' : 'pick');
                        setShowQuickAdd(true);
                      }}
                      tags={tags}
                      flyRefs={flyRefs}
                      showCompleted={showCompleted}
                      visuallyCompleted={visuallyDone}
                      onReorder={reorderTasks}
                      date={format(new Date(), 'yyyy-MM-dd')}
                      paused={isAnyPanelOpen}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
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
        defaultMode={quickAddMode}
        onSubmit={async ({ text, days, repeat, tags, timesPerWeek, startTime, endTime, reminder }) => {
          try {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const dateStr = format(new Date(), 'yyyy-MM-dd');

            const res = await fetch('/api/tasks?view=board', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text, days, repeat, tags, timesPerWeek, timezone: tz, startTime, endTime, reminder }),
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
                });
              } else {
                const currentDayOfWeek = new Date().getDay();
                // Filter to only add tasks that match TODAY's date, or if it's a habit meant for today
                const relevantTasks = newTasks.filter((t: any) => {
                  if (t.type === 'habit') {
                    // Habits show on ALL days now, so it's always relevant
                    return true;
                  }
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
                  });
                }
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

      {!showTimer && (
        <FrogodoroPill
          onClick={() => {
            const t = tasks.find((t) => t.id === frogTaskId);
            if (t) setTimerTask(t);
            setShowTimer(true);
          }}
        />
      )}

      <HungerWarningModal
        open={
          !!user &&
          hungerStatus.stolenFlies > 0 &&
          !showDailyReward &&
          !shouldShowMissedReview
        }
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

      <DailyRewardPopup
        show={showDailyReward && !shouldShowMissedReview}
        onClose={() => setShowDailyReward(false)}
      />

      {activeMissedTasksData && (
        <MissedTasksPopup
          show={shouldShowMissedReview}
          status={activeMissedTasksData}
          tags={isDebugMode ? [...tags, ...debugMockTags] : tags}
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

      {showWeeklyRecap && (isDebugMode ? debugRecapData : recapData) && (
        <WeeklyRecap
          data={(isDebugMode ? debugRecapData : recapData)!}
          onClose={() => setDismissRecap(true)}
        />
      )}

      <ProgressCoachPopup
        open={showProgressCoach}
        onClose={() => setShowProgressCoach(false)}
        isPremium={isPremium}
        historyData={coachHistoryData ?? []}
        availableTags={tags}
      />

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

      {/* Floating Add Task Button - Home Page Version */}
      <div className="fixed bottom-0 left-0 right-0 z-[40] px-3 pb-[calc(env(safe-area-inset-bottom)+84px)] pointer-events-none">
        <div className="pointer-events-auto mx-auto w-full max-w-[300px] md:max-w-[360px] relative min-h-[48px] flex items-center justify-center gap-1.5">
          {(activeTab === 'all' || activeTab === 'today' || activeTab === 'habits') && (
            <BacklogBox
              count={laterThisWeek.length}
              isDragOver={false}
              isDragging={false}
              proximity={0}
              onClick={() => setIsBacklogOpen(true)}
              forwardRef={null}
            />
          )}
          <div
            className="flex-1 min-w-0 pointer-events-auto"
            style={{ whiteSpace: 'nowrap' }}
          >
            <AddTaskButton
              className="w-full"
              onClick={() => {
                if (!user) {
                  router.push('/login');
                  return;
                }
                setQuickText('');
                setQuickAddMode(activeTab === 'habits' ? 'habit' : 'pick');
                setShowQuickAdd(true);
              }}
              label={
                <span className="flex items-center">
                  Add a <Fly size={24} y={-3} x={4} paused={isAnyPanelOpen} />
                </span>
              }
              showFly={false}
              paused={isAnyPanelOpen}
            />
          </div>
        </div>
      </div>

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
          deleteTask(id);
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

      {/* Visual skip hint (non-interactive): aligned with bottom notification zone */}
      <div className="fixed bottom-0 left-0 right-0 z-[56] flex justify-center pointer-events-none px-3 pb-[calc(env(safe-area-inset-bottom)+152px)]">
        <div
          className={`
            flex items-center gap-2 rounded-full border px-3 py-2
            shadow-sm backdrop-blur-2xl transition-all duration-200
            ${
              active
                ? 'bg-card/90 border-primary/40'
                : 'bg-card/80 border-border/50'
            }
          `}
        >
          <span
            className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary transition-colors duration-200"
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
            className={`text-[11px] font-semibold select-none whitespace-nowrap transition-colors duration-200 ${active ? 'text-primary' : 'text-muted-foreground'}`}
          >
            {active ? 'x2 speed' : 'Tap to speed'}
          </span>
        </div>
      </div>
    </>
  );
}

// Compact Header
function Header({ router }: { router: any }) {
  return (
    <div className="flex flex-col gap-1 mb-1 md:mb-2 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-4xl">
          {format(new Date(), 'EEEE')}
        </h1>
        <p className="flex items-center gap-1.5 text-sm font-medium md:text-base text-muted-foreground">
          <Calendar className="w-3.5 h-3.5 md:w-4 md:h-4" />
          {format(new Date(), 'MMMM d, yyyy')}
        </p>
      </div>
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
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-card border border-border/60 shadow-sm text-primary">
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
