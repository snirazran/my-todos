'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { X, Loader2, Sparkles } from 'lucide-react';
import useSWR, { mutate } from 'swr';
import { MonthProgress } from './MonthProgress';
import { useAuth } from '@/components/auth/AuthContext';
import { cn } from '@/lib/utils';

interface DailyStatusResponse {
  dailyRewards: {
    lastClaimDate: string | null;
    claimedDays: number[];
    month: string;
    streak: number;
  };
  isPremium: boolean;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Stable star positions — generated once
const STARS = Array.from({ length: 20 }, (_, i) => ({
  size: [1.5, 2, 2, 3, 1.5][i % 5],
  top: `${6 + ((i * 13 + i * i * 2) % 56)}%`,
  left: `${3 + ((i * 19 + i * 7) % 92)}%`,
  opacity: 0.25 + (i % 6) * 0.07,
  dur: `${1.6 + (i % 5) * 0.4}s`,
  delay: `${(i * 0.22) % 2.2}s`,
}));

export function DailyRewardPopup({
  show,
  onClose,
}: {
  show: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { data: statusData, mutate: mutateStatus } =
    useSWR<DailyStatusResponse>(
      user ? '/api/daily-reward/status' : null,
      fetcher,
    );

  const [claiming, setClaiming] = useState(false);
  const [showPremiumPopup, setShowPremiumPopup] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const currentDay = new Date().getDate();
  const dragControls = useDragControls();

  useEffect(() => {
    const check = () =>
      setIsDesktop(window.matchMedia('(min-width: 640px)').matches);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (show) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [show]);

  const handleClaim = async (day: number) => {
    if (claiming || !user) return;
    setClaiming(true);
    try {
      const res = await fetch('/api/daily-reward/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day }),
      });
      const data = await res.json();
      if (data.success) {
        await mutateStatus();
        mutate('/api/skins/inventory');
        setTimeout(() => {
          onClose();
          mutate(
            (key: string) =>
              typeof key === 'string' && key.startsWith('/api/tasks'),
            undefined,
            { revalidate: true },
          );
        }, 1200);
      }
    } catch (e) {
      console.error('Claim failed', e);
    } finally {
      setClaiming(false);
    }
  };

  if (!show || !statusData) return null;

  const mobileV = {
    initial: { y: '100%', opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: '100%', opacity: 0 },
  };
  const desktopV = {
    initial: { opacity: 0, scale: 0.91, y: 16 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.91, y: 16 },
  };

  const BANNER_H = isDesktop ? 200 : 172;

  return (
    <>
      {createPortal(
        <AnimatePresence>
          <div className="fixed inset-0 z-[1060] flex items-end sm:items-center justify-center p-0 sm:p-4 pointer-events-none">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="absolute inset-0 pointer-events-auto"
              style={{
                background: 'rgba(0,0,0,0.82)',
                backdropFilter: 'blur(10px)',
              }}
            />

            {/* ── Main Game Modal ── force dark mode so children use dark vars */}
            <motion.div
              variants={isDesktop ? desktopV : mobileV}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              drag={!isDesktop ? 'y' : false}
              dragControls={dragControls}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.5 }}
              onDragEnd={(_, { offset, velocity }) => {
                if (offset.y > 100 || velocity.y > 500) onClose();
              }}
              className={cn(
                'dark relative w-full overflow-hidden flex flex-col pointer-events-auto',
                isDesktop
                  ? 'max-w-3xl rounded-[32px] max-h-[88vh]'
                  : 'h-[92vh] rounded-t-[28px]',
              )}
              style={{
                background:
                  'linear-gradient(165deg, #0b2015 0%, #081610 50%, #060e0a 100%)',
                boxShadow:
                  '0 0 0 1px rgba(34,197,94,0.12), 0 48px 120px -20px rgba(0,0,0,0.9), 0 0 60px -10px rgba(34,197,94,0.08)',
              }}
            >
              {/* Mobile drag handle — invisible hit area over banner top */}
              {!isDesktop && (
                <div
                  className="absolute top-0 left-0 right-0 h-10 z-50 touch-none"
                  onPointerDown={(e) => dragControls.start(e)}
                />
              )}

              {/* ══════════════════════ SCENE BANNER ══════════════════════ */}
              <div
                className="relative shrink-0 overflow-hidden"
                style={{ height: `${BANNER_H}px` }}
              >
                {/* Night-to-dawn sky */}
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(180deg, #010a04 0%, #031408 18%, #052912 42%, #083e1a 60%, #0a5421 80%, #0e6e2c 100%)',
                  }}
                />

                {/* Stars */}
                {STARS.map((s, i) => (
                  <div
                    key={i}
                    className="absolute rounded-full bg-white animate-pulse"
                    style={{
                      width: s.size,
                      height: s.size,
                      top: s.top,
                      left: s.left,
                      opacity: s.opacity,
                      animationDuration: s.dur,
                      animationDelay: s.delay,
                    }}
                  />
                ))}

                {/* Moon */}
                <div
                  className="absolute"
                  style={{
                    top: '10%',
                    right: '14%',
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    background:
                      'radial-gradient(circle at 35% 35%, #fef3c7 0%, #fde68a 50%, #fcd34d 100%)',
                    boxShadow:
                      '0 0 16px 4px rgba(253,230,138,0.35), 0 0 40px 8px rgba(253,230,138,0.1)',
                  }}
                />
                {/* Moon crater shadows */}
                <div
                  className="absolute rounded-full"
                  style={{
                    top: 'calc(10% + 6px)',
                    right: 'calc(14% + 6px)',
                    width: '7px',
                    height: '7px',
                    background: 'rgba(0,0,0,0.15)',
                  }}
                />

                {/* Distant trees (left) */}
                {[8, 16, 4].map((h, i) => (
                  <div
                    key={i}
                    className="absolute bottom-[62px]"
                    style={{
                      left: `${4 + i * 7}%`,
                      width: `${14 + i * 4}px`,
                      height: `${40 + h}px`,
                      background:
                        'linear-gradient(180deg, #063d15 0%, #052e10 100%)',
                      borderRadius: `${7 + i * 2}px ${7 + i * 2}px 3px 3px`,
                      opacity: 0.7 + i * 0.1,
                    }}
                  />
                ))}

                {/* Distant trees (right) */}
                {[12, 6, 10].map((h, i) => (
                  <div
                    key={i}
                    className="absolute bottom-[62px]"
                    style={{
                      right: `${4 + i * 7}%`,
                      width: `${12 + i * 4}px`,
                      height: `${38 + h}px`,
                      background:
                        'linear-gradient(180deg, #063d15 0%, #052e10 100%)',
                      borderRadius: `${6 + i * 2}px ${6 + i * 2}px 3px 3px`,
                      opacity: 0.65 + i * 0.1,
                    }}
                  />
                ))}

                {/* Rolling hills SVG */}
                <div
                  className="absolute bottom-0 left-0 right-0"
                  style={{ height: '80px' }}
                >
                  <svg
                    viewBox="0 0 400 80"
                    className="absolute inset-0 w-full h-full"
                    preserveAspectRatio="none"
                  >
                    <path
                      d="M0,42 Q60,14 130,36 Q210,58 290,22 Q340,6 400,30 L400,80 L0,80 Z"
                      fill="#1a6b33"
                    />
                    <path
                      d="M0,54 Q70,34 140,50 Q210,66 285,38 Q340,22 400,46 L400,80 L0,80 Z"
                      fill="#145d29"
                    />
                    <path
                      d="M0,63 Q90,48 170,60 Q250,72 330,54 Q368,46 400,60 L400,80 L0,80 Z"
                      fill="#0e4120"
                    />
                    {/* Ground */}
                    <rect x="0" y="68" width="400" height="12" fill="#0a2f17" />
                  </svg>
                </div>

                {/* Stone path leading up */}
                <div
                  className="absolute bottom-0 left-1/2 -translate-x-1/2"
                  style={{
                    width: '76px',
                    height: '72px',
                    background:
                      'linear-gradient(180deg, #c8a85a 0%, #a07c30 60%, #7a5c1a 100%)',
                    clipPath: 'polygon(20% 0%, 80% 0%, 102% 100%, -2% 100%)',
                  }}
                >
                  {/* Path stones */}
                  {[0, 1, 2, 3].map((j) => (
                    <div
                      key={j}
                      style={{
                        position: 'absolute',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        top: `${12 + j * 16}px`,
                        width: `${28 - j * 4}px`,
                        height: '6px',
                        background: 'rgba(255,255,255,0.12)',
                        borderRadius: '3px',
                      }}
                    />
                  ))}
                </div>

                {/* Ambient glow behind sign */}
                <div
                  className="absolute pointer-events-none"
                  style={{
                    top: '-10px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '260px',
                    height: '130px',
                    filter: 'blur(40px)',
                    background:
                      'radial-gradient(ellipse, rgba(34,197,94,0.22) 0%, rgba(74,222,128,0.06) 60%, transparent 80%)',
                  }}
                />

                {/* Sign post + board */}
                <div
                  className="absolute flex flex-col items-center"
                  style={{
                    top: '14px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                  }}
                >
                  {/* Post */}
                  <div
                    style={{
                      width: '13px',
                      height: '34px',
                      background:
                        'linear-gradient(90deg, #6b3a0a 0%, #92520e 40%, #6b3a0a 100%)',
                      borderRadius: '3px 3px 2px 2px',
                      boxShadow: '2px 0 6px rgba(0,0,0,0.5)',
                    }}
                  />
                  {/* Sign board */}
                  <div
                    style={{
                      marginTop: '-3px',
                      padding: isDesktop ? '10px 24px' : '8px 18px',
                      background:
                        'linear-gradient(150deg, #b45309 0%, #92400e 55%, #7c3409 100%)',
                      borderRadius: '10px',
                      border: '3px solid #d97706',
                      boxShadow:
                        '0 8px 28px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.07) inset, 0 2px 0 rgba(255,255,255,0.1) inset',
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 900,
                        fontSize: isDesktop ? '21px' : '16px',
                        color: '#fef3c7',
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        textShadow:
                          '0 2px 8px rgba(0,0,0,0.7), 0 0 16px rgba(251,191,36,0.25)',
                        display: 'block',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      🎁 Daily Rewards
                    </span>
                  </div>
                </div>

                {/* Frog character */}
                <div
                  className="absolute select-none"
                  style={{
                    bottom: '18px',
                    right: isDesktop ? '11%' : '8%',
                    fontSize: isDesktop ? '38px' : '30px',
                    filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.55))',
                    animation: 'float-blob 4s ease-in-out infinite',
                  }}
                >
                  🐸
                </div>

                {/* Decorative foliage */}
                <div
                  className="absolute select-none"
                  style={{
                    bottom: '18px',
                    left: isDesktop ? '10%' : '6%',
                    fontSize: '26px',
                    filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.4))',
                  }}
                >
                  🌿
                </div>
                <div
                  className="absolute select-none"
                  style={{
                    bottom: '26px',
                    left: isDesktop ? '17%' : '14%',
                    fontSize: '18px',
                    opacity: 0.75,
                  }}
                >
                  🌿
                </div>
                <div
                  className="absolute select-none"
                  style={{
                    bottom: '20px',
                    right: isDesktop ? '21%' : '18%',
                    fontSize: '16px',
                    opacity: 0.6,
                  }}
                >
                  🌱
                </div>

                {/* Fireflies */}
                {[
                  { x: '20%', y: '55%', d: '0s' },
                  { x: '75%', y: '48%', d: '1s' },
                  { x: '35%', y: '40%', d: '0.5s' },
                ].map((f, i) => (
                  <div
                    key={i}
                    className="absolute rounded-full animate-pulse"
                    style={{
                      left: f.x,
                      top: f.y,
                      width: '4px',
                      height: '4px',
                      background: '#86efac',
                      boxShadow: '0 0 6px 2px rgba(134,239,172,0.7)',
                      animationDelay: f.d,
                      animationDuration: '2s',
                    }}
                  />
                ))}

                {/* Bottom gradient fade into content */}
                <div
                  className="absolute bottom-0 left-0 right-0 h-10 pointer-events-none"
                  style={{
                    background:
                      'linear-gradient(180deg, transparent 0%, #081610 100%)',
                  }}
                />
              </div>
              {/* ═══════════════════ END SCENE BANNER ═══════════════════ */}

              {/* Content */}
              <div className="flex-1 w-full flex flex-col min-h-0">
                <MonthProgress
                  progress={{
                    ...statusData.dailyRewards,
                    lastClaimDate: statusData.dailyRewards.lastClaimDate
                      ? new Date(statusData.dailyRewards.lastClaimDate)
                      : null,
                  }}
                  currentDay={currentDay}
                  isPremium={statusData.isPremium}
                  onClaim={handleClaim}
                  onGoPremium={() => setShowPremiumPopup(true)}
                />
              </div>

              {/* Close button — floats over banner */}
              <button
                onClick={onClose}
                className="absolute top-3 right-3 z-50 flex items-center justify-center w-9 h-9 rounded-full transition-all hover:scale-110 active:scale-95"
                style={{
                  background: 'rgba(0,0,0,0.55)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  backdropFilter: 'blur(8px)',
                  color: 'rgba(255,255,255,0.9)',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
                }}
              >
                <X size={16} />
              </button>

              {/* Loading overlay */}
              {claiming && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
                </div>
              )}
            </motion.div>
          </div>
        </AnimatePresence>,
        document.body,
      )}

      {/* Premium Upsell Popup */}
      {showPremiumPopup &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-300">
            <div
              onClick={() => setShowPremiumPopup(false)}
              className="absolute inset-0"
            />
            <div className="dark relative bg-card border border-border w-full max-w-md p-0 rounded-[32px] shadow-2xl overflow-hidden ring-1 ring-white/10">
              <div
                className="h-44 relative overflow-hidden flex items-center justify-center"
                style={{
                  background:
                    'linear-gradient(135deg, #a16207 0%, #92400e 60%, #78350f 100%)',
                }}
              >
                <div
                  className="absolute inset-0 opacity-30"
                  style={{
                    background:
                      'radial-gradient(ellipse at top, rgba(253,230,138,0.4) 0%, transparent 70%)',
                  }}
                />
                <div className="relative z-10 flex flex-col items-center gap-2">
                  <div className="bg-black/25 backdrop-blur-md p-4 rounded-[24px] ring-1 ring-white/20 shadow-xl">
                    <Sparkles className="w-8 h-8 text-amber-300" />
                  </div>
                  <div className="px-3 py-1 rounded-full bg-black/20 border border-amber-300/30">
                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-200">
                      Pro Feature
                    </span>
                  </div>
                </div>
              </div>
              <div className="p-8 pt-5">
                <div className="text-center mb-6">
                  <h3 className="text-2xl font-black tracking-tight mb-2 text-foreground">
                    Unlock Premium Rewards
                  </h3>
                  <p className="text-muted-foreground text-sm font-medium leading-relaxed">
                    Get exclusive daily rewards including rare skins and bonus
                    flies.
                  </p>
                </div>
                <div className="space-y-3 mb-7">
                  {[
                    {
                      text: 'Daily Premium Rewards',
                      sub: 'Exclusive items every day',
                    },
                    {
                      text: 'Rare Skins & Accessories',
                      sub: 'Stand out from the crowd',
                    },
                    { text: 'Bonus Flies', sub: 'Extra currency every day' },
                  ].map((f, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 p-3 rounded-2xl bg-muted/30 border border-border/30"
                    >
                      <div className="bg-amber-500/15 p-1.5 rounded-full ring-1 ring-amber-500/25">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground leading-none mb-0.5">
                          {f.text}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {f.sub}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-3">
                  <button
                    onClick={() => setShowPremiumPopup(false)}
                    className="w-full py-4 rounded-[20px] font-bold flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all"
                    style={{
                      background:
                        'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                      color: '#fef3c7',
                      boxShadow: '0 8px 24px rgba(217,119,6,0.4)',
                    }}
                  >
                    <Sparkles className="w-4 h-4" />
                    Upgrade Now
                  </button>
                  <button
                    onClick={() => setShowPremiumPopup(false)}
                    className="w-full py-3 rounded-[20px] text-xs font-bold text-muted-foreground hover:text-foreground transition-colors hover:bg-muted/20"
                  >
                    Maybe Later
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
