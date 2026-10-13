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
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { GiftOutfitPreview } from '@/components/ui/friends/GiftOutfitPreview';
import { RarityBadge } from '@/components/ui/skins/RarityBadge';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import type { QuestReward } from '@/lib/quests/types';
import type { ItemDef } from '@/lib/skins/catalog';
import { trackAnalyticsEvent } from '@/lib/analytics/client';
import { shareLink } from '@/lib/share';
import { POND_PRIMARY } from '@/components/ui/friends/PondSocial';
import { cn } from '@/lib/utils';
import { giftPreviewIndices } from '@/lib/friends/social';

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
  const [entered, setEntered] = useState(false);
  const reduceMotion = useReducedMotion();
  useEffect(() => setMounted(true), []);

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
  const [inviteError, setInviteError] = useState<string | null>(null);
  const closeInvite = React.useCallback(() => {
    onClose();
  }, [onClose]);

  // A click is dispatched on the nearest surviving ancestor when the pressed
  // element is re-rendered away mid-tap, so the scrim only dismisses when the
  // press started on it too.
  const scrimPressRef = React.useRef(false);
  const onScrimPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      scrimPressRef.current = event.target === event.currentTarget;
    },
    [],
  );
  const onScrimClick = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const pressed = scrimPressRef.current;
      scrimPressRef.current = false;
      if (pressed && event.target === event.currentTarget) closeInvite();
    },
    [closeInvite],
  );

  useEffect(() => {
    if (!open) setEntered(false);
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeInvite();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeInvite, open]);

  const totalTiers = config?.rewards?.length ?? 0;
  const claimedCount = status?.claimedCount ?? 0;
  const allRewardsClaimed = totalTiers > 0 && claimedCount >= totalTiers;
  const autoSkippedRef = React.useRef(false);

  useEffect(() => {
    if (!open) return;
    setStep('overview');
    setInviteError(null);
    setSelectedGiftId(null);
    autoSkippedRef.current = false;
  }, [open]);

  // With every tier already earned the reward track has nothing left to
  // promise, so it's a page you tap straight through — open on the gift
  // picker instead. Latched per-open so Back still works from there.
  useEffect(() => {
    if (!open || !allRewardsClaimed || autoSkippedRef.current) return;
    autoSkippedRef.current = true;
    setStep('pick');
  }, [open, allRewardsClaimed]);

  const shareInviteUrl = React.useCallback(async (url: string) => {
    const result = await shareLink({
      title: 'Come join me on Frogress!',
      text: 'I have a gift for you on Frogress. Tap the link to claim it!',
      url,
      dialogTitle: 'Invite a friend',
    });
    if (result === 'shared' || result === 'copied') {
      trackAnalyticsEvent('referral_invite_shared', {
        method: result === 'shared' ? 'native_share' : 'copy_link',
        share_surface: 'invite_rewards',
      });
    }
    return result;
  }, []);

  const handleSendInvite = async () => {
    if (!selectedGiftId) return;
    setCreatingInvite(true);
    setInviteError(null);
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
      setInviteError('Could not create your gift invite. Try again.');
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
            onPointerDown={onScrimPointerDown}
            onClick={onScrimClick}
            className="fixed inset-0 z-[1400] bg-black/70"
          />
          <motion.div
            variants={{ hidden: { y: reduceMotion ? 0 : '100%', opacity: 0 }, visible: { y: 0, opacity: 1 }, exit: { y: reduceMotion ? 0 : '100%', opacity: 0 } }}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ type: 'tween', duration: reduceMotion ? 0.1 : 0.36, ease: [0.32, 0.72, 0, 1] }}
            onAnimationComplete={(definition) => { if (definition === 'visible') setEntered(true); }}
            className="pointer-events-none fixed inset-0 z-[1401] flex will-change-transform md:items-center md:justify-center md:p-4 lg:p-6"
          >
            <div className="pointer-events-auto mx-auto flex h-full min-h-0 w-full flex-col overflow-hidden bg-background md:h-auto md:max-h-[calc(100dvh-2rem)] md:w-[min(100vw-2rem,32rem)] md:rounded-[32px] md:shadow-2xl lg:max-h-[calc(100dvh-3rem)] lg:w-[min(100vw-3rem,32rem)]">
              <AnimatePresence mode="wait">
                {step === 'overview' && (
                  <StepShell key="overview">
                    {(stepEntered) => (
                    <OverviewStep
                      ready={entered && stepEntered}
                      config={config}
                      claimedCount={claimedCount}
                      totalTiers={totalTiers}
                      onClose={closeInvite}
                      onInviteFriends={() => setStep('pick')}
                    />
                    )}
                  </StepShell>
                )}

                {step === 'pick' && (
                  <StepShell key="pick">
                    {(stepEntered) => (
                    <PickStep
                      ready={entered && stepEntered}
                      error={inviteError}
                      config={config}
                      selectedGiftId={selectedGiftId}
                      onSelect={setSelectedGiftId}
                      onClose={closeInvite}
                      onBack={
                        allRewardsClaimed ? closeInvite : () => setStep('overview')
                      }
                      onSend={handleSendInvite}
                      creating={creatingInvite}
                    />
                    )}
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

function StepShell({ children }: { children: (entered: boolean) => React.ReactNode }) {
  const [entered, setEntered] = useState(false);
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, x: reduceMotion ? 0 : 32 }, visible: { opacity: 1, x: 0 } }}
      initial="hidden"
      animate="visible"
      onAnimationComplete={(definition) => { if (definition === 'visible') setEntered(true); }}
      exit={{ opacity: 0, transition: { duration: 0.09, ease: 'easeIn' } }}
      transition={{ type: 'tween', duration: reduceMotion ? 0.1 : 0.22, ease: 'easeOut' }}
      className="relative flex h-full min-h-0 flex-1 flex-col will-change-transform"
    >
      {children(entered)}
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
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: 'spring',
        stiffness: 400,
        damping: 30,
        mass: 0.7,
        delay: delay * 0.45,
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
  ready,
}: {
  config?: InviteConfig;
  claimedCount: number;
  totalTiers: number;
  onClose: () => void;
  onInviteFriends: () => void;
  ready: boolean;
}) {
  const reduceMotion = useReducedMotion();
  if (!config) return <Loading onClose={onClose} />;

  return (
    <div className="flex h-full min-h-0 flex-col md:max-h-[calc(100dvh-2rem)] lg:max-h-[calc(100dvh-3rem)]">
      <div className="relative flex h-[clamp(8.5rem,36dvh,19rem)] shrink-0 flex-col justify-end overflow-hidden bg-[#447d3f] px-6 pb-7 pt-6 text-center text-white sm:h-[clamp(9rem,38dvh,20rem)] md:h-[clamp(8rem,32dvh,16rem)] md:pb-6 lg:h-[clamp(8.5rem,32dvh,17rem)]">
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
              ready={ready}
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
            className="h-12 w-full rounded-2xl bg-[#447d3f] font-black tracking-tight text-white shadow-[0_4px_0_0_#2c511a] transition-all hover:bg-[#5aa354] active:translate-y-1 active:shadow-none disabled:opacity-60"
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
  ready,
}: {
  rewards: RewardTier[];
  claimedCount: number;
  totalTiers: number;
  ready: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const progressPct =
    totalTiers > 0 ? Math.min(100, Math.max(0, (claimedCount / totalTiers) * 100)) : 0;
  const firstPos = milestonePositionPct(0, rewards.length);
  const lastPos = milestonePositionPct(rewards.length - 1, rewards.length);
  const railStart = 8;
  const railEnd = 92;
  const railSpan = railEnd - railStart;
  const initialProgressPct = 6;
  // The last milestone sits inset from the rail's end, so tracking it exactly
  // left a dead grey tail after the final friend joined. Once every tier is
  // claimed the fill runs the whole rail — the track reads as completed
  // rather than stuck one step short.
  const progressEnd =
    claimedCount <= 0
      ? initialProgressPct
      : claimedCount >= totalTiers
        ? 100
        : ((firstPos - railStart) / railSpan) * 100 +
          progressPct * ((lastPos - firstPos) / railSpan);

  const nextReward =
    rewards.find((r) => r.tier > claimedCount) ?? rewards[rewards.length - 1] ?? null;

  return (
    <div className="mx-auto max-w-2xl px-1 pt-0">
      <div className="relative mx-auto h-[clamp(9rem,26dvh,14rem)] [--card-size:clamp(3.75rem,20vw,7rem)] [--label-top:calc(var(--rail-top)+1.75rem)] [--rail-top:calc(var(--card-size)+1.1rem)] min-[380px]:h-[clamp(10.25rem,28dvh,14rem)] min-[380px]:[--card-size:clamp(4.5rem,13dvh,7rem)] min-[380px]:[--label-top:calc(var(--rail-top)+2rem)] min-[380px]:[--rail-top:calc(var(--card-size)+1.35rem)]">
        {rewards.map((reward, index) => {
          const pos = milestonePositionPct(index, rewards.length);
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
                      ready={ready}
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
            animate={reduceMotion ? undefined : {
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
                <div className="mt-1 flex justify-center"><RarityBadge rarity={reward.item?.rarity} /></div>
              </div>
            );
        })}
      </div>

      {nextReward && (
        <div className="mt-2 text-center">
          <p className="text-[13px] font-black text-muted-foreground/70">
            Your rewards
          </p>
          <p className="mx-auto mt-2 max-w-sm text-base font-medium leading-snug text-foreground">
            {rewardSentence(nextReward)}
          </p>
          <RarityBadge rarity={nextReward.item?.rarity} className="mt-2" />
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

function PickStep({ ready, config, selectedGiftId, onSelect, onClose, onBack, onSend, creating, error }: {
  ready: boolean; config?: InviteConfig; selectedGiftId: string | null; onSelect: (id: string) => void;
  onClose: () => void; onBack: () => void; onSend: () => void; creating: boolean; error?: string | null;
}) {
  if (!config) return <Loading onClose={onClose} />;
  const selected = config.giftOptions.find((gift) => gift.id === selectedGiftId) ?? null;
  return (
    <div role="dialog" aria-modal="true" aria-label="Choose a welcome gift" className="flex h-full min-h-0 flex-col bg-background text-foreground md:max-h-[calc(100dvh-2rem)]">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/50 px-5 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)] md:pt-5">
        <div><p className="text-[11px] font-bold text-primary">A welcome gift, from you</p><h2 className="mt-1 text-xl font-black tracking-tight">Pick their first look</h2></div>
        <button type="button" onClick={onClose} aria-label="Close gift picker" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><X className="h-5 w-5" aria-hidden /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">
        <div className="relative mt-4 flex h-[146px] items-center justify-center overflow-hidden rounded-[22px] bg-gradient-to-b from-primary/10 to-primary/[0.03]">
          <div className="h-full w-[160px]">{selected ? <GiftOutfitPreview item={selected.item} ready={ready} /> : <FrogSnapshot width={160} height={150} indices={giftPreviewIndices(null)} visualOffsetY={0} cachedOnly={!ready} />}</div>
          <div className="absolute bottom-3 right-3 flex max-w-[50%] flex-col items-end gap-1"><RarityBadge rarity={selected?.item?.rarity} /><span className="rounded-full border border-border/50 bg-card px-2.5 py-1.5 text-[11px] font-bold text-primary">Their new pond look</span></div>
        </div>
        <p className="mb-4 mt-4 text-[13px] font-medium leading-relaxed text-muted-foreground">Choose an outfit, then share their gift invite. It’s free for them to claim when they join.</p>
        <div role="group" aria-label="Welcome outfits" className="grid grid-cols-2 gap-3 min-[440px]:grid-cols-3">
          {config.giftOptions.map((gift) => {
            const chosen = gift.id === selectedGiftId;
            return <button key={gift.id} type="button" aria-pressed={chosen} aria-label={'Choose ' + (gift.name || gift.item?.name || 'this outfit') + (gift.item?.rarity ? ', ' + gift.item.rarity : '')} onClick={() => onSelect(gift.id)} className={cn('relative flex min-w-0 touch-manipulation flex-col overflow-hidden rounded-2xl border-2 p-2 text-left transition-[border-color,background-color,transform] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2', chosen ? 'border-primary bg-primary/5' : 'border-border/60 bg-card hover:border-primary/40')}>
              <span className="pointer-events-none block aspect-square w-full overflow-hidden rounded-xl bg-muted/40"><GiftOutfitPreview item={gift.item} ready={ready} /></span>
              <span className="mt-2 text-[12px] font-black leading-tight">{gift.name || gift.item?.name || 'Welcome outfit'}</span><RarityBadge rarity={gift.item?.rarity} className="mt-1.5" />
              {chosen && <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /></span>}
            </button>;
          })}
        </div>
        {!config.giftOptions.length && <p role="status" className="py-8 text-center text-[13px] font-medium text-muted-foreground">Welcome gifts are being restocked. Try again a little later.</p>}
        <button type="button" onClick={onBack} className="mt-4 min-h-11 text-[12px] font-bold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">See your invite rewards</button>
      </div>
      <div className="shrink-0 border-t border-border/50 bg-card px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-4">
        {error && <p role="alert" className="mb-3 text-[12px] font-bold text-destructive">{error}</p>}
        <button type="button" onClick={onSend} disabled={!selected || creating} className={cn(POND_PRIMARY, 'min-h-12 w-full rounded-2xl text-[14px]')}>{creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Gift className="h-4 w-4" aria-hidden />}{creating ? 'Preparing their gift…' : selected ? 'Share this gift invite' : 'Choose an outfit above'}</button>
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

function RewardPreview({ reward, fallbackItem, ready }: {
  reward: QuestReward | null; fallbackItem: CatalogItem | null; ready: boolean;
}) {
  if (fallbackItem) return <GiftOutfitPreview item={fallbackItem} ready={ready} />;
  if (reward?.type === 'FLIES') {
    const amount = reward.amountMode === 'random' ? reward.maxAmount : reward.amount;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1">
        <img src="/fly.svg" width={42} height={42} alt="" />
        <span className="text-xs font-black text-foreground">+{amount ?? 0}</span>
      </div>
    );
  }
  return <GiftOutfitPreview item={null} ready={ready} />;
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
