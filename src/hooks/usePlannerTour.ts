'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { mutate as mutateGlobal } from 'swr';
import { useIntros } from '@/hooks/useIntros';
import { INVENTORY_KEY, INVENTORY_SUMMARY_KEY } from '@/hooks/useInventory';
import {
  TOUR_BEAT_COUNT,
  TOUR_CHAPTERS,
  TOUR_EVENT,
  TUTORIAL_CARD_HINT,
  type TourBeat,
  type TourChapter,
} from '@/lib/tour/plannerTour';

type Phase =
  | 'idle'
  | 'opener'
  | 'running'
  | 'payoff'
  | 'finale'
  | 'opening'
  | 'done';

const IDLE_SOFTEN_MS = 45_000;
/** Long enough to read a short line of praise, short enough to stay snappy. */
const PAYOFF_HOLD_MS = 1000;
/** The closing line earns a longer beat — the reward lands right after it. */
const FINALE_PAYOFF_HOLD_MS = 1800;
/** How far back a beat will accept an action the user got to before it armed. */
const MISSED_ACTION_MS = 4000;

async function seedCards(
  texts: string[],
  date: string,
  timezone: string,
  staleIds: string[],
) {
  const res = await fetch('/api/user/tutorial-tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts, date, timezone, ids: staleIds }),
  });
  if (!res.ok) throw new Error('seed failed');
  return res.json() as Promise<{ taskIds: string[]; date: string }>;
}

/**
 * Holds until the seeded cards are on screen (or the budget runs out), so the
 * celebration for the step just finished covers the wait instead of the next
 * instruction appearing beside the previous chapter's card.
 */
async function waitForCards(
  texts: string[],
  refresh: () => void | Promise<void>,
  budgetMs = 2500,
) {
  const startedAt = Date.now();
  let lastRetry = startedAt;
  while (Date.now() - startedAt < budgetMs) {
    const onScreen = Array.from(
      document.querySelectorAll<HTMLElement>(
        `[data-hint="${TUTORIAL_CARD_HINT}"]`,
      ),
    ).map((node) => node.textContent ?? '');
    // Keyed on the new cards' own text rather than how many are rendered: a
    // count alone lets the step start against the outgoing chapter's card, and
    // a stray left over from a failed cleanup would stall the wait outright.
    const ready = texts.every((text) =>
      onScreen.some((seen) => seen.includes(text)),
    );
    if (ready) return;
    if (Date.now() - lastRetry > 600) {
      lastRetry = Date.now();
      await refresh();
    }
    await new Promise((resolve) => window.setTimeout(resolve, 80));
  }
}

/**
 * The drop handler fires its column PUTs synchronously, so a seed issued the
 * moment a beat completes would delete the practice card while that PUT is
 * still in flight — and the PUT then re-inserts it. Waiting for the board to
 * go quiet first is what keeps the old card from surviving into the next step.
 */
async function waitForBoardIdle(budgetMs = 3000) {
  const startedAt = Date.now();
  // A write that is about to start has not set the flag yet.
  await new Promise((resolve) => window.setTimeout(resolve, 120));
  while (Date.now() - startedAt < budgetMs) {
    if (document.body.dataset.boardWriting !== '1') return;
    await new Promise((resolve) => window.setTimeout(resolve, 60));
  }
}

/**
 * Drops the gift box into the wardrobe and revalidates the inventory, so it
 * shows up unopened with the app's usual unseen badge.
 */
async function grantReward(): Promise<boolean> {
  try {
    const res = await fetch('/api/user/planner-tour-reward', {
      method: 'POST',
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { granted?: boolean };
    if (!data.granted) return false;
    await mutateGlobal(INVENTORY_KEY);
    await mutateGlobal(INVENTORY_SUMMARY_KEY);
    return true;
  } catch {
    // A failed payout must never block the tour from closing.
    return false;
  }
}

async function clearCards(ids: string[]) {
  await fetch('/api/user/tutorial-tasks', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  }).catch(() => {});
}

export function usePlannerTour({
  enabled,
  activeDateKey,
  timezone,
  onBoardChanged,
}: {
  enabled: boolean;
  activeDateKey: string;
  timezone: string;
  onBoardChanged: () => void | Promise<void>;
}) {
  const { seenIntros, markIntroSeen } = useIntros(enabled);
  const [phase, setPhase] = useState<Phase>('idle');
  const [chapterIndex, setChapterIndex] = useState(0);
  const [beatIndex, setBeatIndex] = useState(0);
  const [payoff, setPayoff] = useState<string | null>(null);
  const [softened, setSoftened] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const claimingRef = useRef(false);
  const recentEventsRef = useRef(
    new Map<string, { at: number; count?: number }>(),
  );

  useEffect(() => {
    const names: string[] = Object.values(TOUR_EVENT);
    const bound = names.map((name) => {
      const handler = (event: Event) => {
        const count = (event as CustomEvent<{ count?: number }>).detail?.count;
        recentEventsRef.current.set(name, { at: Date.now(), count });
      };
      window.addEventListener(name, handler);
      return { name, handler };
    });
    return () =>
      bound.forEach(({ name, handler }) =>
        window.removeEventListener(name, handler),
      );
  }, []);

  const dateRef = useRef(activeDateKey);
  dateRef.current = activeDateKey;
  const tzRef = useRef(timezone);
  tzRef.current = timezone;
  const refreshRef = useRef(onBoardChanged);
  refreshRef.current = onBoardChanged;
  // Every id the tour has ever seeded. Deleting by flag alone is not enough:
  // a board column write can rebuild a moved card as a fresh doc and drop it.
  const seededIdsRef = useRef<string[]>([]);

  const chapter: TourChapter | null = TOUR_CHAPTERS[chapterIndex] ?? null;
  const beat: TourBeat | null = chapter?.beats[beatIndex] ?? null;
  const running = phase === 'running' && !!beat;

  const completedBeats =
    phase === 'finale' || phase === 'done'
      ? TOUR_BEAT_COUNT
      : TOUR_CHAPTERS.slice(0, chapterIndex).reduce(
          (sum, c) => sum + c.beats.length,
          0,
        ) +
        beatIndex +
        // A payoff means the beat behind it is done, so its dot fills now
        // rather than a moment later when the next step opens.
        (phase === 'payoff' ? 1 : 0);

  useEffect(() => {
    if (!enabled || phase !== 'idle') return;
    if (!seenIntros || seenIntros.plannerTour) return;
    setPhase('opener');
  }, [enabled, phase, seenIntros]);

  const finish = useCallback(() => {
    setPhase('done');
    setPayoff(null);
    markIntroSeen('plannerTour');
    void clearCards(seededIdsRef.current).then(() => refreshRef.current());
  }, [markIntroSeen]);

  // The gift is only ever paid by pressing Claim on the reward card, so the
  // reward is something the user takes rather than something that happens.
  const claimReward = useCallback(async () => {
    if (claimingRef.current) return;
    claimingRef.current = true;
    setClaiming(true);
    const granted = await grantReward();
    setClaiming(false);
    claimingRef.current = false;
    // Straight into the normal gift-opening flow, so unwrapping it here is the
    // same moment it would be from the wardrobe. Without a box in the
    // inventory there is nothing to open, so a repeat claim just closes.
    if (granted) setPhase('opening');
    else finish();
  }, [finish]);

  /**
   * The chapter's cards, seeded and confirmed on screen. Kicked off the moment
   * a chapter's last beat lands so the network round-trip runs underneath the
   * celebration instead of after it.
   */
  const prepareChapter = useCallback(async (index: number) => {
    const chapterToOpen = TOUR_CHAPTERS[index];
    if (!chapterToOpen) return;
    setSeeding(true);
    try {
      await waitForBoardIdle();
      if (chapterToOpen.cards?.length) {
        const seeded = await seedCards(
          chapterToOpen.cards,
          dateRef.current,
          tzRef.current,
          seededIdsRef.current,
        );
        seededIdsRef.current = [
          ...seededIdsRef.current,
          ...(seeded.taskIds ?? []),
        ];
        await refreshRef.current();
        await waitForCards(chapterToOpen.cards, refreshRef.current);
      } else {
        // A chapter that needs no practice cards must not inherit the previous
        // chapter's — their highlight competes with the step's real target.
        await clearCards(seededIdsRef.current);
        seededIdsRef.current = [];
        await refreshRef.current();
      }
    } catch (error) {
      console.warn('Planner tour seed failed', error);
    }
    setSeeding(false);
  }, []);

  const enterChapter = useCallback((index: number) => {
    if (!TOUR_CHAPTERS[index]) return;
    setChapterIndex(index);
    setBeatIndex(0);
    setSoftened(false);
    setPayoff(null);
    setPhase('running');
  }, []);

  const start = useCallback(() => {
    void prepareChapter(0).then(() => enterChapter(0));
  }, [prepareChapter, enterChapter]);

  const skip = useCallback(() => finish(), [finish]);

  const step = useCallback(
    (withPayoff: string | null) => {
      if (!chapter) return;
      setSoftened(false);

      if (beatIndex < chapter.beats.length - 1) {
        const goNext = () => {
          setPayoff(null);
          setBeatIndex((i) => i + 1);
          setPhase('running');
        };
        if (!withPayoff) return goNext();
        setPayoff(withPayoff);
        setPhase('payoff');
        window.setTimeout(goNext, PAYOFF_HOLD_MS);
        return;
      }

      const nextIndex = chapterIndex + 1;
      if (nextIndex >= TOUR_CHAPTERS.length) {
        // Let the last dot fill and the closing line land before the reward
        // takes over the screen.
        if (!withPayoff) {
          setPayoff(null);
          setPhase('finale');
          return;
        }
        setPayoff(withPayoff);
        setPhase('payoff');
        window.setTimeout(() => {
          setPayoff(null);
          setPhase('finale');
        }, FINALE_PAYOFF_HOLD_MS);
        return;
      }

      // The seed starts now, not after the celebration, so the round-trip and
      // the payoff hold overlap instead of stacking.
      const prepared = prepareChapter(nextIndex);
      if (!withPayoff) {
        void prepared.then(() => enterChapter(nextIndex));
        return;
      }
      setPayoff(withPayoff);
      setPhase('payoff');
      const held = new Promise((resolve) =>
        window.setTimeout(resolve, PAYOFF_HOLD_MS),
      );
      void Promise.all([prepared, held]).then(() => enterChapter(nextIndex));
    },
    [chapter, beatIndex, chapterIndex, prepareChapter, enterChapter],
  );

  const completeBeat = useCallback(() => {
    if (!beat) return;
    step(beat.payoff ?? null);
  }, [beat, step]);

  const skipBeat = useCallback(() => {
    if (!beat) return;
    step(null);
  }, [beat, step]);

  const completeRef = useRef(completeBeat);
  completeRef.current = completeBeat;

  useEffect(() => {
    if (!running || !beat?.event) return;
    const onEvent = (event: Event) => {
      if (typeof beat.minCount === 'number') {
        const count = (event as CustomEvent<{ count?: number }>).detail?.count;
        if (typeof count === 'number' && count < beat.minCount) return;
      }
      completeRef.current();
    };
    window.addEventListener(beat.event, onEvent);
    return () => window.removeEventListener(beat.event!, onEvent);
  }, [running, beat]);

  // A beat only listens once it is on screen, but the celebration and card
  // seeding before it take about a second — long enough for a quick user to
  // have already done the next thing. Anything that landed in that gap counts.
  useEffect(() => {
    if (!running || !beat?.event) return;
    const seen = recentEventsRef.current.get(beat.event);
    if (!seen || Date.now() - seen.at > MISSED_ACTION_MS) return;
    if (
      typeof beat.minCount === 'number' &&
      (seen.count ?? 0) < beat.minCount
    ) {
      return;
    }
    recentEventsRef.current.delete(beat.event);
    completeRef.current();
  }, [running, beat]);

  useEffect(() => {
    if (!running || !beat) return;
    setSoftened(false);
    const timer = window.setTimeout(() => setSoftened(true), IDLE_SOFTEN_MS);
    return () => window.clearTimeout(timer);
  }, [running, beat]);

  return {
    phase,
    chapter,
    chapterIndex,
    beat,
    running,
    seeding,
    payoff,
    softened,
    claiming,
    completedBeats,
    start,
    skip,
    claimReward,
    closeGift: finish,
    completeBeat,
    skipBeat,
  };
}
