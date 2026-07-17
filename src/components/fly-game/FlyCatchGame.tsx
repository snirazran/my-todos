'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Crown,
  Play,
  RotateCcw,
  Share2,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import Frog, {
  FROG_TONGUE_MOUTH_OFFSET,
  type FrogHandle,
} from '@/components/ui/frog';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { hapticCelebrate, hapticError, hapticImpact, hapticTick } from '@/lib/haptics';
import { playGulp, playPop, playThwip, primeCatchSounds } from '@/lib/catchSounds';
import {
  FLY_GAME_DURATION_MS,
  FLY_GAME_STORAGE_KEY,
  calculateFlyGameScore,
  seededFlyGameRandom,
  selectFlyGameKind,
  type FlyGameEvent,
  type FlyGameKind,
  type FlyGameStats,
} from '@/lib/flyGame';
import { cn } from '@/lib/utils';
import { trackAnalyticsEvent } from '@/lib/analytics/client';
import {
  DEFAULT_BACKGROUND_IMAGES,
  useBackgrounds,
  type BackgroundImages,
} from '@/hooks/useBackgrounds';
import { ObjectiveProgressBar } from '@/lib/questClaims';
import styles from './FlyCatchGame.module.css';

const Fly = dynamic(() => import('@/components/ui/fly'), { ssr: false });
type Phase = 'lobby' | 'countdown' | 'playing' | 'result';
type FlyState = { id: number; kind: FlyGameKind };
type PhysicsFly = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  turnAt: number;
  phase: number;
};
type RunSession = { runId: string; token: string; seed: number };
type Leader = { rank: number; name: string; score: number; catches: number; maxCombo: number };
type LeaderboardResponse = {
  leaders: Leader[];
  totalRuns: number;
  rewardClaimed: boolean;
  playerName: string;
  bestScore: number;
};
type StoredGame = {
  best?: number;
  nickname?: string;
  pending?: RunSession & { score: number };
};
type ScorePop = { id: number; x: number; y: number; label: string; tone: string };

const MAX_FLIES = 8;
const FLY_SIZE = 54;
const EMPTY_STATS: FlyGameStats = {
  score: 0,
  catches: 0,
  misses: 0,
  goldHits: 0,
  timeHits: 0,
  trapHits: 0,
  maxCombo: 0,
  durationMs: FLY_GAME_DURATION_MS,
};

const KIND_META: Record<FlyGameKind, { label: string; short: string; tone: string }> = {
  normal: { label: 'Fly · +1', short: '+1', tone: '#ffffff' },
  gold: { label: 'Golden · +3', short: '+3', tone: '#fde047' },
  time: { label: 'Time · +1 and 2 seconds', short: '+2s', tone: '#67e8f9' },
  trap: { label: 'Trap · −4', short: '−4', tone: '#fda4af' },
};

function readStoredGame(): StoredGame {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(FLY_GAME_STORAGE_KEY) ?? '{}') as StoredGame;
  } catch {
    return {};
  }
}

function writeStoredGame(patch: Partial<StoredGame>) {
  try {
    const current = readStoredGame();
    window.localStorage.setItem(FLY_GAME_STORAGE_KEY, JSON.stringify({ ...current, ...patch }));
  } catch {}
}

const FLY_GAME_MOUTH_OFFSET = {
  x: FROG_TONGUE_MOUTH_OFFSET.x,
  y: FROG_TONGUE_MOUTH_OFFSET.y - 5,
} as const;

function GameBackground({ images, className }: { images: BackgroundImages; className?: string }) {
  return (
    <picture className={cn('pointer-events-none absolute inset-0 z-0 block h-full w-full', className)} aria-hidden>
      {images.webLarge ? <source media="(min-width: 1920px)" srcSet={images.webLarge} /> : null}
      {images.web ? <source media="(min-width: 1280px)" srcSet={images.web} /> : null}
      {images.tablet ? <source media="(min-width: 768px)" srcSet={images.tablet} /> : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={images.mobile} alt="" className="h-full w-full object-cover object-center" />
    </picture>
  );
}

export default function FlyCatchGame() {
  const searchParams = useSearchParams();
  const challengeScore = Math.max(0, Number(searchParams.get('challenge')) || 0);
  const swipeEntry = searchParams.get('entry') === 'swipe';
  const autoStart = swipeEntry && searchParams.get('start') === '1';
  const { user, loading: authLoading } = useAuth();
  const { indices } = useWardrobeIndices(!!user);
  const { data: backgroundData } = useBackgrounds(true);
  const arenaRef = useRef<HTMLDivElement>(null);
  const frogRef = useRef<FrogHandle>(null);
  const flyEls = useRef<(HTMLDivElement | null)[]>([]);
  const physics = useRef<PhysicsFly[]>([]);
  const rafRef = useRef(0);
  const hudTickRef = useRef(0);
  const startAtRef = useRef(0);
  const endAtRef = useRef(0);
  const activeCountRef = useRef(4);
  const phaseRef = useRef<Phase>('lobby');
  const statsRef = useRef<FlyGameStats>({ ...EMPTY_STATS });
  const comboRef = useRef(0);
  const sessionRef = useRef<RunSession | null>(null);
  const gameRandomRef = useRef<() => number>(Math.random);
  const eventsRef = useRef<FlyGameEvent[]>([]);
  const lastActionAtRef = useRef(-Infinity);
  const slotCooldownRef = useRef<number[]>(Array.from({ length: MAX_FLIES }, () => 0));
  const tongueTimerRef = useRef<number | null>(null);
  const popIdRef = useRef(0);
  const autoStartHandledRef = useRef(false);

  const [phase, setPhaseState] = useState<Phase>('lobby');
  const [countdown, setCountdown] = useState(3);
  const [timeLeft, setTimeLeft] = useState(FLY_GAME_DURATION_MS);
  const [hud, setHud] = useState({ score: 0, combo: 0, catches: 0, misses: 0 });
  const [result, setResult] = useState<FlyGameStats | null>(null);
  const [best, setBest] = useState(0);
  const [nickname, setNickname] = useState('Tiny Frog');
  const [flies, setFlies] = useState<FlyState[]>(() =>
    Array.from({ length: MAX_FLIES }, (_, id) => ({ id, kind: 'normal' as const })),
  );
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [loadingBoard, setLoadingBoard] = useState(true);
  const [rank, setRank] = useState<number | null>(null);
  const [rewardState, setRewardState] = useState<'idle' | 'banking' | 'banked' | 'used' | 'error'>('idle');
  const [rewardAmount, setRewardAmount] = useState(0);
  const [shareState, setShareState] = useState<'idle' | 'shared' | 'copied' | 'error'>('idle');
  const [soundOn, setSoundOn] = useState(true);
  const [tongue, setTongue] = useState<{ id: number; x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [scorePops, setScorePops] = useState<ScorePop[]>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [personalBest, setPersonalBest] = useState(false);
  const [submissionState, setSubmissionState] = useState<'idle' | 'submitting' | 'submitted' | 'error'>('idle');
  const [showResultLeaderboard, setShowResultLeaderboard] = useState(false);

  useEffect(() => {
    const saved = readStoredGame();
    if (typeof saved.best === 'number') setBest(saved.best);
    if (saved.nickname) setNickname(saved.nickname);
  }, []);

  const setPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const loadLeaderboard = useCallback(async () => {
    try {
      const response = await fetch('/api/fly-game?limit=10', { cache: 'no-store' });
      if (!response.ok) throw new Error('Leaderboard unavailable');
      const data = (await response.json()) as LeaderboardResponse;
      setLeaderboard(data);
      setBest((current) => Math.max(current, data.bestScore ?? 0));
      if (data.playerName && !readStoredGame().nickname) setNickname(data.playerName);
      if (data.rewardClaimed) setRewardState('used');
    } catch {
      setLeaderboard(null);
    } finally {
      setLoadingBoard(false);
    }
  }, []);

  useEffect(() => {
    void loadLeaderboard();
  }, [loadLeaderboard]);

  useEffect(() => {
    trackAnalyticsEvent('fly_game_viewed', {
      challenge_score: challengeScore,
      source: challengeScore ? 'shared_challenge' : 'app',
    });
  }, [challengeScore]);

  const bankReward = useCallback(async (pending: RunSession & { score?: number }) => {
    setRewardState('banking');
    try {
      const response = await fetch('/api/fly-game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'claim', runId: pending.runId, token: pending.token }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 409) {
          setRewardState('used');
          writeStoredGame({ pending: undefined });
          return;
        }
        throw new Error(data.error ?? 'Could not bank reward');
      }
      setRewardAmount(data.amount ?? pending.score ?? 0);
      setRewardState('banked');
      writeStoredGame({ pending: undefined });
      hapticCelebrate();
    } catch (error) {
      setRewardState('error');
      setStatusMessage(error instanceof Error ? error.message : 'Could not bank reward');
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    const pending = readStoredGame().pending;
    if (pending) void bankReward(pending);
  }, [authLoading, bankReward, user]);

  const resetPhysics = useCallback(() => {
    const rect = arenaRef.current?.getBoundingClientRect();
    const width = rect?.width ?? 360;
    const height = Math.max(240, (rect?.height ?? 560) - 230);
    physics.current = Array.from({ length: MAX_FLIES }, (_, id) => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 72 + Math.random() * 42;
      return {
        x: 10 + Math.random() * Math.max(20, width - FLY_SIZE - 20),
        y: 56 + Math.random() * Math.max(20, height - FLY_SIZE - 64),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        turnAt: performance.now() + 250 + Math.random() * 900,
        phase: id * 1.71 + Math.random() * 3,
      };
    });
  }, []);

  const refreshFly = useCallback((id: number, elapsed: number) => {
    const rect = arenaRef.current?.getBoundingClientRect();
    const p = physics.current[id];
    if (p && rect) {
      p.x = 12 + Math.random() * Math.max(20, rect.width - FLY_SIZE - 24);
      p.y = 58 + Math.random() * Math.max(20, rect.height * 0.62 - FLY_SIZE);
      const angle = Math.random() * Math.PI * 2;
      const speed = 90 + Math.random() * 80;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.turnAt = performance.now() + 240 + Math.random() * 620;
    }
    setFlies((current) => current.map((fly) =>
      fly.id === id
        ? { ...fly, kind: selectFlyGameKind(gameRandomRef.current(), elapsed) }
        : fly,
    ));
  }, []);

  const finishGame = useCallback(() => {
    if (phaseRef.current !== 'playing') return;
    setPhase('result');
    cancelAnimationFrame(rafRef.current);
    const stats = {
      ...statsRef.current,
      durationMs: Math.round(endAtRef.current - startAtRef.current),
    };
    stats.score = calculateFlyGameScore(stats);
    setResult(stats);
    setSubmissionState('idle');
    setShowResultLeaderboard(false);
    const localPersonalBest = stats.score > best;
    setPersonalBest(localPersonalBest);
    trackAnalyticsEvent('fly_game_completed', {
      score: stats.score,
      catches: stats.catches,
      misses: stats.misses,
      max_combo: stats.maxCombo,
      challenge_score: challengeScore,
    });
    const nextBest = Math.max(best, stats.score);
    setBest(nextBest);
    writeStoredGame({ best: nextBest, nickname });
    if (localPersonalBest) hapticCelebrate();
    else hapticImpact();

  }, [best, challengeScore, nickname, setPhase]);

  const submitScore = useCallback(async () => {
    if (!result || submissionState === 'submitting' || submissionState === 'submitted') return;
    const session = sessionRef.current;
    if (!session) {
      setSubmissionState('error');
      setStatusMessage('Could not connect this run. Start one more and try again.');
      return;
    }
    setSubmissionState('submitting');
    setStatusMessage('');
    try {
      const response = await fetch('/api/fly-game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit',
          ...session,
          playerName: nickname,
          stats: result,
          events: eventsRef.current,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'Score submission failed');
      setSubmissionState('submitted');
      setRank(data.rank ?? null);
      setRewardAmount(data.reward ?? result.score);
      const verifiedPersonalBest = Boolean(data.personalBest);
      setPersonalBest(verifiedPersonalBest);
      const pending = {
        ...session,
        score: data.reward ?? result.score,
      };
      writeStoredGame({ pending });
      if (user) await bankReward(pending);
      await loadLeaderboard();
    } catch (error) {
      setSubmissionState('error');
      setStatusMessage(error instanceof Error ? error.message : 'Score submission failed');
    }
  }, [bankReward, loadLeaderboard, nickname, result, submissionState, user]);

  const runLoop = useCallback(() => {
    let last = performance.now();
    const frame = (now: number) => {
      if (phaseRef.current !== 'playing') return;
      if (now >= endAtRef.current) {
        void finishGame();
        return;
      }
      const dt = Math.min(0.032, Math.max(0.001, (now - last) / 1000));
      last = now;
      const elapsed = now - startAtRef.current;
      const activeCount = elapsed < 8_000 ? 4 : elapsed < 18_000 ? 6 : 8;
      activeCountRef.current = activeCount;
      const rect = arenaRef.current?.getBoundingClientRect();
      if (rect) {
        const maxX = Math.max(8, rect.width - FLY_SIZE - 8);
        const maxY = Math.max(145, rect.height - 195 - FLY_SIZE);
        const speedScale = 1 + Math.min(0.65, elapsed / 45_000);
        for (let id = 0; id < MAX_FLIES; id++) {
          const el = flyEls.current[id];
          const p = physics.current[id];
          if (!el || !p) continue;
          if (id >= activeCount) {
            el.style.opacity = '0';
            el.style.pointerEvents = 'none';
            continue;
          }
          el.style.opacity = '1';
          el.style.pointerEvents = 'auto';
          if (now >= p.turnAt) {
            const currentAngle = Math.atan2(p.vy, p.vx);
            const nextAngle = currentAngle + (Math.random() - 0.5) * 2.2;
            const speed = (78 + Math.random() * 72) * speedScale;
            p.vx = Math.cos(nextAngle) * speed;
            p.vy = Math.sin(nextAngle) * speed;
            p.turnAt = now + 280 + Math.random() * 800;
          }
          p.x += (p.vx + Math.sin(now / 170 + p.phase) * 28) * dt;
          p.y += (p.vy + Math.cos(now / 210 + p.phase) * 24) * dt;
          if (p.x <= 8 || p.x >= maxX) {
            p.x = Math.max(8, Math.min(maxX, p.x));
            p.vx *= -1;
          }
          if (p.y <= 52 || p.y >= maxY) {
            p.y = Math.max(52, Math.min(maxY, p.y));
            p.vy *= -1;
          }
          el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) rotate(${Math.max(-16, Math.min(16, p.vx / 9))}deg)`;
        }
      }
      if (now - hudTickRef.current > 80) {
        hudTickRef.current = now;
        setTimeLeft(Math.max(0, endAtRef.current - now));
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
  }, [finishGame]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  useEffect(() => {
    let hiddenAt = 0;
    const onVisibility = () => {
      if (phaseRef.current !== 'playing') return;
      if (document.hidden) {
        hiddenAt = performance.now();
        cancelAnimationFrame(rafRef.current);
      } else if (hiddenAt) {
        const pausedFor = performance.now() - hiddenAt;
        startAtRef.current += pausedFor;
        endAtRef.current += pausedFor;
        hiddenAt = 0;
        runLoop();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [runLoop]);

  const startGame = useCallback(async () => {
    primeCatchSounds();
    trackAnalyticsEvent('fly_game_started', {
      challenge_score: challengeScore,
      source: challengeScore ? 'shared_challenge' : 'app',
    });
    writeStoredGame({ nickname });
    setStatusMessage('');
    setRank(null);
    setRewardState(leaderboard?.rewardClaimed ? 'used' : 'idle');
    setPersonalBest(false);
    setSubmissionState('idle');
    setShowResultLeaderboard(false);
    setResult(null);
    setHud({ score: 0, combo: 0, catches: 0, misses: 0 });
    statsRef.current = { ...EMPTY_STATS };
    eventsRef.current = [];
    lastActionAtRef.current = -Infinity;
    slotCooldownRef.current.fill(0);
    comboRef.current = 0;
    setTimeLeft(FLY_GAME_DURATION_MS);
    resetPhysics();
    sessionRef.current = null;
    try {
      const response = await fetch('/api/fly-game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', playerName: nickname }),
      });
      if (response.ok) {
        const session = await response.json() as RunSession;
        sessionRef.current = session;
        gameRandomRef.current = seededFlyGameRandom(session.seed);
      } else {
        gameRandomRef.current = Math.random;
      }
    } catch {}
    setFlies(Array.from({ length: MAX_FLIES }, (_, id) => ({
      id,
      kind: selectFlyGameKind(gameRandomRef.current(), 0),
    })));

    setCountdown(3);
    setPhase('countdown');
    for (let value = 3; value >= 1; value--) {
      setCountdown(value);
      hapticTick();
      await new Promise((resolve) => window.setTimeout(resolve, 720));
    }
    setCountdown(0);
    hapticImpact();
    const now = performance.now();
    startAtRef.current = now;
    endAtRef.current = now + FLY_GAME_DURATION_MS;
    setPhase('playing');
    runLoop();
  }, [challengeScore, leaderboard?.rewardClaimed, nickname, resetPhysics, runLoop, setPhase]);

  useEffect(() => {
    if (!autoStart || autoStartHandledRef.current) return;
    autoStartHandledRef.current = true;
    void startGame();
  }, [autoStart, startGame]);

  const showTongue = useCallback((x: number, y: number) => {
    const arena = arenaRef.current?.getBoundingClientRect();
    const mouth = frogRef.current?.getMouthPoint();
    if (!arena || !mouth) return;
    const id = Date.now();
    setTongue({ id, x1: mouth.x - arena.left, y1: mouth.y - arena.top, x2: x, y2: y });
    if (tongueTimerRef.current) window.clearTimeout(tongueTimerRef.current);
    tongueTimerRef.current = window.setTimeout(() => setTongue(null), 310);
  }, []);

  const addScorePop = useCallback((x: number, y: number, label: string, tone: string) => {
    const pop = { id: ++popIdRef.current, x, y, label, tone };
    setScorePops((current) => [...current.slice(-5), pop]);
    window.setTimeout(() => setScorePops((current) => current.filter((item) => item.id !== pop.id)), 700);
  }, []);

  const hitFly = useCallback((event: React.PointerEvent, id: number, kind: FlyGameKind) => {
    event.preventDefault();
    event.stopPropagation();
    if (phaseRef.current !== 'playing' || id >= activeCountRef.current) return;
    const actionAt = performance.now();
    if (actionAt - lastActionAtRef.current < 26 || actionAt < slotCooldownRef.current[id]) return;
    lastActionAtRef.current = actionAt;
    slotCooldownRef.current[id] = actionAt + 100;
    const arena = arenaRef.current?.getBoundingClientRect();
    const target = flyEls.current[id]?.getBoundingClientRect();
    if (!arena || !target) return;
    const x = target.left - arena.left + target.width / 2;
    const y = target.top - arena.top + target.height / 2;
    showTongue(x, y);
    if (soundOn) {
      playThwip();
      playPop(Math.min(2, comboRef.current));
      window.setTimeout(() => playGulp(Math.min(2, comboRef.current), kind === 'gold'), 190);
    }

    const stats = statsRef.current;
    eventsRef.current.push({
      t: Math.max(0, Math.round(actionAt - startAtRef.current)),
      action: 'hit',
      slot: id,
      kind,
    });
    let label = KIND_META[kind].short;
    if (kind === 'trap') {
      stats.trapHits += 1;
      comboRef.current = 0;
      hapticError();
    } else {
      stats.catches += 1;
      comboRef.current += 1;
      stats.maxCombo = Math.max(stats.maxCombo, comboRef.current);
      if (kind === 'gold') stats.goldHits += 1;
      if (kind === 'time') {
        stats.timeHits += 1;
        endAtRef.current += 2_000;
        label = '+2s';
      }
      hapticImpact();
    }
    stats.score = calculateFlyGameScore(stats);
    setHud({ score: stats.score, combo: comboRef.current, catches: stats.catches, misses: stats.misses });
    addScorePop(x, y, label, KIND_META[kind].tone);
    refreshFly(id, performance.now() - startAtRef.current);
  }, [addScorePop, refreshFly, showTongue, soundOn]);

  const miss = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (phaseRef.current !== 'playing') return;
    if ((event.target as HTMLElement).closest('[data-game-fly], [data-game-control]')) return;
    const actionAt = performance.now();
    if (actionAt - lastActionAtRef.current < 26) return;
    lastActionAtRef.current = actionAt;
    const stats = statsRef.current;
    eventsRef.current.push({
      t: Math.max(0, Math.round(actionAt - startAtRef.current)),
      action: 'miss',
    });
    stats.misses += 1;
    comboRef.current = 0;
    stats.score = calculateFlyGameScore(stats);
    const rect = arenaRef.current?.getBoundingClientRect();
    if (rect) addScorePop(event.clientX - rect.left, event.clientY - rect.top, '−1', '#fda4af');
    setHud({ score: stats.score, combo: 0, catches: stats.catches, misses: stats.misses });
    hapticTick();
  }, [addScorePop]);

  const shareScore = useCallback(async () => {
    if (!result) return;
    const url = `${window.location.origin}/fly-catch?challenge=${result.score}`;
    const text = `I caught ${result.score} flies in 30 seconds. One more try—can you beat me?`;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1350;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      const gradient = ctx.createLinearGradient(0, 0, 1080, 1350);
      gradient.addColorStop(0, '#153f27');
      gradient.addColorStop(0.56, '#0a2316');
      gradient.addColorStop(1, '#041009');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 1080, 1350);
      ctx.fillStyle = 'rgba(167,243,106,.12)';
      ctx.beginPath();
      ctx.arc(860, 180, 300, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(167,243,106,.28)';
      ctx.lineWidth = 3;
      ctx.roundRect(64, 64, 952, 1222, 52);
      ctx.stroke();
      ctx.fillStyle = '#a7f36a';
      ctx.font = '900 56px system-ui, sans-serif';
      ctx.fillText('FROGRESS · HIGH SCORE', 100, 160);
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 280px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(result.score), 540, 650);
      ctx.font = '800 54px system-ui, sans-serif';
      ctx.fillStyle = '#dfffd0';
      ctx.fillText('FLIES CAUGHT', 540, 735);
      ctx.fillStyle = 'rgba(255,255,255,.1)';
      ctx.roundRect(150, 810, 780, 150, 40);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 42px system-ui, sans-serif';
      ctx.fillText(`BEST COMBO  ×${result.maxCombo}`, 540, 875);
      ctx.font = '700 34px system-ui, sans-serif';
      ctx.fillStyle = '#a7f36a';
      ctx.fillText('CAN YOU BEAT ME IN 30 SECONDS?', 540, 1135);
      ctx.font = '600 28px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,.72)';
      ctx.fillText('Catch one more. Then do one more.', 540, 1195);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Image failed')), 'image/png'),
      );
      const file = new File([blob], `frogress-fly-catch-${result.score}.png`, { type: 'image/png' });
      if (navigator.share) {
        const shareData: ShareData = { title: 'Frogress High Score', text, url };
        if (navigator.canShare?.({ files: [file] })) shareData.files = [file];
        await navigator.share(shareData);
        setShareState('shared');
        trackAnalyticsEvent('fly_game_shared', { score: result.score, method: 'native_share' });
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setShareState('copied');
        trackAnalyticsEvent('fly_game_shared', { score: result.score, method: 'clipboard' });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      try {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setShareState('copied');
      } catch {
        setShareState('error');
      }
    }
  }, [result]);

  const timeSeconds = Math.max(0, Math.ceil(timeLeft / 1000));
  const targetScore = challengeScore || Math.max(10, best + 1);
  const activeBackground = backgroundData?.catalog.find(
    (item) => item.id === backgroundData.equipped,
  );
  const activeBackgroundImages = activeBackground?.images ?? DEFAULT_BACKGROUND_IMAGES;

  return (
    <div className={cn(styles.shell, 'relative w-full overflow-x-hidden bg-background text-foreground')}>
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
        <GameBackground images={activeBackgroundImages} />
        <div className="absolute inset-0 z-[1] bg-gradient-to-b from-black/5 via-transparent to-black/20" />
      </div>

      <div className={cn('relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-7xl flex-col px-0 pb-0 pt-[max(12px,env(safe-area-inset-top))] sm:px-5 lg:px-8', swipeEntry && styles.swipeEntrance)}>
        <header className="mx-3 mb-3 grid h-14 min-w-0 grid-cols-[1fr_auto_1fr] items-center gap-2 sm:mx-0 sm:gap-3">
          <Link href={user ? '/' : '/welcome'} aria-label="Back to Frogress" className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card/85 text-foreground shadow-sm backdrop-blur-md transition hover:bg-accent" data-game-control>
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className={cn('min-w-24 rounded-2xl border border-white/30 bg-card/85 px-5 py-1.5 text-center shadow-sm backdrop-blur-2xl', timeSeconds <= 5 && phase === 'playing' && styles.timerUrgent)}>
            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">Time</p>
            <p className="font-display text-3xl leading-none text-foreground">{timeSeconds}</p>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setSoundOn((value) => !value)} aria-label={soundOn ? 'Mute game sounds' : 'Turn on game sounds'} className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card/85 text-foreground shadow-sm backdrop-blur-md transition hover:bg-accent" data-game-control>
              {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
          </div>
        </header>

        <div className="flex min-h-0 min-w-0 flex-1">
          <section className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="mx-3 mb-2 flex items-center gap-2.5 rounded-2xl border border-border/50 bg-card/90 p-2.5 shadow-sm backdrop-blur-xl sm:mx-0">
              <div className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-primary/10">
                <Fly size={42} interactive={false} alwaysPlay ignoreIdlePause />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex justify-between text-[11px] font-black text-foreground">
                  <span>{challengeScore ? `Beat the challenge: ${challengeScore}` : `One more than your best: ${targetScore}`}</span>
                </div>
                <ObjectiveProgressBar progress={hud.score} target={targetScore} complete={hud.score >= targetScore} haptics={false} />
              </div>
            </div>

            <div ref={arenaRef} onPointerDown={miss} className={cn(styles.arena, 'min-h-[clamp(390px,62dvh,560px)] flex-1 lg:min-h-0')} aria-label="Fly catching game area">
              {flies.map((fly) => (
                <div
                  key={fly.id}
                  ref={(node) => { flyEls.current[fly.id] = node; }}
                  data-game-fly
                  role="button"
                  tabIndex={phase === 'playing' && fly.id < activeCountRef.current ? 0 : -1}
                  aria-label={KIND_META[fly.kind].label}
                  onPointerDown={(event) => hitFly(event, fly.id, fly.kind)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') hitFly(event as unknown as React.PointerEvent, fly.id, fly.kind);
                  }}
                  className={cn(styles.flySlot, styles[fly.kind])}
                  style={{ opacity: 0, pointerEvents: 'none' }}
                >
                  <Fly size={44} interactive={false} alwaysPlay ignoreIdlePause />
                  {fly.kind !== 'normal' ? <span className={styles.kindBadge}>{KIND_META[fly.kind].short}</span> : null}
                </div>
              ))}

              {tongue ? (
                <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible" aria-hidden>
                  <path key={tongue.id} pathLength="1" d={`M ${tongue.x1} ${tongue.y1} Q ${(tongue.x1 + tongue.x2) / 2} ${Math.min(tongue.y1, tongue.y2) - 70} ${tongue.x2} ${tongue.y2}`} fill="none" stroke="#fb7185" strokeWidth="8" strokeLinecap="round" className={styles.tongue} />
                </svg>
              ) : null}
              {scorePops.map((pop) => <span key={pop.id} className={styles.scorePop} style={{ left: pop.x, top: pop.y, color: pop.tone }}>{pop.label}</span>)}

              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex h-64 items-end justify-center">
                <div className="relative mb-3 w-[min(82%,390px)]">
                  <div className="absolute bottom-12 left-1/2 z-[15] -translate-x-1/2">
                    <div className="absolute inset-x-8 bottom-7 h-10 rounded-[50%] bg-black/35 blur-md" />
                  <Frog
                    ref={frogRef}
                    width={250}
                    height={281}
                    indices={indices}
                    mouthOpen={!!tongue}
                    mouthOffset={FLY_GAME_MOUTH_OFFSET}
                    ignoreIdlePause
                  />
                  </div>
                  <div className="relative z-10 grid h-16 grid-cols-2 items-center rounded-[20px] border border-white/30 bg-card/85 px-3 shadow-lg backdrop-blur-2xl">
                    <div className="border-r border-border/60 px-4 text-left">
                      <p className="text-[8px] font-black uppercase tracking-[0.18em] text-muted-foreground">Score</p>
                      <p className="font-display text-2xl leading-none text-foreground">{hud.score}</p>
                    </div>
                    <div className="px-4 text-right">
                      <p className="text-[8px] font-black uppercase tracking-[0.18em] text-muted-foreground">Combo</p>
                      <p className={cn('font-display text-2xl leading-none', hud.combo >= 5 ? 'text-amber-500' : 'text-foreground')}>×{hud.combo}</p>
                    </div>
                  </div>
                </div>
              </div>

              {phase === 'lobby' ? (
                <div className="absolute inset-0 z-30 grid place-items-center bg-background/15 p-3 backdrop-blur-[2px] sm:p-5" data-game-control>
                  <div className="w-full max-w-md rounded-[28px] border border-border bg-card/95 p-5 text-center shadow-2xl backdrop-blur-xl sm:p-6">
                    {challengeScore ? <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs font-black text-amber-700 dark:text-amber-300"><Zap className="h-3.5 w-3.5" /> You were challenged to beat {challengeScore}</div> : null}
                    <p className="font-display text-4xl leading-[0.95] text-foreground sm:text-5xl">FROGRESS<br /><span className="text-primary">ONE MORE FLY.</span></p>
                    <p className="mx-auto mt-3 max-w-sm text-sm font-semibold leading-relaxed text-muted-foreground">Catch flies. Build momentum. Every miss costs 1 — and the red ones bite back.</p>
                    {!user ? (
                      <label className="mx-auto mt-4 block max-w-xs text-left">
                        <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-muted-foreground">Leaderboard name</span>
                        <input value={nickname} onChange={(event) => setNickname(event.target.value.slice(0, 22))} maxLength={22} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-bold text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" />
                      </label>
                    ) : null}
                    <button type="button" onClick={() => void startGame()} className="mx-auto mt-4 flex h-14 w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-primary text-base font-black text-primary-foreground shadow-lg shadow-primary/20 transition hover:brightness-105 active:scale-[.98]" data-game-control>
                      <Play className="h-5 w-5 fill-current" /> START CATCHING
                    </button>
                    <div className="mt-4 flex flex-wrap justify-center gap-2 text-[10px] font-black uppercase tracking-wider">
                      <span className="rounded-full bg-muted px-2.5 py-1.5 text-muted-foreground">Normal +1</span>
                      <span className="rounded-full bg-amber-400/15 px-2.5 py-1.5 text-amber-700 dark:text-amber-300">Glow +3</span>
                      <span className="rounded-full bg-cyan-400/15 px-2.5 py-1.5 text-cyan-700 dark:text-cyan-300">Blue +2s</span>
                      <span className="rounded-full bg-rose-400/15 px-2.5 py-1.5 text-rose-700 dark:text-rose-300">Red −4</span>
                    </div>
                  </div>
                </div>
              ) : null}

              {phase === 'countdown' ? (
                <div className="absolute inset-0 z-30 grid place-items-center bg-background/30 backdrop-blur-[2px]" data-game-control>
                  <div key={countdown} className={cn(styles.countdown, 'font-display text-[130px] text-primary')}>{countdown}</div>
                </div>
              ) : null}

              {phase === 'result' && result ? (
                <div className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto bg-background/35 p-3 backdrop-blur-md sm:p-6" data-game-control>
                  <div className="mx-auto w-full max-w-lg rounded-[28px] border border-border bg-card/95 p-5 text-center shadow-2xl sm:p-6">
                    <p className="mt-1 text-xs font-black uppercase tracking-[0.22em] text-primary">{personalBest ? 'New personal best' : 'Run complete'}</p>
                    <p className="font-display text-7xl leading-none text-foreground sm:text-8xl">{result.score}</p>
                    <p className="mt-1 text-sm font-bold text-muted-foreground">×{result.maxCombo} best combo</p>
                    {submissionState === 'submitted' && rank ? <div className="mx-auto mt-3 flex w-fit items-center gap-2 rounded-full border border-amber-400/25 bg-amber-400/10 px-4 py-2 text-sm font-black text-amber-700 dark:text-amber-300"><Trophy className="h-4 w-4" /> You placed #{rank}</div> : null}
                    {submissionState === 'idle' ? <p className="mt-3 text-xs font-bold text-muted-foreground">Submit to save your rank and unlock earned rewards.</p> : null}
                    {statusMessage ? <p className="mt-3 text-xs font-bold text-destructive">{statusMessage}</p> : null}

                    {/* Gift rewards were removed from Fly Catch.
                      <div className="mt-4 w-full rounded-2xl border border-amber-400/35 bg-gradient-to-r from-amber-400/15 via-orange-400/10 to-amber-400/15 p-3 text-left shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-amber-400/20"><Gift className="h-6 w-6 text-amber-500" /></div>
                          <div className="min-w-0 flex-1"><p className="text-sm font-black">High-score gift unlocked</p><p className="text-xs font-semibold text-muted-foreground">Open it with Frogress’s full gift reveal.</p></div>
                          {user ? (
                            <button
                              type="button"
                              disabled={bestGiftState === 'claiming' || bestGiftState === 'opened'}
                              onClick={() => {
                                if (bestGiftState === 'ready') {
                                  setGiftOpeningSource('best');
                                  giftOpeningCountedRef.current = false;
                                  setGiftOpening(true);
                                  return;
                                }
                                const session = sessionRef.current;
                                if (session) void claimBestGift({ ...session, personalBest: true });
                              }}
                              className="shrink-0 rounded-xl bg-amber-500 px-3 py-2 text-xs font-black text-white shadow-[0_3px_0_#b45309] active:translate-y-[2px] active:shadow-none disabled:opacity-60"
                            >
                              {bestGiftState === 'claiming' ? 'CLAIMING…' : bestGiftState === 'opened' ? 'OPENED' : 'OPEN GIFT'}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    */}

                    {/* Rare gift catches were removed from Fly Catch.
                      <div className="mt-3 w-full rounded-2xl border border-amber-400/35 bg-card/90 p-3 text-left shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-amber-400/15"><GiftRive width={48} height={48} ambient="jump" /></div>
                          <div className="min-w-0 flex-1"><p className="text-sm font-black">You caught {caughtGiftCount} rare {caughtGiftCount === 1 ? 'gift' : 'gifts'}!</p><p className="text-xs font-semibold text-muted-foreground">Open {caughtGiftCount === 1 ? 'it' : 'them'} now or later from Inventory.</p></div>
                          {user ? (
                            <button
                              type="button"
                              disabled={runGiftState === 'claiming' || runGiftState === 'opened'}
                              onClick={() => {
                                setGiftOpeningSource('run');
                                giftOpeningCountedRef.current = false;
                                setGiftOpening(true);
                              }}
                              className="shrink-0 rounded-xl bg-amber-500 px-3 py-2 text-xs font-black text-white shadow-[0_3px_0_#b45309] active:translate-y-[2px] active:shadow-none disabled:opacity-60"
                            >
                              {runGiftState === 'claiming' ? 'CLAIMING…' : `OPEN${caughtGiftCount > 1 ? ' NEXT' : ''}`}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    */}

                    <div className="mt-4 grid w-full grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-muted/70 p-2"><p className="font-display text-xl">{best}</p><p className="text-[9px] font-black uppercase text-muted-foreground">Best</p></div>
                      <div className="rounded-xl bg-muted/70 p-2"><p className="font-display text-xl">{result.catches}</p><p className="text-[9px] font-black uppercase text-muted-foreground">Caught</p></div>
                      <div className="rounded-xl bg-muted/70 p-2"><p className="font-display text-xl">{result.misses}</p><p className="text-[9px] font-black uppercase text-muted-foreground">Missed</p></div>
                    </div>

                    <button
                      type="button"
                      disabled={submissionState === 'submitting' || submissionState === 'submitted'}
                      onClick={() => void submitScore()}
                      className={cn('mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black transition active:scale-[.98] disabled:cursor-default', submissionState === 'submitted' ? 'border border-primary/30 bg-primary/10 text-primary' : 'bg-primary text-primary-foreground shadow-lg shadow-primary/20')}
                    >
                      {submissionState === 'submitting' ? 'SUBMITTING…' : submissionState === 'submitted' ? <><Check className="h-4 w-4" /> SCORE SUBMITTED{rank ? ` · #${rank}` : ''}</> : submissionState === 'error' ? 'TRY SUBMIT AGAIN' : <><Trophy className="h-4 w-4" /> SUBMIT SCORE</>}
                    </button>

                    <div className="mt-3 grid w-full grid-cols-3 gap-2">
                      <button type="button" onClick={() => void shareScore()} className="flex h-12 items-center justify-center gap-1.5 rounded-xl border border-border bg-muted/60 px-2 text-xs font-black text-foreground transition hover:bg-muted active:scale-[.98]">
                        {shareState === 'shared' || shareState === 'copied' ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
                        {shareState === 'copied' ? 'COPIED' : shareState === 'shared' ? 'SHARED' : 'SHARE'}
                      </button>
                      <Link href="/wardrobe?tab=shop" className="flex h-12 items-center justify-center rounded-xl border border-border bg-muted/60 px-2 text-xs font-black text-foreground transition hover:bg-muted active:scale-[.98]">
                        SHOP
                      </Link>
                      <button type="button" onClick={() => void startGame()} className="flex h-12 items-center justify-center gap-1.5 rounded-xl border border-border bg-muted/60 px-2 text-xs font-black text-foreground transition hover:bg-muted active:scale-[.98]">
                        <RotateCcw className="h-4 w-4" /> AGAIN
                      </button>
                    </div>

                    {submissionState === 'submitted' && !user ? (
                      <div className="mt-4 w-full rounded-2xl border border-amber-400/20 bg-amber-400/[.08] p-4 text-left">
                        <div className="flex gap-3">
                          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center"><Fly size={24} interactive={false} /></span>
                          <div>
                            <p className="text-sm font-black">Keep {rewardAmount || result.score} flies</p>
                            <p className="mt-0.5 text-xs font-semibold text-muted-foreground">Sign in to save the run and add the rewards to your real Frogress inventory.</p>
                          </div>
                        </div>
                        <Link href="/login?next=%2Ffly-catch" onClick={() => trackAnalyticsEvent('fly_game_signup_clicked', { score: result.score, fly_amount: rewardAmount || result.score })} className="mt-3 flex h-12 w-full items-center justify-center rounded-xl bg-primary text-sm font-black text-primary-foreground">SAVE SCORE &amp; BANK FLIES</Link>
                      </div>
                    ) : submissionState === 'submitted' && rewardState === 'banked' ? (
                      <div className="mt-4 flex w-full items-center justify-between gap-3 rounded-2xl border border-primary/25 bg-primary/10 p-4 text-left">
                        <div><p className="text-sm font-black text-primary">{rewardAmount} flies banked!</p><p className="text-xs font-semibold text-muted-foreground">Spend them on a look that feels like you.</p></div>
                        <Link href="/wardrobe?tab=shop" className="shrink-0 rounded-xl bg-primary px-3 py-2 text-xs font-black text-primary-foreground">OPEN SHOP</Link>
                      </div>
                    ) : submissionState === 'submitted' && rewardState === 'banking' ? (
                      <p className="mt-4 text-sm font-bold text-muted-foreground">Banking your starter flies…</p>
                    ) : submissionState === 'submitted' && rewardState === 'used' ? (
                      <p className="mt-4 text-xs font-bold text-muted-foreground">Starter reward already claimed — your high score can still rule the board.</p>
                    ) : null}

                    {submissionState === 'submitted' ? (
                      <button type="button" onClick={() => setShowResultLeaderboard((current) => !current)} className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl text-xs font-black text-muted-foreground transition hover:bg-muted/60 hover:text-foreground">
                        <Crown className="h-4 w-4 text-amber-500" /> {showResultLeaderboard ? 'HIDE LEADERBOARD' : 'VIEW LEADERBOARD'}
                      </button>
                    ) : null}

                    {submissionState === 'submitted' && showResultLeaderboard ? <div className="mt-2 w-full rounded-2xl border border-border bg-muted/45 p-3 text-left">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2"><Crown className="h-4 w-4 text-amber-500" /><p className="text-xs font-black uppercase tracking-wider">Top catchers</p></div>
                        {rank ? <span className="text-[10px] font-black text-primary">You’re #{rank}</span> : null}
                      </div>
                      <div className="space-y-1">
                        {loadingBoard ? Array.from({ length: 3 }, (_, index) => <div key={index} className="h-8 animate-pulse rounded-lg bg-muted" />) : leaderboard?.leaders.length ? leaderboard.leaders.slice(0, 5).map((entry) => (
                          <div key={`${entry.rank}-${entry.name}`} className="grid grid-cols-[22px_1fr_auto] items-center gap-2 rounded-lg bg-background/75 px-2.5 py-1.5">
                            <span className={cn('text-center text-[10px] font-black', entry.rank === 1 ? 'text-amber-500' : 'text-muted-foreground')}>{entry.rank}</span>
                            <span className="truncate text-xs font-bold">{entry.name}</span>
                            <span className="font-display text-base">{entry.score}</span>
                          </div>
                        )) : <p className="py-2 text-center text-xs font-bold text-muted-foreground">Be the first frog on the board.</p>}
                      </div>
                      {!user ? <p className="mt-2 text-center text-[10px] font-bold text-muted-foreground">Sign in to attach this score to your frog.</p> : null}
                    </div> : null}
                  </div>
                </div>
              ) : null}
            </div>
          </section>

        </div>
      </div>
      {/* The game now uses the app's equipped background and real Wardrobe route.
        <BackgroundPicker
          catalog={backgroundCatalog}
          inventory={backgroundData?.inventory ?? { bg_default: 1 }}
          activeId={activeBackgroundId}
          signedIn={!!user}
          onSelect={(id) => {
            setSelectedBackgroundId(id);
            setBackgroundPickerOpen(false);
            hapticImpact();
          }}
          onOpenShop={openWardrobe}
          onClose={() => setBackgroundPickerOpen(false)}
        />
      ) : null}
      {wardrobeOpen ? (
        <FlyGameShop
          open={wardrobeOpen}
          onClose={() => {
            setWardrobeOpen(false);
            setSelectedBackgroundId(null);
          }}
        />
      ) : null}
      {giftOpening ? (
        <GiftBoxOpening
          giftBoxId="gift_box_1"
          onWin={() => {
            if (giftOpeningCountedRef.current) return;
            giftOpeningCountedRef.current = true;
            if (giftOpeningSource === 'best') {
              setBestGiftState('opened');
            } else {
              setCaughtGiftCount((current) => {
                const remaining = Math.max(0, current - 1);
                if (remaining === 0) setRunGiftState('opened');
                return remaining;
              });
            }
            mutateInventoryCaches();
            mutateBackgrounds();
          }}
          onClose={() => setGiftOpening(false)}
        />
      ) : null} */}
    </div>
  );
}
