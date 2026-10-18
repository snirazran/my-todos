'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AppImage } from '@/components/ui/AppImage';
import {
  motion,
  AnimatePresence,
  useAnimationControls,
  useReducedMotion,
} from 'framer-motion';
import {
  Check,
  ChevronRight,
  Gift,
  Loader2,
  X,
} from 'lucide-react';
import useSWR from 'swr';
import Frog, { type FrogHandle } from '@/components/ui/frog';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { GiftOutfitPreview } from '@/components/ui/friends/GiftOutfitPreview';
import { GiftRive } from '@/components/ui/gift-box/GiftBox';
import { RARITY_CONFIG } from '@/components/ui/gift-box/constants';
import { RarityBadge } from '@/components/ui/skins/RarityBadge';
import { TileArt } from '@/components/ui/skins/DressingRoom';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { DEFAULT_BACKGROUND_IMAGES } from '@/lib/backgrounds/constants';
import { hapticSelect } from '@/lib/haptics';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import type { QuestReward } from '@/lib/quests/types';
import type { ItemDef } from '@/lib/skins/catalog';
import { trackAnalyticsEvent } from '@/lib/analytics/client';
import { shareLink } from '@/lib/share';
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
type SentVia = 'shared' | 'copied';

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

  const [step, setStep] = useState<Step>('pick');
  const [selectedGiftId, setSelectedGiftId] = useState<string | null>(null);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [sentVia, setSentVia] = useState<SentVia | null>(null);
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
  const giftOptions = config?.giftOptions ?? [];
  const activeGift =
    giftOptions.find((gift) => gift.id === selectedGiftId) ?? giftOptions[0] ?? null;

  useEffect(() => {
    if (!open) return;
    setStep('pick');
    setInviteError(null);
    setSelectedGiftId(null);
    setSentVia(null);
  }, [open]);

  const handleSelectGift = (id: string) => {
    if (id === activeGift?.id) return;
    hapticSelect();
    setSelectedGiftId(id);
    setSentVia(null);
    setInviteError(null);
  };

  const shareInviteUrl = React.useCallback(async (url: string, giftName: string | null) => {
    const result = await shareLink({
      title: 'A gift for you on Frogress',
      text: giftName
        ? `I picked a gift for you on Frogress: the ${giftName} 🎁 Join with my link to claim it!`
        : 'I picked a gift for you on Frogress 🎁 Join with my link to claim it!',
      url,
      dialogTitle: 'Send a gift',
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
    if (!activeGift) return;
    setCreatingInvite(true);
    setInviteError(null);
    setSentVia(null);
    try {
      const res = await fetch('/api/invite/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ giftOptionId: activeGift.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create invite');

      const url =
        typeof window !== 'undefined'
          ? `${window.location.origin}/?ref=${encodeURIComponent(data.code)}`
          : `/?ref=${encodeURIComponent(data.code)}`;
      void refreshStatus();
      const result = await shareInviteUrl(url, giftDisplayName(activeGift));
      if (result === 'shared' || result === 'copied') setSentVia(result);
      else if (result === 'failed') setInviteError('Could not share your gift link. Try again.');
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
                      onPickGift={() => setStep('pick')}
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
                      claimedCount={claimedCount}
                      gift={activeGift}
                      onSelect={handleSelectGift}
                      onClose={closeInvite}
                      onOpenRewards={() => setStep('overview')}
                      onSend={handleSendInvite}
                      creating={creatingInvite}
                      sentVia={sentVia}
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
  onPickGift,
  ready,
}: {
  config?: InviteConfig;
  claimedCount: number;
  totalTiers: number;
  onClose: () => void;
  onPickGift: () => void;
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
            Your thank-you rewards
          </h2>
          <p className="mt-1.5 max-w-md text-[13px] font-medium text-white/95 [text-shadow:0_1px_0_rgba(25,83,43,0.7),0_3px_10px_rgba(0,0,0,0.28)] sm:mt-2 sm:text-[15px]">
            Earn these as friends join with your gifts.
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
            onClick={onPickGift}
            disabled={!config.giftOptions?.length}
            className={GIFT_CTA}
          >
            <Gift className="h-5 w-5" strokeWidth={2.5} aria-hidden />
            {config.giftOptions?.length ? 'Pick a gift' : 'No gifts configured yet'}
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

const GIFT_CTA =
  'flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[#447d3f] px-4 text-[15px] font-black tracking-tight text-white shadow-[0_4px_0_0_#2c511a] transition-all hover:bg-[#5aa354] active:translate-y-1 active:shadow-none disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';

function giftDisplayName(gift: GiftOption | null) {
  if (!gift) return null;
  return gift.name || gift.item?.name || 'Welcome outfit';
}

function PickStep({ ready, config, claimedCount, gift, onSelect, onClose, onOpenRewards, onSend, creating, error, sentVia }: {
  ready: boolean; config?: InviteConfig; claimedCount: number; gift: GiftOption | null; onSelect: (id: string) => void;
  onClose: () => void; onOpenRewards: () => void; onSend: () => void; creating: boolean; error?: string | null;
  sentVia: SentVia | null;
}) {
  if (!config) return <Loading onClose={onClose} />;
  const giftName = giftDisplayName(gift);
  const nextReward = config.rewards.find((reward) => reward.tier > claimedCount) ?? null;
  return (
    <div role="dialog" aria-modal="true" aria-label="Choose a welcome gift" className="flex h-full min-h-0 flex-col bg-background text-foreground md:max-h-[calc(100dvh-2rem)]">
      <GiftStage gift={gift} ready={ready} onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-2">
        <p className="text-center text-[13px] font-semibold text-muted-foreground">
          Free for them when they join with your link
        </p>
        <div role="group" aria-label="Welcome outfits" className="mt-4 grid grid-cols-3 gap-x-2.5 gap-y-4 min-[520px]:grid-cols-4">
          {config.giftOptions.map((option) => (
            <GiftTile
              key={option.id}
              gift={option}
              chosen={option.id === gift?.id}
              ready={ready}
              onSelect={() => onSelect(option.id)}
            />
          ))}
        </div>
        {!config.giftOptions.length && <p role="status" className="py-8 text-center text-[13px] font-medium text-muted-foreground">Welcome gifts are being restocked. Try again a little later.</p>}
      </div>
      <div className="shrink-0 border-t border-border/50 bg-background px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-3">
        {nextReward && <NextRewardRow reward={nextReward} onClick={onOpenRewards} />}
        <AnimatePresence initial={false} mode="wait">
          {error ? (
            <motion.p key="error" role="alert" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-2.5 text-center text-[12.5px] font-bold text-destructive">
              {error}
            </motion.p>
          ) : sentVia ? (
            <motion.p key={sentVia} role="status" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-2.5 flex items-center justify-center gap-1.5 text-[12.5px] font-black text-primary">
              <Check className="h-4 w-4" strokeWidth={3} aria-hidden />
              {sentVia === 'copied' ? 'Link copied. Paste it to a friend.' : 'Gift sent! They get it when they join.'}
            </motion.p>
          ) : null}
        </AnimatePresence>
        <button type="button" onClick={onSend} disabled={!gift || creating} className={GIFT_CTA}>
          {creating ? <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden /> : <Gift className="h-5 w-5 shrink-0" strokeWidth={2.5} aria-hidden />}
          <span className="truncate">
            {creating ? 'Wrapping their gift…' : sentVia ? 'Send to another friend' : giftName ? `Send the ${giftName}` : 'No gifts yet'}
          </span>
        </button>
      </div>
    </div>
  );
}

function PondBackdrop() {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <div className="h-full w-full bg-gradient-to-b from-sky-200 via-emerald-100 to-emerald-200 dark:from-sky-950 dark:via-emerald-950 dark:to-emerald-900" />;
  }
  return (
    <picture className="block h-full w-full">
      <source media="(min-width: 768px)" srcSet={DEFAULT_BACKGROUND_IMAGES.tablet} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={DEFAULT_BACKGROUND_IMAGES.mobile}
        alt=""
        draggable={false}
        onError={() => setFailed(true)}
        className="h-full w-full object-cover object-bottom"
      />
    </picture>
  );
}

function GiftStage({ gift, ready, onClose }: { gift: GiftOption | null; ready: boolean; onClose: () => void }) {
  const reduceMotion = useReducedMotion();
  const roomy = useMediaQuery('(min-width: 380px)');
  const hop = useAnimationControls();
  const frogRef = React.useRef<FrogHandle | null>(null);
  const [dressed, setDressed] = useState(false);
  const shownGiftRef = React.useRef<string | null>(null);
  const item = gift?.item ?? null;
  const isBox = item?.slot === 'container';
  const live = ready && !reduceMotion;
  const frogWidth = roomy ? 248 : 216;
  const frogHeight = Math.round(frogWidth * 1.125);
  const indices = React.useMemo(() => giftPreviewIndices(item), [item]);

  useEffect(() => {
    const id = gift?.id ?? null;
    const previous = shownGiftRef.current;
    shownGiftRef.current = id;
    if (!id || !previous || previous === id || reduceMotion) return;
    void hop.start({
      y: [0, -18, 0, 0],
      scaleX: [1, 0.96, 1.05, 1],
      scaleY: [1, 1.05, 0.94, 1],
      transition: { duration: 0.5, times: [0, 0.38, 0.72, 1], ease: 'easeOut' },
    });
    frogRef.current?.fireEmote('love');
  }, [gift?.id, hop, reduceMotion]);

  return (
    <div className="relative h-[calc(env(safe-area-inset-top)+clamp(12rem,31dvh,15rem))] shrink-0 overflow-hidden md:h-60">
      <div className="absolute inset-0">
        <PondBackdrop />
        <div className="absolute inset-0 dark:bg-black/20" />
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/45 via-black/15 to-transparent" />
      </div>

      <div className="absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 px-5 pt-[calc(env(safe-area-inset-top)+1rem)] md:pt-5">
        <div className="min-w-0 text-white [text-shadow:0_1px_0_rgba(25,83,43,0.55),0_2px_12px_rgba(0,0,0,0.35)]">
          <p className="text-[12px] font-black text-white/90">A welcome gift from you</p>
          <h2 className="mt-0.5 text-[23px] font-black leading-tight tracking-tight">Pick their first look</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close gift picker"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-black/25 text-white backdrop-blur-sm transition-colors hover:bg-black/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <span aria-hidden className="absolute bottom-[13px] left-1/2 z-10 h-4 w-32 -translate-x-1/2 rounded-[50%] bg-black/25 blur-[6px]" />
      <svg
        aria-hidden
        preserveAspectRatio="none"
        viewBox="0 0 100 16"
        className="absolute inset-x-0 bottom-[-1px] z-10 h-5 w-full fill-background"
      >
        <path d="M0 0 Q50 12 100 0 L100 16 L0 16 Z" />
      </svg>

      <div className="pointer-events-none absolute inset-x-0 bottom-[6px] z-20 flex justify-center">
        <motion.div animate={hop} style={{ transformOrigin: '50% 100%' }}>
          {isBox && item ? (
            <div className="h-[150px] w-[150px]">
              <GiftRive width={150} height={150} color={item.riveIndex} isMilestone={false} paused={!live} />
            </div>
          ) : (
            <div className="relative" style={{ width: frogWidth, height: frogHeight }}>
              {reduceMotion && (
                <div className="absolute inset-0">
                  <FrogSnapshot width={frogWidth} height={frogHeight} indices={indices} cachedOnly={!ready} />
                </div>
              )}
              {live && (
                <div className={cn('absolute inset-0 transition-opacity duration-200', dressed ? 'opacity-100' : 'opacity-0')}>
                  <Frog
                    ref={frogRef}
                    width={frogWidth}
                    height={frogHeight}
                    indices={indices}
                    onDressed={() => setDressed(true)}
                  />
                </div>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function GiftTile({ gift, chosen, ready, onSelect }: {
  gift: GiftOption; chosen: boolean; ready: boolean; onSelect: () => void;
}) {
  const item = gift.item ?? null;
  const name = giftDisplayName(gift);
  return (
    <button
      type="button"
      aria-pressed={chosen}
      aria-label={`Choose ${name}${item?.rarity ? ', ' + RARITY_CONFIG[item.rarity].label : ''}`}
      onClick={onSelect}
      className="group flex min-w-0 touch-manipulation flex-col items-center gap-1.5 rounded-2xl text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      <TileArt
        rarity={item?.rarity ?? 'common'}
        className={cn(
          'transition-transform duration-150 group-active:scale-95',
          chosen && 'ring-[3px] ring-primary dark:ring-primary',
        )}
      >
        {item && !isContainer(item) ? (
          <span className="absolute inset-0 flex items-end justify-center">
            <FrogSnapshot
              className="pointer-events-none shrink-0"
              indices={giftPreviewIndices(item)}
              width="124%"
              height="124%"
              cachedOnly={!ready}
            />
          </span>
        ) : (
          <span className="absolute inset-0">
            <GiftOutfitPreview item={item} ready={ready} />
          </span>
        )}
        {chosen && (
          <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm">
            <Check className="h-3 w-3" strokeWidth={4} aria-hidden />
          </span>
        )}
      </TileArt>
      <span className={cn('w-full truncate px-0.5 text-[12px] font-black leading-tight', chosen ? 'text-primary' : 'text-foreground')}>
        {name}
      </span>
      <RarityBadge rarity={item?.rarity} className="-mt-0.5" />
    </button>
  );
}

function isContainer(item: CatalogItem) {
  return item.slot === 'container';
}

function NextRewardRow({ reward, onClick }: { reward: RewardTier; onClick: () => void }) {
  const flies = rewardFlies(reward);
  const prize = [reward.item?.name, flies].filter(Boolean).join(' + ') || 'A reward';
  const ordinal = reward.label.replace(/\s*friend.*$/i, '').trim() || 'next';
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-3 flex w-full items-center gap-3 rounded-2xl text-left transition-opacity active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {reward.item ? (
        <span className={cn('relative flex h-10 w-10 shrink-0 items-end justify-center overflow-hidden rounded-xl bg-gradient-to-br', RARITY_CONFIG[reward.item.rarity ?? 'common'].gradient)}>
          {isContainer(reward.item) ? (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="h-[124%] w-[124%] -translate-y-[13%]">
                <GiftRive className="h-full w-full" color={reward.item.riveIndex} paused />
              </span>
            </span>
          ) : (
            <span className="shrink-0">
              <FrogSnapshot width={52} height={52} indices={giftPreviewIndices(reward.item)} visualOffsetY={0} />
            </span>
          )}
        </span>
      ) : (
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/[0.12]">
          <img src="/fly.svg" width={26} height={26} alt="" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-black leading-tight text-foreground">{prize} for you</span>
        <span className="mt-0.5 block truncate text-[12.5px] font-semibold text-muted-foreground">When your {ordinal} friend joins</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
    </button>
  );
}

function rewardFlies(reward: RewardTier): string | null {
  for (const r of reward.rewards ?? []) {
    if (r.type !== 'FLIES') continue;
    if (r.amountMode === 'random' && r.maxAmount) return `up to ${r.maxAmount} flies`;
    if (r.amount) return `${r.amount} flies`;
  }
  return reward.flies ? `${reward.flies} flies` : null;
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
