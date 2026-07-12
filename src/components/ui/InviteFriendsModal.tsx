'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AppImage } from '@/components/ui/AppImage';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Check,
  Gift,
  Loader2,
  X,
} from 'lucide-react';
import useSWR from 'swr';
import Fly from '@/components/ui/fly';
import Frog from '@/components/ui/frog';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { GiftRive } from '@/components/ui/gift-box/GiftBox';
import { RotatingRays } from '@/components/ui/gift-box/RotatingRays';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import type { QuestReward } from '@/lib/quests/types';
import type { ItemDef, WardrobeSlot } from '@/lib/skins/catalog';
import { trackAnalyticsEvent } from '@/lib/analytics/client';

type CatalogItem = {
  id: string;
  name: string;
  slot: ItemDef['slot'];
  rarity: ItemDef['rarity'];
  riveIndex: number;
  icon?: string;
};

type RewardTier = {
  tier: number;
  label: string;
  description?: string;
  flies?: number;
  itemId?: string | null;
  item?: CatalogItem | null;
  imageUrl?: string;
  rewards?: QuestReward[];
};

type GiftOption = {
  id: string;
  name: string;
  itemId: string;
  item?: CatalogItem | null;
  imageUrl?: string;
};

type InviteConfig = {
  headline: string;
  subheading: string;
  shareTitle: string;
  shareMessage: string;
  rewards: RewardTier[];
  giftOptions: GiftOption[];
};

type InviteStatus = { claimedCount: number; pendingCount: number };
type Step = 'overview' | 'pick';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function InviteFriendsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useRegisterOpenSheet(open);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const img = new Image();
    img.src = '/invitefrog.webp';
    img.decode?.().catch(() => {});
  }, []);

  const { data: config } = useSWR<InviteConfig>(
    open ? '/api/invite/config' : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const { data: status, mutate: refreshStatus } = useSWR<InviteStatus>(
    open ? '/api/invite/status' : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  const [step, setStep] = useState<Step>('overview');
  const [selectedGiftId, setSelectedGiftId] = useState<string | null>(null);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const closeInvite = React.useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeInvite();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeInvite, open]);

  useEffect(() => {
    if (!open) return;
    setStep('overview');
    setSelectedGiftId(null);
  }, [open]);

  const shareInviteUrl = React.useCallback(
    async (url: string) => {
      const shareData = {
        title: 'Come join me on Frogress!',
        text: 'I have a gift for you on Frogress. Tap the link to claim it!',
        url,
      };
      try {
        if (typeof navigator !== 'undefined' && (navigator as any).share) {
          await (navigator as any).share(shareData);
          trackAnalyticsEvent('referral_invite_shared', { method: 'native_share', share_surface: 'invite_rewards' });
          return;
        }
      } catch {
        return;
      }

      try {
        await navigator.clipboard.writeText(url);
        trackAnalyticsEvent('referral_invite_shared', { method: 'copy_link', share_surface: 'invite_rewards' });
      } catch {}
    },
    [],
  );

  const handleSendInvite = async () => {
    if (!selectedGiftId) return;
    setCreatingInvite(true);
    try {
      const res = await fetch('/api/invite/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ giftOptionId: selectedGiftId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create invite');

      const url =
        typeof window !== 'undefined'
          ? `${window.location.origin}/?ref=${encodeURIComponent(data.code)}`
          : `/?ref=${encodeURIComponent(data.code)}`;
      void refreshStatus();
      await shareInviteUrl(url);
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingInvite(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            onClick={closeInvite}
            className="fixed inset-0 z-[1400] bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%', transition: { type: 'spring', damping: 34, stiffness: 380 } }}
            transition={{ type: 'spring', damping: 27, stiffness: 260, mass: 0.9 }}
            className="pointer-events-none fixed inset-0 z-[1401] flex will-change-transform md:items-center md:justify-center md:p-4 lg:p-6"
          >
            <div className="pointer-events-auto mx-auto flex h-full min-h-0 w-full flex-col overflow-hidden bg-background md:h-auto md:max-h-[calc(100dvh-2rem)] md:w-[min(100vw-2rem,32rem)] md:rounded-[32px] md:shadow-2xl lg:max-h-[calc(100dvh-3rem)] lg:w-[min(100vw-3rem,32rem)]">
              <AnimatePresence mode="wait">
                {step === 'overview' && (
                  <StepShell key="overview">
                    <OverviewStep
                      config={config}
                      claimedCount={status?.claimedCount ?? 0}
                      totalTiers={config?.rewards?.length ?? 0}
                      onClose={closeInvite}
                      onInviteFriends={() => setStep('pick')}
                    />
                  </StepShell>
                )}

                {step === 'pick' && (
                  <StepShell key="pick">
                    <PickStep
                      config={config}
                      selectedGiftId={selectedGiftId}
                      onSelect={setSelectedGiftId}
                      onClose={closeInvite}
                      onBack={() => setStep('overview')}
                      onSend={handleSendInvite}
                      creating={creatingInvite}
                    />
                  </StepShell>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function StepShell({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 32 }}
      animate={{ opacity: 1, x: 0 }}
      exit={
        reduceMotion
          ? { opacity: 0 }
          : { opacity: 0, x: -32, transition: { duration: 0.16, ease: 'easeIn' } }
      }
      transition={{ type: 'spring', stiffness: 380, damping: 34, mass: 0.8 }}
      className="relative flex h-full min-h-0 flex-1 flex-col will-change-transform"
    >
      {children}
    </motion.div>
  );
}

function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <div className={className}>{children}</div>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        type: 'spring',
        stiffness: 400,
        damping: 30,
        mass: 0.7,
        delay,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function OverviewStep({
  config,
  claimedCount,
  totalTiers,
  onClose,
  onInviteFriends,
}: {
  config?: InviteConfig;
  claimedCount: number;
  totalTiers: number;
  onClose: () => void;
  onInviteFriends: () => void;
}) {
  const reduceMotion = useReducedMotion();
  if (!config) return <Loading onClose={onClose} />;

  return (
    <div className="flex h-full min-h-0 flex-col md:max-h-[calc(100dvh-2rem)] lg:max-h-[calc(100dvh-3rem)]">
      <div className="relative flex h-[clamp(8.5rem,36dvh,19rem)] shrink-0 flex-col justify-end overflow-hidden bg-[#4f9149] px-6 pb-7 pt-6 text-center text-white sm:h-[clamp(9rem,38dvh,20rem)] md:h-[clamp(8rem,32dvh,16rem)] md:pb-6 lg:h-[clamp(8.5rem,32dvh,17rem)]">
        <motion.div
          className="absolute inset-0 transform-gpu will-change-transform [backface-visibility:hidden]"
          initial={reduceMotion ? undefined : { scale: 1.08 }}
          animate={reduceMotion ? undefined : { scale: 1 }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <AppImage
            src="/invitefrog.webp"
            priority
            className="absolute inset-0 h-full w-full object-cover object-[center_35%] md:object-[center_41%]"
          />
        </motion.div>
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0%,transparent_48%,rgba(0,0,0,0.22)_72%,rgba(0,0,0,0.62)_100%)]" />
        <svg
          aria-hidden
          preserveAspectRatio="none"
          viewBox="0 0 100 16"
          className="absolute inset-x-0 bottom-[-1px] z-20 h-5 w-full fill-background sm:h-6"
        >
          <path d="M0 0 Q50 12 100 0 L100 16 L0 16 Z" />
        </svg>
        <CloseButton
          onClose={onClose}
          className="right-4 top-[calc(env(safe-area-inset-top)+0.75rem)] text-white"
        />
        <Reveal
          delay={0.05}
          className="relative z-10 mx-auto flex w-full max-w-xl flex-col items-center"
        >
          <h2 className="text-[25px] font-black leading-[1.08] tracking-tight [text-shadow:0_2px_0_rgba(25,83,43,0.75),0_4px_14px_rgba(0,0,0,0.32)] sm:text-3xl">
            Share Frogress, get rewards!
          </h2>
          <p className="mt-1.5 max-w-md text-[13px] font-medium text-white/95 [text-shadow:0_1px_0_rgba(25,83,43,0.7),0_3px_10px_rgba(0,0,0,0.28)] sm:mt-2 sm:text-[15px]">
            Invite a friend to gift them an outfit and earn rewards for
            yourself!
          </p>
        </Reveal>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5 pt-6 overscroll-contain sm:pb-6 sm:pt-7 md:flex-none">
        {config.rewards.length > 0 && (
          <Reveal delay={0.14}>
            <RewardProgressTrack
              rewards={config.rewards}
              claimedCount={claimedCount}
              totalTiers={totalTiers}
            />
          </Reveal>
        )}
      </div>

      <div
        className="shrink-0 border-t border-border/40 bg-background p-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.85rem)' }}
      >
        <Reveal delay={0.22}>
          <button
            onClick={onInviteFriends}
            disabled={!config.giftOptions?.length}
            className="h-12 w-full rounded-2xl bg-[#4f9149] font-black tracking-tight text-white shadow-[0_4px_0_0_#34631f] transition-all hover:bg-[#5aa354] active:translate-y-1 active:shadow-none disabled:opacity-60"
          >
            {config.giftOptions?.length ? 'Invite friends' : 'No gifts configured yet'}
          </button>
        </Reveal>
      </div>
    </div>
  );
}

function RewardProgressTrack({
  rewards,
  claimedCount,
  totalTiers,
}: {
  rewards: RewardTier[];
  claimedCount: number;
  totalTiers: number;
}) {
  const progressPct =
    totalTiers > 0 ? Math.min(100, Math.max(0, (claimedCount / totalTiers) * 100)) : 0;
  const firstPos = milestonePositionPct(0, rewards.length);
  const lastPos = milestonePositionPct(rewards.length - 1, rewards.length);
  const railStart = 8;
  const railEnd = 92;
  const railSpan = railEnd - railStart;
  const initialProgressPct = 6;
  const progressEnd =
    claimedCount <= 0
      ? initialProgressPct
      : ((firstPos - railStart) / railSpan) * 100 +
        progressPct * ((lastPos - firstPos) / railSpan);

  const nextReward =
    rewards.find((r) => r.tier > claimedCount) ?? rewards[rewards.length - 1] ?? null;

  return (
    <div className="mx-auto max-w-2xl px-1 pt-0">
      <div className="relative mx-auto h-[clamp(9rem,26dvh,14rem)] [--card-size:clamp(3.75rem,20vw,7rem)] [--label-top:calc(var(--rail-top)+1.75rem)] [--rail-top:calc(var(--card-size)+1.1rem)] min-[380px]:h-[clamp(10.25rem,28dvh,14rem)] min-[380px]:[--card-size:clamp(4.5rem,13dvh,7rem)] min-[380px]:[--label-top:calc(var(--rail-top)+2rem)] min-[380px]:[--rail-top:calc(var(--card-size)+1.35rem)]">
        {rewards.map((reward, index) => {
          const pos = milestonePositionPct(index, rewards.length);
          const isLastReward = index === rewards.length - 1;
          return (
            <div
              key={`reward-card-${reward.tier}`}
              className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
              style={{ left: `${pos}%` }}
            >
              <div
                className={`flex h-[var(--card-size)] w-[var(--card-size)] items-center justify-center rounded-[clamp(1.05rem,5vw,1.625rem)] border-[3px] bg-card shadow-sm transition-colors min-[380px]:border-4 ${
                  claimedCount >= reward.tier ? 'border-primary/40' : 'border-muted'
                }`}
              >
                <div className="h-full w-full scale-[0.92] min-[380px]:scale-[0.9] sm:scale-95 min-[900px]:scale-100">
                  <RewardPreview
                    reward={reward.rewards?.[0] ?? legacyReward(reward)}
                    fallbackItem={reward.item ?? null}
                    active={isLastReward}
                  />
                </div>
              </div>
            </div>
          );
        })}

        <div
          className="absolute top-[var(--rail-top)] h-3 -translate-y-1/2 rounded-full bg-muted"
          style={{ left: `${railStart}%`, width: `${railSpan}%` }}
        />
        <div
          className="absolute top-[var(--rail-top)] h-3 -translate-y-1/2 overflow-hidden rounded-full"
          style={{ left: `${railStart}%`, width: `${railSpan * (progressEnd / 100)}%` }}
        >
          <motion.div
            className="h-full w-full rounded-full bg-primary shadow-sm"
            animate={{
              filter: ['brightness(1)', 'brightness(1.08)', 'brightness(1)'],
              boxShadow: [
                '0 1px 2px rgba(0,0,0,0.08)',
                '0 0 14px rgba(34,197,94,0.35)',
                '0 1px 2px rgba(0,0,0,0.08)',
              ],
            }}
            transition={{ duration: 2.2, ease: 'easeInOut', repeat: Infinity }}
          />
        </div>

        {rewards.map((reward, index) => {
            const reached = claimedCount >= reward.tier;
            const pos = milestonePositionPct(index, rewards.length);
            return (
              <div
                key={reward.tier}
                className="absolute top-[var(--rail-top)] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                style={{ left: `${pos}%` }}
              >
                <div
                  className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full transition-colors min-[380px]:h-7 min-[380px]:w-7 ${
                    reached
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted text-transparent'
                  }`}
                >
                  {reached ? <Check className="h-4 w-4" strokeWidth={4} /> : null}
                </div>
              </div>
            );
        })}

        {rewards.map((reward, index) => {
            const pos = milestonePositionPct(index, rewards.length);
            return (
              <div
                key={`reward-label-${reward.tier}`}
                className="absolute top-[var(--label-top)] -translate-x-1/2"
                style={{ left: `${pos}%` }}
              >
                <p className="w-20 text-center text-xs font-black text-muted-foreground min-[380px]:w-24 min-[380px]:text-sm min-[900px]:text-[15px]">
                  {reward.label}
                </p>
              </div>
            );
        })}
      </div>

      {nextReward && (
        <div className="mt-2 text-center">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground/70">
            Your rewards
          </p>
          <p className="mx-auto mt-2 max-w-sm text-base font-medium leading-snug text-foreground">
            {rewardSentence(nextReward)}
          </p>
        </div>
      )}
    </div>
  );
}

function rewardSentence(reward: RewardTier): string {
  if (reward.description && reward.description.trim()) return reward.description.trim();

  const parts: string[] = [];
  for (const r of reward.rewards ?? []) {
    if (r.type === 'FLIES') {
      const amount = r.amountMode === 'random' ? r.maxAmount : r.amount;
      if (amount) parts.push(`${amount} flies`);
    } else if (r.type === 'ITEM' && (r.itemId || reward.item)) {
      parts.push(`a ${reward.item?.name ?? 'special skin'}`);
    }
  }
  if (parts.length === 0 && reward.flies) parts.push(`${reward.flies} flies`);

  const ordinal = reward.label.replace(/\s*friend.*$/i, '').trim().toLowerCase() || 'next';
  const earned =
    parts.length > 1
      ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
      : parts[0] ?? 'rewards';

  return `Earn ${earned} when your ${ordinal} friend joins Frogress!`;
}

function PickStep({
  config,
  selectedGiftId,
  onSelect,
  onClose,
  onBack,
  onSend,
  creating,
}: {
  config?: InviteConfig;
  selectedGiftId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  onBack: () => void;
  onSend: () => void;
  creating: boolean;
}) {
  if (!config) return <Loading onClose={onClose} />;
  const selected = config.giftOptions.find((g) => g.id === selectedGiftId) ?? null;

  return (
    <div className="relative flex h-full flex-col overflow-x-hidden overflow-y-auto bg-[#8fc36d] px-5 pb-5 pt-[calc(env(safe-area-inset-top)+1rem)] text-center text-white overscroll-contain md:h-auto md:max-h-[calc(100dvh-2rem)] lg:max-h-[calc(100dvh-3rem)] md:pt-4">
      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-3xl flex-col md:min-h-0">
        <CloseButton
          onClose={onBack}
          className="left-[-0.5rem] top-2 text-white"
        />

        <Reveal
          delay={0.05}
          className="relative mx-auto mt-4 flex h-44 w-full max-w-md shrink-0 items-center justify-center overflow-visible rounded-[28px] [@media(max-height:620px)]:h-36 sm:mt-10 sm:h-56 sm:[@media(max-height:850px)]:mt-4 sm:[@media(max-height:850px)]:h-40 md:mt-4 md:h-40">
          <div className="pointer-events-none absolute inset-x-[-5rem] bottom-[-5rem] top-[-5rem] transform-gpu bg-[radial-gradient(ellipse_at_center,rgba(225,255,194,0.58)_0%,rgba(190,235,151,0.3)_45%,rgba(133,190,92,0)_76%)]" />
          <div className="absolute inset-[-72px] transform-gpu opacity-40 will-change-transform [mask-image:radial-gradient(circle_at_center,black_0%,black_22%,rgba(0,0,0,0.35)_54%,transparent_82%)] [webkit-mask-image:radial-gradient(circle_at_center,black_0%,black_22%,rgba(0,0,0,0.35)_54%,transparent_82%)]">
            <RotatingRays colorClass="text-white/14" />
          </div>
          <div className="relative z-10 -translate-y-3 scale-[0.82] sm:scale-100">
            <Frog
              className="-translate-y-16 sm:-translate-y-20"
              width={250}
              height={281}
              paused={!!selectedGiftId}
            />
            <div className="absolute right-0 top-16 z-20 rotate-[6deg] rounded-2xl bg-white px-3 py-1.5 text-[13px] font-black tracking-tight text-[#4f8f28] shadow-[0_3px_0_rgba(52,100,31,0.25)] sm:right-[-1rem] sm:top-14">
              Ooh, a gift for me?
              <span className="absolute -bottom-1.5 left-4 h-3 w-3 rotate-45 bg-white" />
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.12}>
          <h2 className="mx-auto mt-4 max-w-lg text-xl font-black tracking-tight [@media(max-height:620px)]:mt-2 [@media(max-height:620px)]:text-lg sm:mt-8 sm:text-2xl sm:[@media(max-height:850px)]:mt-3 sm:[@media(max-height:850px)]:text-xl md:mt-3 md:text-xl">
            Select a gift for your friend!
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm font-medium leading-snug text-white/85 [@media(max-height:620px)]:text-xs sm:mt-2 sm:text-base sm:[@media(max-height:850px)]:text-sm md:text-sm">
            Choose the gift they will receive when they join.
          </p>
        </Reveal>

        <Reveal
          delay={0.2}
          className="mt-4 min-h-0 shrink-0 [@media(max-height:620px)]:mt-3 sm:mt-7 sm:[@media(max-height:850px)]:mt-4">
          <div className="mx-auto grid max-w-2xl grid-cols-3 gap-2 min-[380px]:gap-3 sm:[@media(max-height:850px)]:max-w-[28rem]">
            {config.giftOptions.map((gift) => {
              const isSelected = selectedGiftId === gift.id;
              return (
                <button
                  key={gift.id}
                  onClick={() => onSelect(gift.id)}
                  className={`aspect-square w-full overflow-hidden rounded-[18px] border-4 bg-[#8fc36d] p-1 transition-all active:scale-95 min-[380px]:rounded-[22px] ${
                    isSelected
                      ? 'border-white ring-4 ring-inset ring-white/25'
                      : 'border-white/15 hover:border-white/70'
                  }`}
                >
                  <span className="pointer-events-none block h-full w-full">
                    <GiftPreview item={gift.item ?? null} active={isSelected} />
                  </span>
                </button>
              );
            })}
          </div>

          {selected && (
            <div className="mt-3 hidden text-center min-[380px]:block">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/60">
                Selected
              </p>
              <p className="mt-0.5 text-sm font-bold">
                {selected.name || selected.item?.name || selected.itemId}
              </p>
            </div>
          )}
        </Reveal>

        <div
          className="mt-auto"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.75rem)' }}
        >
          <Reveal delay={0.28}>
            <button
              onClick={onSend}
              disabled={!selectedGiftId || creating}
              className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white font-black tracking-tight text-[#4f8f28] shadow-[0_5px_0_rgba(52,100,31,0.2)] transition-colors active:translate-y-0.5 disabled:opacity-60"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Send Invitation
            </button>
          </Reveal>
        </div>
      </div>
    </div>
  );
}

function CloseButton({
  onClose,
  className = '',
}: {
  onClose: () => void;
  className?: string;
}) {
  const handleClose = (
    event:
      | React.PointerEvent<HTMLButtonElement>
      | React.MouseEvent<HTMLButtonElement>
      | React.TouchEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    onClose();
  };

  return (
    <button
      type="button"
      aria-label="Close invite friends"
      onPointerDownCapture={handleClose}
      onTouchStartCapture={handleClose}
      onClickCapture={handleClose}
      className={`absolute z-[80] flex h-14 w-14 items-center justify-center rounded-full ${className}`}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/25 backdrop-blur-sm transition-colors hover:bg-white/35">
        <X className="h-5 w-5" />
      </span>
    </button>
  );
}

function GiftPreview({ item, active = false }: { item: CatalogItem | null; active?: boolean }) {
  if (!item) {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
        <Gift className="h-7 w-7" />
      </div>
    );
  }

  if (item.slot === 'container') {
    return (
      <div className="flex h-full w-full items-center justify-center overflow-visible">
        <div className="h-[170%] w-[170%]">
          <GiftRive color={item.riveIndex} isMilestone={false} paused={!active} />
        </div>
      </div>
    );
  }

  const indices = itemToIndices(item);
  if (!active) {
    return (
      <div className="flex h-full w-full items-center justify-center overflow-visible">
        <FrogSnapshot
          className="h-full w-full"
          width={300}
          height={338}
          indices={indices}
          visualOffsetY={0}
        />
      </div>
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center overflow-visible">
      <Frog width={300} height={338} indices={indices} paused={false} visualOffsetY={0} />
    </div>
  );
}

function RewardPreview({
  reward,
  fallbackItem,
  active = false,
}: {
  reward: QuestReward | null;
  fallbackItem: CatalogItem | null;
  active?: boolean;
}) {
  if (!reward) return <GiftPreview item={fallbackItem} active={active} />;
  if (reward.type === 'FLIES') {
    const amount = reward.amountMode === 'random' ? reward.maxAmount : reward.amount;
    return (
      <div className="flex flex-col items-center gap-1">
        <Fly size={42} y={-2} paused />
        <span className="text-xs font-black text-foreground">+{amount ?? 0}</span>
      </div>
    );
  }
  return <GiftPreview item={fallbackItem} active={active} />;
}

function Loading({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 py-10">
      <button
        onClick={onClose}
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-muted transition-colors hover:bg-muted/80"
      >
        <X className="h-4 w-4" />
      </button>
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  );
}

function legacyReward(reward: RewardTier): QuestReward | null {
  if (reward.flies && reward.flies > 0) {
    return { type: 'FLIES', amountMode: 'fixed', amount: reward.flies };
  }
  if (reward.itemId) return { type: 'ITEM', itemId: reward.itemId };
  return null;
}

function milestonePositionPct(index: number, total: number) {
  if (total <= 1) return 50;
  const clampedIndex = Math.max(0, Math.min(index, total - 1));
  return 18 + (clampedIndex / (total - 1)) * 64;
}

function itemToIndices(item: CatalogItem): Partial<Record<WardrobeSlot, number>> {
  if (item.slot === 'skin') return { skin: item.riveIndex };
  if (item.slot === 'hat') return { hat: item.riveIndex };
  if (item.slot === 'body') return { body: item.riveIndex };
  if (item.slot === 'hand_item') return { hand_item: item.riveIndex };
  return {};
}
