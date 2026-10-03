import { cn } from '@/lib/utils';
import type { HungerState } from '@/lib/hungerDisplay';

const offset = (fill: number) => (fill <= 0 ? -110 : (fill - 1) * 100);

/**
 * One fly-meal of the frog's belly. The fill slides with a transform instead
 * of animating width, so draining and feeding never trigger layout.
 */
export function BellyPip({
  fill,
  ghostFill,
  tone,
  animate = true,
  delayMs = 0,
  popAnimation,
  breathing = false,
  className,
}: {
  fill: number;
  ghostFill?: number;
  tone: HungerState;
  animate?: boolean;
  delayMs?: number;
  popAnimation?: string;
  breathing?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative flex-1 rounded-full bg-foreground/[0.07] shadow-[inset_0_1px_2px_rgba(0,0,0,0.10)]',
        className,
      )}
      style={popAnimation ? { animation: popAnimation } : undefined}
    >
      <div className="absolute inset-0 overflow-hidden rounded-full">
        {ghostFill !== undefined && ghostFill > 0 && (
          <div
            className={cn('absolute inset-0 rounded-full', tone.ghost)}
            style={{ transform: `translateX(${offset(ghostFill)}%)` }}
          />
        )}
        <div
          className={cn(
            'absolute inset-0 rounded-full',
            tone.fill,
            animate &&
              'transition-transform duration-500 ease-[cubic-bezier(0.34,1.3,0.64,1)]',
          )}
          style={{
            transform: `translateX(${offset(fill)}%)`,
            transitionDelay: delayMs ? `${delayMs}ms` : undefined,
          }}
        >
          <div className="absolute inset-x-[3px] top-[2px] h-[32%] rounded-full bg-white/45" />
        </div>
      </div>
      {breathing && (
        <span
          aria-hidden
          className={cn(
            'absolute -inset-px rounded-full ring-2 motion-safe:animate-[belly-next_2.4s_ease-in-out_infinite]',
            tone.ring,
          )}
        />
      )}
    </div>
  );
}
