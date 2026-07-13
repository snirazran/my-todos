'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Zap } from 'lucide-react';
import { useFrogodoroStore } from '@/lib/frogodoroStore';
import { FocusCelebration } from '@/components/ui/FocusCelebration';
import { useFrogodoroUiStore } from '@/lib/frogodoroUiStore';
import { useSheetStore } from '@/lib/sheetStore';
import { useUIStore } from '@/lib/uiStore';
import CircularTimer from '@/components/ui/CircularTimer';

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

/**
 * App-wide minimal Frogodoro presence for pages that don't host the full timer
 * UI (e.g. Quests, Wardrobe): the running-timer pill plus a small completion
 * popup, so a finishing timer is actually shown there — not just heard.
 *
 * Renders nothing while a full host (Home/Planner) is mounted, to avoid a
 * duplicate pill / double Done popup.
 */
export default function GlobalFrogodoroMini() {
  const fullTimerHosts = useFrogodoroUiStore((s) => s.fullTimerHosts);
  const openSheets = useFrogodoroUiStore((s) => s.openSheets);
  const blockingPopups = useSheetStore((s) => s.count);
  const loadingScreenVisible = useUIStore((s) => s.isLoadingScreenVisible);
  const {
    awaitingDone,
    lastCompletedPhase,
    lastFocusElapsed,
    lastBreakElapsed,
    selectedTaskName,
    settings,
    sessionStats,
    setAwaitingDone,
    stopTimer,
    deepFocus,
    lastPhasePaused,
    extendFocus,
  } = useFrogodoroStore();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // When a full-timer host (Home/Planner) is mounted and nothing is blocking
  // it, that page opens its own (richer) Frogodoro popup — so don't show the
  // global one (avoids the open-then-close flicker). The global popup is only
  // for non-host pages, or host pages where a popup/menu is covering the page.
  const hostWillHandle = fullTimerHosts > 0 && blockingPopups === 0;

  // A full sheet open already shows its own Done — don't stack the global one.
  const showDone =
    awaitingDone && openSheets === 0 && !hostWillHandle && !loadingScreenVisible;

  const displayPhase = lastCompletedPhase ?? 'focus';
  const splitDone = settings.autoStartBreaks;
  const baseColor =
    displayPhase === 'focus'
      ? 'bg-primary text-primary-foreground dark:bg-green-700 dark:text-white'
      : 'bg-sky-500 text-white dark:bg-sky-700';
  const accent =
    displayPhase === 'focus'
      ? 'text-primary dark:text-green-700'
      : 'text-sky-500 dark:text-sky-700';

  // Done just acknowledges (silences the alarm) and ends the session.
  const handleDone = () => {
    setAwaitingDone(false);
    stopTimer();
  };

  const handleKeepGoing = () => {
    setAwaitingDone(false);
    extendFocus(5 * 60);
  };

  const celebrateFocus = displayPhase === 'focus' && !splitDone;
  const bonusFly =
    celebrateFocus && deepFocus && !lastPhasePaused && lastFocusElapsed >= 15 * 60;

  return (
    <>
      {/* Compact circular timer at the side; tap to expand controls. Only on
          pages that don't host the full timer UI (Home/Planner have their own
          pill). The completion popup below is global — always rendered and
          top-most — so a finished timer is acknowledged above any open popup or
          settings panel on any page. */}
      {fullTimerHosts === 0 && blockingPopups === 0 && !loadingScreenVisible && (
        <CircularTimer />
      )}

      {mounted &&
        createPortal(
          <AnimatePresence>
            {showDone && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={handleDone}
                  className="fixed inset-0 z-[10050] bg-black/70"
                />
                <div className="pointer-events-none fixed inset-0 z-[10051] flex items-center justify-center p-5">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ type: 'tween', duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                    className="pointer-events-auto w-full max-w-[360px] overflow-hidden rounded-[28px] bg-popover shadow-2xl"
                  >
                    {/* Colored top — matches the in-app timer card */}
                    <div className={`relative px-5 pt-6 pb-5 ${splitDone ? 'bg-sky-500 text-white dark:bg-sky-700' : baseColor}`}>
                      {splitDone && (
                        <div aria-hidden className="absolute inset-y-0 left-0 z-0 w-1/2 bg-primary dark:bg-green-700" />
                      )}
                      <div className="relative z-10">
                        {selectedTaskName && (
                          <p className="mb-1 truncate text-center text-base font-black text-white">
                            {selectedTaskName}
                          </p>
                        )}
                        <p className="mb-4 text-center text-sm font-black uppercase tracking-widest text-white/90">
                          Time&apos;s up!
                        </p>

                        {celebrateFocus ? (
                          <div className="mb-5">
                            <FocusCelebration
                              seconds={lastFocusElapsed}
                              bonusFly={bonusFly}
                              fliesCaught={Math.floor(lastFocusElapsed / 300)}
                              compact
                            />
                          </div>
                        ) : splitDone ? (
                          <div className="mb-5 flex">
                            <div className="flex-1 text-center">
                              <p className="text-[11px] font-black uppercase tracking-widest text-white/80">Focus</p>
                              <p className="text-[40px] font-black leading-none tracking-tighter text-white drop-shadow-lg tabular-nums">
                                {formatTime(lastFocusElapsed)}
                              </p>
                            </div>
                            <div className="flex-1 text-center">
                              <p className="text-[11px] font-black uppercase tracking-widest text-white/80">Break</p>
                              <p className="text-[40px] font-black leading-none tracking-tighter text-white drop-shadow-lg tabular-nums">
                                {formatTime(lastBreakElapsed)}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <p className="mb-5 text-center text-[64px] font-black leading-none tracking-tighter text-white drop-shadow-lg tabular-nums">
                            {formatTime(displayPhase === 'focus' ? lastFocusElapsed : lastBreakElapsed)}
                          </p>
                        )}

                        <div className="flex items-center justify-center gap-2.5">
                          {celebrateFocus && (
                            <button
                              onClick={handleKeepGoing}
                              className="flex items-center justify-center gap-1 rounded-2xl bg-white/20 px-4 py-3 text-[13px] font-black uppercase tracking-widest text-white shadow-[0_6px_0_rgba(0,0,0,0.15)] transition-all hover:bg-white/30 active:translate-y-1.5 active:shadow-none"
                            >
                              <Zap className="h-4 w-4 fill-current" />
                              +5 more
                            </button>
                          )}
                          <button
                            onClick={handleDone}
                            className={`flex items-center justify-center gap-1.5 rounded-2xl bg-white px-8 py-3 text-[15px] font-black uppercase tracking-widest shadow-[0_6px_0_rgba(0,0,0,0.15)] transition-all active:translate-y-1.5 active:shadow-none ${accent}`}
                          >
                            <Check className="h-5 w-5" />
                            Done
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* White footer with the focus/break stats, like the in-app card */}
                    {(sessionStats.focusTime > 0 || sessionStats.breakTime > 0) && (
                      <div className="flex flex-wrap items-center justify-center gap-2 px-4 py-3">
                        {sessionStats.focusTime > 0 && (
                          <div className="flex items-center gap-1.5 rounded-xl bg-primary/8 px-2.5 py-1 dark:bg-primary/15">
                            <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-primary/60">Focus</span>
                            <span className="text-[11px] font-black tabular-nums text-primary">{formatDuration(sessionStats.focusTime)}</span>
                          </div>
                        )}
                        {sessionStats.breakTime > 0 && (
                          <div className="flex items-center gap-1.5 rounded-xl bg-sky-500/8 px-2.5 py-1 dark:bg-sky-500/15">
                            <div className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-sky-500/60">Break</span>
                            <span className="text-[11px] font-black tabular-nums text-sky-500">{formatDuration(sessionStats.breakTime)}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                </div>
              </>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
