import React from 'react';
import { Lock, Check, Gift } from 'lucide-react';
import { useProgressLogic } from '@/hooks/useProgressLogic';
import { GiftRive } from './gift-box/GiftBox';
import Fly from './fly';

interface ProgressCardProps {
  rate: number;
  done: number;
  total: number;
  giftsClaimed: number;
  onAddRequested?: () => void;
  onGiftClick?: () => void;
  onGiftInfoClick?: (slot: { status: string; target: number; tasksLeft: number; neededToUnlock: number }) => void;
}

export default function ProgressCard({
  rate,
  done,
  total,
  giftsClaimed = 0,
  onAddRequested,
  onGiftClick,
  onGiftInfoClick,
}: ProgressCardProps) {
  // === LOGIC: REWARD TRACK ===
  const slots = useProgressLogic(done, total, giftsClaimed);

  const allGiftsClaimed = slots.every((s) => s.status === 'CLAIMED');

  // Determine if we're in the "Gold" state (> 50%)
  const isGold = rate > 50;

  if (allGiftsClaimed) return null;

  return (
    <div className="relative z-10 flex flex-col lg:items-center gap-2 mb-4">
      {/* 2. Main Card */}
      <div
        dir="ltr"
        className={`relative w-full lg:max-w-[340px] ${allGiftsClaimed ? 'py-2 px-3' : 'py-3 px-4'} rounded-[24px] bg-card/80 backdrop-blur-xl border border-border/40 shadow-sm overflow-visible transition-all duration-500`}
      >
        {/* Header Row - Only show if not all claimed */}
        {!allGiftsClaimed && (
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold tracking-wider uppercase md:text-sm text-muted-foreground">
              Daily Rewards
            </h2>
          </div>
        )}

        {/* Rewards Grid */}

        {!allGiftsClaimed && (
          <div className="grid grid-cols-3 gap-2 xl:gap-3">
            {slots.map((slot, idx) => {
              const isLocked = slot.status === 'LOCKED';

              const isClaimed = slot.status === 'CLAIMED';

              const isReady = slot.status === 'READY';

              // Common card styles

              const cardBase =
                'relative flex flex-col items-center justify-center py-1 px-1 rounded-2xl border transition-all duration-300 min-h-[65px] md:min-h-[75px]';

              if (isClaimed) {
                return (
                  <div
                    key={idx}
                    className={`${cardBase} bg-green-50/50 dark:bg-green-900/10 border-green-200/50 dark:border-green-800/30`}
                  >
                    <div className="flex items-center justify-center w-full h-12">
                      <div className="flex items-center justify-center bg-green-100 rounded-full shadow-sm h-11 w-11 dark:bg-green-500/20 translate-y-2">
                        <Check
                          className="w-5 h-5 text-green-600 dark:text-green-400"
                          strokeWidth={4}
                        />
                      </div>
                    </div>

                    <div className="flex flex-col items-center mt-3">
                      <span className="text-[10px] font-black text-muted-foreground/80 uppercase tracking-wide whitespace-nowrap leading-tight">
                        Collected
                      </span>
                      <div className="h-1" /> {/* Spacer to match bar */}
                    </div>
                  </div>
                );
              }

              if (isReady) {
                return (
                  <div
                    key={idx}
                    onClick={onGiftClick}
                    className={`${cardBase} relative overflow-hidden bg-gradient-to-br from-primary/25 via-primary/15 to-transparent border-2 border-primary shadow-[0_0_25px_rgba(var(--primary),0.4)] z-10 cursor-pointer transition-all duration-300 hover:shadow-[0_0_35px_rgba(var(--primary),0.6)] hover:border-primary/80`}
                  >
                    {/* Animated shimmer effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" style={{ backgroundSize: '200% 100%' }} />
                    
                    {/* Animated glow pulse */}
                    <div className="absolute inset-0 bg-primary/5 animate-pulse" />
                    
                    <div className="relative flex items-center justify-center h-12">
                      <div className="relative -top-2 filter drop-shadow-[0_0_15px_rgba(var(--primary),0.4)]">
                        <GiftRive
                          key="milestone-ready"
                          width={90}
                          height={90}
                        />
                      </div>
                    </div>

                    <div className="relative flex flex-col items-center mt-3">
                      <span className="text-[10px] font-black text-primary uppercase leading-tight animate-pulse tracking-wide whitespace-nowrap">
                        CLAIM
                      </span>
                      <div className="h-1" /> {/* Spacer to match bar */}
                    </div>
                  </div>
                );
              }

              if (isLocked) {
                return (
                  <div
                    key={idx}
                    onClick={() => onGiftInfoClick?.(slot)}
                    className={`${cardBase} bg-muted/30 border-dashed border-2 border-muted-foreground/20 cursor-pointer hover:bg-muted/50 hover:border-muted-foreground/40 group`}
                  >
                    <div className="flex items-center justify-center w-full h-12">
                      <div className="flex items-center justify-center transition-all border rounded-full h-11 w-11 bg-muted border-muted-foreground/10 grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100">
                        <Fly size={24} y={-3} />
                      </div>
                    </div>

                    <div className="flex flex-col items-center mt-3">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase leading-tight text-center px-0.5 whitespace-nowrap tracking-wide">
                        ADD +{slot.neededToUnlock} Task
                        {slot.neededToUnlock > 1 ? 's' : ''}
                      </span>
                      <div className="h-1" /> {/* Spacer to match bar */}
                    </div>
                  </div>
                );
              }

              // Pending (Tasks left)

              return (
                <div
                  key={idx}
                  onClick={() => onGiftInfoClick?.(slot)}
                  className={`${cardBase} bg-card border-border/60 cursor-pointer hover:border-primary/30 transition-colors`}
                >
                  <div className="flex items-center justify-center h-12">
                    <div className="relative -top-2">
                      <GiftRive
                        key={`pending-${idx}`}
                        width={90}
                        height={90}
                        isMilestone={true}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col items-center mt-3">
                    <span className="text-[10px] font-black text-muted-foreground/80 uppercase tracking-wide whitespace-nowrap leading-tight">
                      {slot.tasksLeft} TASK{slot.tasksLeft > 1 ? 'S' : ''} LEFT
                    </span>

                    {/* Mini Bar */}

                    <div className="relative w-10 h-1 mt-1 overflow-hidden rounded-full xl:w-12 bg-muted">
                      <div
                        className={`h-full transition-all duration-500 relative ${
                          slot.percent > 50
                            ? 'bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-500'
                            : 'bg-primary'
                        }`}
                        style={{ width: `${slot.percent}%` }}
                      >
                        {slot.percent > 50 && (
                          <div
                            className="absolute inset-0 w-full h-full bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.4),transparent)] animate-shimmer"
                            style={{ backgroundSize: '200% 100%' }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {allGiftsClaimed && (
          <AllGiftsCollected />
        )}
      </div>
    </div>
  );
}

function AllGiftsCollected() {
  const [timeLeft, setTimeLeft] = React.useState('');

  React.useEffect(() => {
    function updateTimer() {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setHours(24, 0, 0, 0);
      const diff = tomorrow.getTime() - now.getTime();

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft(
        `${hours.toString().padStart(2, '0')}:${minutes
          .toString()
          .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
    }

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center justify-center w-full gap-2">
      <Check className="w-3.5 h-3.5 text-green-500" />
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
        Next gifts in <span className="text-primary font-bold font-mono ml-0.5">{timeLeft}</span>
      </p>
    </div>
  );
}
