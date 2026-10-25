'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { Icon as AppIcon } from '@/components/ui/Icon';
import { BaseSheet } from '@/components/ui/BaseSheet';
import Fly from '@/components/ui/fly';
import { cn } from '@/lib/utils';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import Frog from '@/components/ui/frog';

// Above the notification stack (z-1300): a one-time explainer must never be
// covered by a toast — an undo prompt was landing on top of the belly intro.
const INTRO_Z = 1310;

function IntroShell({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <BaseSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      zIndex={INTRO_Z}
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
      className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-2xl bg-primary text-[15px] font-black text-primary-foreground shadow-[0_4px_0_0_#2c511a] transition-all hover:brightness-105 active:translate-y-[2px] active:shadow-none"
    >
      {label}
    </button>
  );
}

// The user's dressed frog perched on the first row card, fly at its shoulder
// — the shared visual signature of these one-time explainers.
function FrogPerch({ open }: { open: boolean }) {
  const { indices } = useWardrobeIndices(open);
  const [landed, setLanded] = useState(false);
  return (
    <div className="pointer-events-none relative z-10 -mb-[12px] -mt-3 flex justify-center">
      <div className="relative translate-y-[20px]">
        <Frog
          width={132}
          height={148}
          indices={indices}
          paused={!open}
          visualOffsetY={0}
          arrive="drop"
          onArrived={() => setLanded(true)}
        />
        {landed && (
          <span className="absolute -left-7 top-9 animate-[fly-bob_2.2s_ease-in-out_infinite] motion-reduce:animate-none">
            <Fly size={34} alwaysPlay interactive={false} oversample={1.5} />
          </span>
        )}
      </div>
    </div>
  );
}

function IntroRows({
  rows,
  activeIndex = -1,
}: {
  rows: { icon: React.ReactNode; text: React.ReactNode }[];
  /** Highlights the row the stage above is currently acting out. */
  activeIndex?: number;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map(({ icon, text }, index) => {
        const active = index === activeIndex;
        return (
          <motion.div
            key={index}
            animate={{ scale: active ? 1.015 : 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className={cn(
              'flex items-center gap-3 rounded-2xl border px-3.5 py-2.5 transition-colors duration-300',
              active
                ? 'border-primary/50 bg-primary/10'
                : 'border-border/50 bg-muted/30',
              activeIndex >= 0 && !active && 'opacity-55',
            )}
          >
            <span
              className={cn(
                'grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors duration-300',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-primary/10 text-primary',
              )}
            >
              {icon}
            </span>
            <p className="text-[13px] font-semibold leading-snug text-foreground [&>b]:font-black">
              {text}
            </p>
          </motion.div>
        );
      })}
    </div>
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
      icon: <AppIcon name="planner" label="Planner" className="w-6 h-6" />,
      text: (
        <>
          It’s waiting in <b>Saved Tasks</b> on the Planner — drag it onto any
          day
        </>
      ),
    },
    {
      icon: <Plus className="w-5 h-5" strokeWidth={2.75} />,
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
      <h2 className="mt-2 text-xl font-black text-center text-foreground">
        Saved. Not forgotten.
      </h2>
      <FrogPerch open={open} />
      <IntroRows rows={rows} />
      <IntroCta label="Got it" onClick={onClose} />
    </IntroShell>
  );
}
