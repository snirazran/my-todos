'use client';

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { FlyAmount } from '@/components/ui/FlyAmount';
import { GiftRive } from '@/components/ui/gift-box/GiftBox';
import { habitsWord, leagueArt } from './leapCopy';

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function StageBar({
  ratio,
  tick,
  tickLabel,
}: {
  ratio: number;
  tick?: number | null;
  tickLabel?: string | null;
}) {
  const reduceMotion = useReducedMotion();
  const tickAt = tick == null ? null : clamp01(tick) * 100;
  return (
    <div className="mt-2.5">
      <div className="relative">
        <div className="h-3.5 overflow-hidden rounded-full bg-[color:var(--leap-track)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.10)]">
          <motion.div
            initial={reduceMotion ? false : { scaleX: 0 }}
            animate={{ scaleX: clamp01(ratio) }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.5 }}
            className="relative h-full origin-left overflow-hidden rounded-full bg-gradient-to-b from-amber-300 to-amber-400"
          >
            <span className="absolute inset-x-[3px] top-px h-[35%] rounded-full bg-white/50" />
          </motion.div>
        </div>
        {tickAt !== null && (
          <span
            aria-hidden="true"
            className="absolute -bottom-1 -top-1 w-[4px] -translate-x-1/2 rounded-full bg-[color:var(--leap-tick)] ring-2 ring-[color:var(--leap-card)]"
            style={{ left: `${tickAt}%` }}
          />
        )}
      </div>
      {tickAt !== null && tickLabel && (
        <div className="relative mt-1.5 h-4">
          <span
            className="absolute -translate-x-1/2 whitespace-nowrap text-[12px] font-black text-[color:var(--leap-ink-muted)]"
            style={{ left: `${Math.min(84, Math.max(16, tickAt))}%` }}
          >
            {tickLabel}
          </span>
        </div>
      )}
    </div>
  );
}

function PanelEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11.5px] font-black uppercase tracking-[0.12em] text-[color:var(--leap-eyebrow)]">{children}</p>
  );
}

function ReceiptRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-3">
      <span className="text-[14px] font-bold text-[color:var(--leap-ink-muted)]">{label}</span>
      <span className="inline-flex items-center gap-1 text-[15px] font-black tabular-nums text-[color:var(--leap-ink)]">
        {value}
      </span>
    </div>
  );
}

function GiftCount({ count, color, paused }: { count: number; color: number; paused: boolean }) {
  return (
    <>
      <span aria-hidden="true" className="-my-3 aspect-[282/381] h-10 w-auto shrink-0 -translate-y-[6px]">
        <GiftRive className="h-full w-full" color={color} paused={paused} ambient="jump" />
      </span>
      {count}
    </>
  );
}

export function LeapWeekGoal({
  done,
  target,
  goal,
  goalIndex,
  caption,
}: {
  done: number;
  target: number;
  goal: string;
  goalIndex: number;
  caption?: string;
}) {
  return (
    <div>
      <PanelEyebrow>This week</PanelEyebrow>
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <span className="text-[16px] font-black tabular-nums">
          {target > 0 ? `${Math.min(done, target)} of ${target} habits` : habitsWord(done)}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-black text-[color:var(--leap-ink-muted)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={leagueArt(goalIndex)} alt="" aria-hidden="true" className="h-5 w-8 object-contain" />
          {goal}
        </span>
      </div>
      {target > 0 && <StageBar ratio={done / target} />}
      {caption && <p className="mt-2 text-[12.5px] font-bold text-[color:var(--leap-ink-muted)]">{caption}</p>}
    </div>
  );
}

export function LeapWeekReceipt({
  hops,
  scheduled,
  lineAt,
  lineLabel,
  flies,
  gifts,
  giftColor,
  paused,
}: {
  hops: number;
  scheduled: number;
  lineAt: number;
  lineLabel: string;
  flies: number;
  gifts: number;
  giftColor: number;
  paused: boolean;
}) {
  const rewards = flies > 0 || gifts > 0;
  return (
    <div>
      <PanelEyebrow>Last week</PanelEyebrow>
      <div className="mt-1.5">
        <ReceiptRow
          label="Habits finished"
          value={scheduled > 0 ? `${hops} of ${scheduled}` : hops}
        />
      </div>
      {scheduled > 0 && (
        <StageBar
          ratio={hops / scheduled}
          tick={lineAt > 0 && lineAt < scheduled ? lineAt / scheduled : null}
          tickLabel={lineAt > 0 ? lineLabel : null}
        />
      )}
      {rewards && (
        <div className="mt-3 space-y-1.5 border-t border-[color:var(--leap-divider)] pt-3">
          {flies > 0 && <ReceiptRow label="Flies earned" value={<FlyAmount amount={flies} size={15} />} />}
          {gifts > 0 && (
            <ReceiptRow
              label={gifts === 1 ? 'Gift won' : 'Gifts won'}
              value={<GiftCount count={gifts} color={giftColor} paused={paused} />}
            />
          )}
        </div>
      )}
    </div>
  );
}

export function LeapPrizeReceipt({
  title,
  flies,
  gifts,
  giftColor,
  paused,
  caption,
}: {
  title: string;
  flies: number;
  gifts: number;
  giftColor: number;
  paused: boolean;
  caption?: string;
}) {
  return (
    <div>
      <PanelEyebrow>{title}</PanelEyebrow>
      <div className="mt-1.5 space-y-1.5">
        {flies > 0 && <ReceiptRow label="Flies earned" value={<FlyAmount amount={flies} size={15} />} />}
        {gifts > 0 && (
          <ReceiptRow
            label={gifts === 1 ? 'Gift won' : 'Gifts won'}
            value={<GiftCount count={gifts} color={giftColor} paused={paused} />}
          />
        )}
      </div>
      {caption && <p className="mt-2 text-[12.5px] font-bold text-[color:var(--leap-ink-muted)]">{caption}</p>}
    </div>
  );
}
