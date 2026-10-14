'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Calendar1, Repeat } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { SHEET_TITLE, Squircle, type Tint } from '@/components/ui/quick-add/kit';
import { cn } from '@/lib/utils';
import type { RepeatMoveScope } from '@/lib/repeatMove';
import { parseYmd, relativeDayLabel } from './helpers';

export type MoveRepeatPrompt = {
  taskText: string;
  from: string;
  to: string;
  oneDetail: string;
  futureTitle: string;
  futureDetail: string;
};

function DayTile({ date, active }: { date: string; active: boolean }) {
  const d = parseYmd(date);
  return (
    <div
      className={cn(
        'w-[60px] overflow-hidden rounded-2xl text-center',
        active
          ? 'bg-card shadow-[0_3px_0_0_#2c511a] ring-[1.5px] ring-[#447d3f]'
          : 'bg-muted/60 ring-1 ring-border/50',
      )}
    >
      <div
        className={cn(
          'py-1 text-[10px] font-black uppercase tracking-[0.14em]',
          active ? 'bg-[#447d3f] text-white' : 'bg-foreground/[0.06] text-muted-foreground',
        )}
      >
        {d.toLocaleDateString('en-US', { weekday: 'short' })}
      </div>
      <div
        className={cn(
          'pb-1.5 pt-1 text-[24px] font-black leading-none tabular-nums',
          active ? 'text-foreground' : 'text-muted-foreground/70',
        )}
      >
        {d.getDate()}
      </div>
      <div
        className={cn(
          'pb-1.5 text-[10px] font-bold',
          active ? 'text-muted-foreground' : 'text-muted-foreground/60',
        )}
      >
        {d.toLocaleDateString('en-US', { month: 'short' })}
      </div>
    </div>
  );
}

function Choice({
  icon,
  tint,
  title,
  detail,
  autoFocus,
  onClick,
}: {
  icon: React.ReactNode;
  tint: Tint;
  title: string;
  detail: string;
  autoFocus?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      autoFocus={autoFocus}
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl bg-muted/50 px-3 py-3 text-left outline-none transition-[transform,background-color,box-shadow] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary/40 [@media(hover:hover)]:hover:bg-muted/80"
    >
      <Squircle tint={tint} size="lg">
        {icon}
      </Squircle>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-black text-foreground">
          {title}
        </span>
        <span className="mt-0.5 block text-[12.5px] font-semibold leading-snug text-muted-foreground">
          {detail}
        </span>
      </span>
    </button>
  );
}

export function MoveRepeatSheet({
  prompt,
  onChoose,
  onCancel,
}: {
  prompt: MoveRepeatPrompt | null;
  onChoose: (scope: RepeatMoveScope) => void;
  onCancel: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = React.useState<MoveRepeatPrompt | null>(prompt);
  React.useEffect(() => {
    if (prompt) setShown(prompt);
  }, [prompt]);
  const view = prompt ?? shown;
  const toLabel = view ? relativeDayLabel(view.to) : '';

  return (
    <BaseSheet
      open={!!prompt}
      onOpenChange={(open) => !open && onCancel()}
      zIndex={1600}
      showClose={false}
      className="sm:max-w-[400px]"
    >
      {() =>
        view && (
          <div className="px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-2 sm:pt-5">
            <div className="mb-4 flex items-center justify-center gap-3">
              <DayTile date={view.from} active={false} />
              <motion.span
                initial={reduceMotion ? false : { opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.12, duration: 0.25 }}
                className="text-muted-foreground"
              >
                <ArrowRight className="h-5 w-5" strokeWidth={3} />
              </motion.span>
              <motion.div
                initial={reduceMotion ? false : { scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.18, type: 'spring', stiffness: 420, damping: 22 }}
              >
                <DayTile date={view.to} active />
              </motion.div>
            </div>

            <h3
              className={cn(SHEET_TITLE, 'mb-4 line-clamp-2 break-words px-2 text-center')}
              aria-label={`Move “${view.taskText}” to ${toLabel}`}
            >
              Move “{view.taskText}”
            </h3>

            <div className="space-y-2">
              <Choice
                autoFocus
                icon={<Calendar1 className="h-[18px] w-[18px]" strokeWidth={2.5} />}
                tint="sky"
                title="Just this one"
                detail={view.oneDetail}
                onClick={() => onChoose('one')}
              />
              <Choice
                icon={<Repeat className="h-[18px] w-[18px]" strokeWidth={2.5} />}
                tint="violet"
                title={view.futureTitle}
                detail={view.futureDetail}
                onClick={() => onChoose('future')}
              />
            </div>

            <button
              type="button"
              onClick={onCancel}
              className="mt-3 h-11 w-full rounded-xl text-[13px] font-bold text-muted-foreground transition-colors [@media(hover:hover)]:hover:bg-muted/60"
            >
              Cancel
            </button>
          </div>
        )
      }
    </BaseSheet>
  );
}
