'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { X } from 'lucide-react';
import Frog, { type FrogHandle } from '@/components/ui/frog';
import { FrogSpeechBubble } from '@/components/ui/FrogSpeechBubble';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useWideStage } from '@/hooks/useWideStage';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import { SheetEnteredContext, useEntrance } from '@/lib/sheetEntered';
import { hapticCelebrate } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { leagueArt } from './leapCopy';

const SLOT_SHIFT = 72;
const SIDE_SCALE = 0.5;

const RINGS = [
  { w: 230, h: 58, opacity: 1 },
  { w: 340, h: 86, opacity: 0.7 },
  { w: 460, h: 116, opacity: 0.45 },
  { w: 590, h: 150, opacity: 0.22 },
];

function Ripples({ burst, large }: { burst: number; large: boolean }) {
  const reduceMotion = useReducedMotion();
  const k = large ? 1.35 : 1;
  const ring = (w: number, h: number) => ({
    width: w * k,
    height: h * k,
    marginLeft: (-w * k) / 2,
    marginTop: (-h * k) / 2,
  });
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 z-0 h-0 w-0"
      style={{ bottom: large ? 30 : 20 }}
    >
      <span
        className="absolute left-0 top-0 rounded-[50%] bg-[radial-gradient(closest-side,var(--leap-glow),transparent)]"
        style={ring(360, 150)}
      />
      {RINGS.map((entry) => (
        <span
          key={entry.w}
          className="absolute left-0 top-0 rounded-[50%] border-2 border-[color:var(--leap-ring)]"
          style={{ ...ring(entry.w, entry.h), opacity: entry.opacity }}
        />
      ))}
      {!reduceMotion &&
        burst > 0 &&
        [0, 1, 2].map((index) => (
          <motion.span
            key={`${burst}-${index}`}
            className="absolute left-0 top-0 rounded-[50%] border-[3px] border-[color:var(--leap-burst)]"
            style={ring(300, 78)}
            initial={{ scale: 0.3, opacity: 0.95 }}
            animate={{ scale: 1.7, opacity: 0 }}
            transition={{ duration: 1.5, delay: index * 0.24, ease: [0.2, 0.7, 0.3, 1] }}
          />
        ))}
    </div>
  );
}

export function LilyPodium({
  leagues,
  focus,
  nextNote,
  size = 'md',
  burst = 0,
}: {
  leagues: string[];
  focus: number;
  nextNote?: string | null;
  size?: 'md' | 'lg';
  burst?: number;
}) {
  const reduceMotion = useReducedMotion();
  const large = size === 'lg';
  return (
    <div
      className={cn(
        'relative w-full',
        large ? 'mb-11 h-[176px]' : 'mb-8 h-[120px] short-screen:h-[100px]',
      )}
      aria-hidden
    >
      <Ripples burst={burst} large={large} />
      {leagues.map((label, index) => {
        const offset = index - focus;
        const center = offset === 0;
        const shown = Math.abs(offset) <= 1;
        const note = offset === 1 ? nextNote : null;
        return (
          <motion.div
            key={label}
            className={cn(
              'absolute bottom-0 left-1/2 h-full',
              large
                ? '-ml-[128px] w-[256px]'
                : '-ml-[88px] w-[176px] short-screen:-ml-[75px] short-screen:w-[150px]',
            )}
            initial={false}
            animate={{
              x: `${offset * SLOT_SHIFT}%`,
              scale: center ? 1 : SIDE_SCALE,
              opacity: shown ? 1 : 0,
            }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: 'spring', stiffness: 170, damping: 20, mass: 0.9 }
            }
            style={{ transformOrigin: '50% 100%', zIndex: center ? 2 : 1 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={leagueArt(index)}
              alt=""
              draggable={false}
              className={cn(
                'h-full w-full select-none object-contain object-bottom transition-[filter] duration-500',
                center &&
                  'drop-shadow-[0_6px_10px_rgba(22,70,40,0.18)] dark:drop-shadow-[0_0_14px_rgba(245,179,1,0.35)]',
              )}
            />
            <motion.span
              className={cn(
                'absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap text-center font-black leading-[1.15] text-[color:var(--leap-ink-muted)]',
                large ? 'text-[30px]' : 'text-[26px]',
              )}
              initial={false}
              animate={{ opacity: center || !shown ? 0 : 1 }}
            >
              {label}
              {note ? <span className="block text-[color:var(--leap-note)]">{note}</span> : null}
            </motion.span>
          </motion.div>
        );
      })}
    </div>
  );
}

export function LeapStagePanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'relative z-10 w-full rounded-[24px] border border-[color:var(--leap-card-line)] bg-[color:var(--leap-card)] p-4 text-[color:var(--leap-ink)] shadow-[0_3px_0_0_var(--leap-card-shadow)] short-screen:p-3',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function LeapStageButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-14 w-full items-center justify-center gap-1.5 rounded-2xl bg-primary text-[17px] font-black tracking-tight text-primary-foreground shadow-[0_4px_0_0_#34631f] transition-[transform,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 active:translate-y-[3px] active:shadow-none short-screen:h-[52px]"
    >
      {children}
    </button>
  );
}

export type LeapStageProps = {
  leagues: string[];
  from: number;
  to: number;
  nextNote?: string | null;
  eyebrow: string;
  title: string;
  body?: string;
  frogLine: string;
  celebrate: boolean;
  panel: ReactNode;
  actions: ReactNode;
};

export function LeapStageBody({
  leagues,
  from,
  to,
  nextNote,
  eyebrow,
  title,
  body,
  frogLine,
  celebrate,
  panel,
  actions,
  active,
  quiet = false,
  wide = false,
  onDismiss,
}: LeapStageProps & {
  active: boolean;
  quiet?: boolean;
  wide?: boolean;
  onDismiss?: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const frogRef = useRef<FrogHandle>(null);
  const { indices } = useWardrobeIndices(active);
  const shortScreen = useMediaQuery('(max-height: 800px)');
  const frogHeight = wide ? 204 : shortScreen ? 168 : 184;
  const frogWidth = Math.round((frogHeight * 128) / 144);
  const [focus, setFocus] = useState(from);
  const [landed, setLanded] = useState(false);
  const moves = from !== to;

  useEffect(() => {
    if (!active) return;
    setFocus(from);
    setLanded(false);
    const moveTimer = window.setTimeout(() => setFocus(to), moves ? 700 : 0);
    const landTimer = window.setTimeout(
      () => {
        setLanded(true);
        if (!celebrate || quiet) return;
        hapticCelebrate();
        if (!reduceMotion) {
          void confetti({
            particleCount: 90,
            spread: 80,
            startVelocity: 38,
            origin: { y: 0.3 },
            zIndex: 99999,
            colors: ['#fbbf24', '#fde68a', '#93df6e', '#4f9a45', '#ffffff'],
            disableForReducedMotion: true,
          });
        }
      },
      moves ? 1250 : 650,
    );
    return () => {
      window.clearTimeout(moveTimer);
      window.clearTimeout(landTimer);
    };
  }, [active, from, to, moves, celebrate, quiet, reduceMotion]);

  const reveal = (delay: number) =>
    reduceMotion
      ? { initial: false as const, animate: { opacity: 1, y: 0 } }
      : {
          initial: { opacity: 0, y: 12 },
          animate: landed ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 },
          transition: { delay, type: 'spring' as const, stiffness: 260, damping: 24 },
        };

  const hero = (
    <div className="flex w-full flex-col items-center text-center">
      <p
        className={cn(
          'font-black uppercase tracking-[0.14em] text-[color:var(--leap-eyebrow)]',
          wide ? 'text-[13px]' : 'text-[12px]',
        )}
      >
        {eyebrow}
      </p>
      <div className={cn('w-full', wide ? 'mt-5' : 'mt-2')}>
        <LilyPodium
          leagues={leagues}
          focus={focus}
          nextNote={nextNote}
          size={wide ? 'lg' : 'md'}
          burst={landed ? 1 : 0}
        />
      </div>
      <motion.h2
        {...reveal(0)}
        className={cn(
          'text-balance font-black tracking-tight text-[color:var(--leap-ink)]',
          wide
            ? 'mt-4 text-[44px] leading-[1.04]'
            : 'mt-3 text-[26px] leading-[1.1] short-screen:mt-2 short-screen:text-[23px]',
        )}
      >
        {title}
      </motion.h2>
      {body && (
        <motion.p
          {...reveal(0.08)}
          className={cn(
            'text-pretty font-bold leading-snug text-[color:var(--leap-ink-muted)]',
            wide ? 'mt-3 max-w-[34ch] text-[17px]' : 'mt-1.5 max-w-[30ch] text-[14px]',
          )}
        >
          {body}
        </motion.p>
      )}
    </div>
  );

  const frogPanel = (
    <motion.div
      {...reveal(0.18)}
      className={cn(
        'relative w-full text-left [container-type:inline-size]',
        wide ? 'mt-[124px]' : 'mt-[104px] short-screen:mt-[92px]',
      )}
    >
      <div
        className="pointer-events-none absolute bottom-[calc(100%-10px)] left-[-18px] z-20"
        style={{ width: frogWidth, height: frogHeight }}
      >
        <Frog
          ref={frogRef}
          width={frogWidth}
          height={frogHeight}
          indices={indices}
          placeholder
          arrive="hop"
          arriveDelay={180}
          holdArrival={!landed}
          greet={quiet ? null : celebrate ? (moves ? 'tada' : 'celebrate') : 'loveHeartbeat'}
        />
      </div>
      {landed && (
        <FrogSpeechBubble
          side
          rate={0}
          done={0}
          total={0}
          fixedMessage={frogLine}
          messageClassName="!text-[14px]"
          className={cn(
            '!z-0 [--bubble-max:min(calc(100cqw-9.5rem),14.5rem)]',
            wide
              ? '!left-[142px] !top-[-58px]'
              : shortScreen
                ? '!left-[118px] !top-[-48px]'
                : '!left-[128px] !top-[-52px]',
          )}
        />
      )}
      <LeapStagePanel>{panel}</LeapStagePanel>
    </motion.div>
  );

  const actionBlock = <div className="flex w-full flex-col items-center gap-3">{actions}</div>;

  return (
    <div
      className="leap-stage relative flex h-full min-h-0 flex-1 flex-col"
      style={{ background: 'var(--leap-water)' }}
    >

      {wide ? (
        <div className="no-scrollbar relative flex min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-12 py-10">
          <div className="m-auto grid w-full max-w-[64rem] grid-cols-[1.1fr_1fr] items-center gap-16">
            {hero}
            <div className="w-full max-w-[26rem] justify-self-center">
              {frogPanel}
              <motion.div {...reveal(0.3)} className="mt-6">
                {actionBlock}
              </motion.div>
            </div>
          </div>
          {onDismiss && (
            <button
              type="button"
              aria-label="Close"
              onClick={onDismiss}
              className="absolute right-6 top-6 grid h-11 w-11 place-items-center rounded-full bg-[color:var(--leap-chip)] text-[color:var(--leap-ink-muted)] transition-colors hover:text-[color:var(--leap-ink)] active:scale-95"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="no-scrollbar relative flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain px-6 pb-2 pt-[calc(env(safe-area-inset-top)+1.75rem)] short-screen:pt-[calc(env(safe-area-inset-top)+1rem)]">
            <div className="m-auto flex w-full max-w-sm shrink-0 flex-col items-center">
              {hero}
              {frogPanel}
            </div>
          </div>
          <motion.div
            {...reveal(0.3)}
            className="relative shrink-0 px-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 short-screen:pb-[calc(0.75rem+env(safe-area-inset-bottom))] short-screen:pt-3"
          >
            <div className="mx-auto w-full max-w-sm">{actionBlock}</div>
          </motion.div>
        </>
      )}
    </div>
  );
}

export function LeapStage({
  open,
  onClose,
  label,
  ...props
}: LeapStageProps & { open: boolean; onClose: () => void; label: string }) {
  useRegisterOpenSheet(open);
  const wide = useWideStage();
  const { entered, markEntered } = useEntrance(open);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      closeRef.current();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="leap-stage"
          role="dialog"
          aria-modal="true"
          aria-label={label}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2, ease: 'easeOut' } }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          onAnimationComplete={markEntered}
          className="pointer-events-auto fixed inset-0 z-[1400] flex select-none flex-col overflow-hidden bg-background"
        >
          <SheetEnteredContext.Provider value={entered}>
            <LeapStageBody {...props} active={open} wide={wide} onDismiss={onClose} />
          </SheetEnteredContext.Provider>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
