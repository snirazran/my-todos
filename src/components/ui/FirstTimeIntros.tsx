'use client';

import dynamic from 'next/dynamic';
import { Check, Clock, Plus } from 'lucide-react';
import { Icon as AppIcon } from '@/components/ui/Icon';
import { BaseSheet } from '@/components/ui/BaseSheet';
import Fly from '@/components/ui/fly';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import {
  FLIES_PER_PENALTY,
  MAX_HUNGER_MS,
  TASK_HUNGER_REWARD_MS,
} from '@/lib/hungerLogic';

const Frog = dynamic(() => import('@/components/ui/frog'), { ssr: false });

function IntroShell({
  open,
  onClose,
  zIndex,
  children,
}: {
  open: boolean;
  onClose: () => void;
  zIndex?: number;
  children: React.ReactNode;
}) {
  return (
    <BaseSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      zIndex={zIndex}
      className="md:max-w-md"
    >
      {() => (
        <div className="max-h-[calc(100dvh-6rem)] overflow-y-auto overscroll-contain px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-2">
          {children}
        </div>
      )}
    </BaseSheet>
  );
}

function IntroCta({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-2xl bg-primary text-[15px] font-black text-primary-foreground shadow-[0_4px_0_0_#34631f] transition-all hover:brightness-105 active:translate-y-[2px] active:shadow-none"
    >
      {label}
    </button>
  );
}

// The user's dressed frog perched on the first row card, fly at its shoulder
// — the shared visual signature of these one-time explainers.
function FrogPerch({ open }: { open: boolean }) {
  const { indices } = useWardrobeIndices(open);
  return (
    <div className="pointer-events-none relative z-10 -mb-[12px] -mt-3 flex justify-center">
      <div className="relative translate-y-[20px]">
        <Frog
          width={132}
          height={148}
          indices={indices}
          paused={!open}
          visualOffsetY={0}
        />
        <span className="absolute -left-7 top-9 animate-[fly-bob_2.2s_ease-in-out_infinite] motion-reduce:animate-none">
          <Fly size={34} alwaysPlay interactive={false} oversample={1.5} />
        </span>
      </div>
    </div>
  );
}

function IntroRows({
  rows,
}: {
  rows: { icon: React.ReactNode; text: React.ReactNode }[];
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map(({ icon, text }, index) => (
        <div
          key={index}
          className="flex items-center gap-3 rounded-2xl border border-border/50 bg-muted/30 px-3.5 py-2.5"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            {icon}
          </span>
          <p className="text-[13px] font-semibold leading-snug text-foreground [&>b]:font-black">
            {text}
          </p>
        </div>
      ))}
    </div>
  );
}

const HUNGER_HOURS_PER_TASK = Math.round(TASK_HUNGER_REWARD_MS / 3_600_000);
const FULL_BELLY_DAYS = Math.round(MAX_HUNGER_MS / 86_400_000);

export function BellyFullIntroSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  // Same voice as the frog's notifications (frogVoice.ts): first person,
  // real numbers only, dry but not mean.
  const rows = [
    {
      icon: (
        <Check className="h-5 w-5" strokeWidth={2.75} />
      ),
      text: (
        <>
          <b>1 task</b> feeds me for {HUNGER_HOURS_PER_TASK} hours
        </>
      ),
    },
    {
      icon: <Clock className="h-5 w-5" strokeWidth={2.5} />,
      text: (
        <>
          Topped up, I’m good for <b>{FULL_BELLY_DAYS} days</b>
        </>
      ),
    },
    {
      icon: <Fly size={24} alwaysPlay interactive={false} oversample={1.5} />,
      text: (
        <>
          Empty belly? I help myself —{' '}
          <b>
            {FLIES_PER_PENALTY} {FLIES_PER_PENALTY === 1 ? 'fly' : 'flies'} a
            day
          </b>{' '}
          from your stash
        </>
      ),
    },
  ];
  return (
    <IntroShell open={open} onClose={onClose}>
      <h2 className="mt-2 text-center text-xl font-black text-foreground">
        Full belly. Happy me.
      </h2>
      <FrogPerch open={open} />
      <IntroRows rows={rows} />
      <IntroCta label="Got it" onClick={onClose} />
    </IntroShell>
  );
}

export function SavedTaskIntroSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const rows = [
    {
      icon: <AppIcon name="planner" label="Planner" className="h-6 w-6" />,
      text: (
        <>
          It’s waiting in <b>Saved Tasks</b> on the Planner — drag it onto any
          day
        </>
      ),
    },
    {
      icon: <Plus className="h-5 w-5" strokeWidth={2.75} />,
      text: (
        <>
          Or grab it while <b>adding a task</b> — your saved ones are right
          there
        </>
      ),
    },
  ];
  return (
    <IntroShell open={open} onClose={onClose}>
      <h2 className="mt-2 text-center text-xl font-black text-foreground">
        Saved. Not forgotten.
      </h2>
      <FrogPerch open={open} />
      <IntroRows rows={rows} />
      <IntroCta label="Got it" onClick={onClose} />
    </IntroShell>
  );
}

