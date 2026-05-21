'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  Gift,
  Loader2,
  X,
} from 'lucide-react';
import useSWR from 'swr';
import Fly from '@/components/ui/fly';
import Frog from '@/components/ui/frog';
import { GiftRive } from '@/components/ui/gift-box/GiftBox';
import { RotatingRays } from '@/components/ui/gift-box/RotatingRays';
import type { QuestReward } from '@/lib/quests/types';
import type { ItemDef, WardrobeSlot } from '@/lib/skins/catalog';

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
  const [mounted, setMounted] = useState(false);
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
        title: config?.shareTitle || 'Come join me on FrogTask!',
        text: config?.shareMessage || 'I have a gift for you on FrogTask. Tap the link to claim it!',
        url,
      };
      try {
        if (typeof navigator !== 'undefined' && (navigator as any).share) {
          await (navigator as any).share(shareData);
          return;
        }
      } catch {
        return;
      }

      try {
        await navigator.clipboard.writeText(url);
      } catch {}
    },
    [config?.shareMessage, config?.shareTitle],
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
            onClick={closeInvite}
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 280 }}
            className="fixed inset-0 z-[201] overflow-hidden bg-black/20 shadow-2xl"
          >
            <div className="mx-auto flex h-full w-full flex-col overflow-hidden bg-background md:my-6 md:h-[calc(100dvh-3rem)] md:w-[min(100vw-3rem,56rem)] md:rounded-[32px]">
              {step === 'overview' && (
                <OverviewStep
                  config={config}
                  claimedCount={status?.claimedCount ?? 0}
                  totalTiers={config?.rewards?.length ?? 0}
                  onClose={closeInvite}
                  onInviteFriends={() => setStep('pick')}
                />
              )}

              {step === 'pick' && (
                <PickStep
                  config={config}
                  selectedGiftId={selectedGiftId}
                  onSelect={setSelectedGiftId}
                  onClose={closeInvite}
                  onBack={() => setStep('overview')}
                  onSend={handleSendInvite}
                  creating={creatingInvite}
                />
              )}

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
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
  if (!config) return <Loading onClose={onClose} />;

  return (
    <div className="flex h-full flex-col">
      <div className="relative min-h-[44dvh] overflow-hidden bg-[#4f9149] px-6 pb-8 pt-6 text-center text-white sm:min-h-[48dvh]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/invitefrog.png"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-[center_35%] md:object-[center_32%] md:opacity-100"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/invitefrog.png"
          alt=""
          className="absolute inset-0 hidden h-full w-full object-cover object-[center_32%] md:block"
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0%,transparent_48%,rgba(0,0,0,0.22)_72%,rgba(0,0,0,0.62)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-[50%] bg-gradient-to-b from-transparent via-black/30 to-black/76" />
        <CloseButton onClose={onClose} className="left-4 top-4 text-white" />
        <div className="relative z-10 mx-auto flex h-full min-h-[32dvh] max-w-xl flex-col items-center justify-end">
          <h2 className="text-3xl font-black tracking-tight [text-shadow:0_2px_0_rgba(25,83,43,0.75),0_4px_14px_rgba(0,0,0,0.32)]">
            {config.headline}
          </h2>
          <p className="mt-2 max-w-md text-sm font-bold text-white [text-shadow:0_1px_0_rgba(25,83,43,0.85),0_3px_10px_rgba(0,0,0,0.28)]">
            {config.subheading}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6 pt-7">
        {config.rewards.length > 0 && (
          <RewardProgressTrack
            rewards={config.rewards}
            claimedCount={claimedCount}
            totalTiers={totalTiers}
          />
        )}
      </div>

      <div
        className="border-t border-border/40 bg-background p-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
      >
        <button
          onClick={onInviteFriends}
          disabled={!config.giftOptions?.length}
          className="h-12 w-full rounded-2xl bg-emerald-500 font-black tracking-tight text-white transition-colors hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-60"
        >
          {config.giftOptions?.length ? 'Invite friends' : 'No gifts configured yet'}
        </button>
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
  const initialProgressPct = 2.5;
  const progressEnd =
    claimedCount <= 0
      ? initialProgressPct
      : ((firstPos - railStart) / railSpan) * 100 +
        progressPct * ((lastPos - firstPos) / railSpan);

  return (
    <div className="mx-auto max-w-2xl px-1 pt-0">
      <div className="relative mx-auto h-48">
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
                className={`flex h-20 w-20 items-center justify-center rounded-[22px] border-4 bg-card shadow-sm transition-colors sm:h-24 sm:w-24 ${
                  claimedCount >= reward.tier ? 'border-primary/40' : 'border-muted'
                }`}
              >
                <RewardPreview
                  reward={reward.rewards?.[0] ?? legacyReward(reward)}
                  fallbackItem={reward.item ?? null}
                  active={isLastReward}
                />
              </div>
            </div>
          );
        })}

        <div
          className="absolute top-[112px] h-3 -translate-y-1/2 rounded-full bg-muted"
          style={{ left: `${railStart}%`, width: `${railSpan}%` }}
        />
        <div
          className="absolute top-[112px] h-3 -translate-y-1/2 overflow-hidden rounded-full"
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
                className="absolute top-[112px] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                style={{ left: `${pos}%` }}
              >
                <div
                  className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
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
                className="absolute top-[142px] -translate-x-1/2"
                style={{ left: `${pos}%` }}
              >
                <p className="w-24 text-center text-[11px] font-black text-muted-foreground sm:text-xs">
                  {reward.label}
                </p>
              </div>
            );
        })}
      </div>
      <p className="-mt-4 text-center text-sm font-black text-muted-foreground">
        {claimedCount} of {totalTiers} friends joined
      </p>
    </div>
  );
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
    <div className="relative flex h-full flex-col overflow-hidden bg-[#8fc36d] px-5 pb-5 pt-4 text-center text-white">
      <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
        <CloseButton onClose={onBack} className="left-[-0.5rem] top-1 text-white" />

        <div className="relative mx-auto mt-10 flex h-52 w-full max-w-md items-center justify-center overflow-visible rounded-[28px] bg-[radial-gradient(circle_at_center,rgba(225,255,194,0.95),rgba(133,190,92,0.15)_42%,transparent_72%)]">
          <div className="absolute inset-[-24px] opacity-55 [mask-image:radial-gradient(circle_at_center,black_0%,black_36%,transparent_72%)] [webkit-mask-image:radial-gradient(circle_at_center,black_0%,black_36%,transparent_72%)]">
            <RotatingRays colorClass="text-white/18" />
          </div>
          <div className="relative z-10 -translate-y-3">
            <Frog width={250} height={190} />
            <div className="absolute right-4 top-12 z-20 rotate-[6deg] rounded-2xl bg-white px-3 py-1.5 text-[13px] font-black tracking-tight text-[#4f8f28] shadow-[0_3px_0_rgba(52,100,31,0.25)] sm:right-2">
              What do I get?
              <span className="absolute -bottom-1.5 left-4 h-3 w-3 rotate-45 bg-white" />
            </div>
          </div>
        </div>

        <h2 className="mx-auto mt-8 max-w-lg text-2xl font-black tracking-tight">
          Select a gift for your friend!
        </h2>
        <p className="mx-auto mt-2 max-w-md text-base font-medium leading-snug text-white/85">
          Choose the gift they will receive when they join.
        </p>

        <div className="mt-7 min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-2xl flex-wrap justify-center gap-3">
            {config.giftOptions.map((gift) => {
              const isSelected = selectedGiftId === gift.id;
              return (
                <button
                  key={gift.id}
                  onClick={() => onSelect(gift.id)}
                  className={`aspect-square w-[32%] min-w-[112px] max-w-[150px] overflow-visible rounded-[22px] border-4 bg-[#8fc36d] p-1 transition-all active:scale-95 ${
                    isSelected
                      ? 'border-white ring-4 ring-inset ring-white/25'
                      : 'border-white/15 hover:border-white/70'
                  }`}
                >
                  <GiftPreview item={gift.item ?? null} active={isSelected} />
                </button>
              );
            })}
          </div>

          {selected && (
            <div className="mt-4 text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/60">
                Selected
              </p>
              <p className="mt-0.5 text-sm font-bold">
                {selected.name || selected.item?.name || selected.itemId}
              </p>
            </div>
          )}
        </div>

        <div style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <button
            onClick={onSend}
            disabled={!selectedGiftId || creating}
            className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white font-black tracking-tight text-[#4f8f28] shadow-[0_5px_0_rgba(52,100,31,0.2)] transition-colors active:translate-y-0.5 disabled:opacity-60"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Send Invitation
          </button>
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
        <div className="h-[155%] w-[155%]">
          <GiftRive color={item.riveIndex} isMilestone={false} paused={!active} />
        </div>
      </div>
    );
  }

  const indices = itemToIndices(item);
  return (
    <div className="flex h-full w-full items-center justify-center overflow-visible">
      <Frog width={230} height={172} indices={indices} paused={!active} />
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
      <div className="flex flex-col items-center gap-0.5">
        <Fly size={28} y={-2} paused />
        <span className="text-[10px] font-black text-foreground">+{amount ?? 0}</span>
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
        className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-muted transition-colors hover:bg-muted/80"
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
