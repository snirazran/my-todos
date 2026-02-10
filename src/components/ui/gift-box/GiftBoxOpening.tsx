'use client';

import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { ItemDef, byId } from '@/lib/skins/catalog';
import { cn } from '@/lib/utils';
import { RARITY_CONFIG } from './constants';
import { RotatingRays } from './RotatingRays';
import { GiftBox } from './GiftBox';
import { RewardCard } from './RewardCard';
import { FUNNY_SENTENCES } from './funnySentences';

export default function GiftBoxOpening({
  onClose,
  onWin,
  giftBoxId = 'gift_box_1',
}: {
  onClose: () => void;
  onWin?: (item: ItemDef) => void;
  giftBoxId?: string;
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const [phase, setPhase] = useState<'idle' | 'shaking' | 'revealed'>('idle');
  const [prize, setPrize] = useState<ItemDef | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [loadingText, setLoadingText] = useState(
    () => FUNNY_SENTENCES[Math.floor(Math.random() * FUNNY_SENTENCES.length)],
  );
  const [mounted, setMounted] = useState(false);
  const [showGuestPrompt, setShowGuestPrompt] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle opening logic
  const handleOpen = async () => {
    if (phase !== 'idle') return;
    setPhase('shaking');

    // Cycle funny sentences
    const interval = setInterval(() => {
      setLoadingText(
        FUNNY_SENTENCES[Math.floor(Math.random() * FUNNY_SENTENCES.length)],
      );
    }, 2000);

    try {
      // 1. Minimum animation time promise
      const animationPromise = new Promise((resolve) =>
        setTimeout(resolve, 2000),
      );

      // GUEST MODE: Skip API
      if (!session) {
        await animationPromise;
        // Guest always wins Wizard Hat
        const guestPrize = byId['hat_wizard'] || byId['skin_teal'];
        setPrize(guestPrize);
        if (onWin) onWin(guestPrize);
        setPhase('revealed');
        return;
      }

      // 2. API call promise
      const apiPromise = fetch('/api/skins/open-gift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ giftBoxId }),
      }).then((res) => {
        if (!res.ok) throw new Error('Failed to open gift');
        return res.json();
      });

      // Wait for both
      const [_, data] = await Promise.all([animationPromise, apiPromise]);

      if (data.prize) {
        setPrize(data.prize);
        if (onWin) onWin(data.prize); // Notify parent immediately or on claim?
        setPhase('revealed');
      } else {
        throw new Error('No prize returned');
      }
    } catch (err) {
      console.error(err);
      onClose(); // Close on error
    } finally {
      clearInterval(interval);
    }
  };

  const handleClaim = () => {
    if (!session) {
      setShowGuestPrompt(true);
      return;
    }
    // Prize is already in inventory from the open-gift API call
    // Just close the modal
    onClose();
  };

  const config = prize ? RARITY_CONFIG[prize.rarity] : RARITY_CONFIG.common;

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden pointer-events-auto">
      {/* Background Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm"
      />

      {/* Dynamic God Rays for Reveal */}
      <AnimatePresence>
        {phase === 'revealed' && prize && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-0 flex items-center justify-center"
          >
            <RotatingRays colorClass={config.rays} />
            <div
              className={cn(
                'absolute inset-0 bg-radial-gradient from-transparent to-slate-950/80',
              )}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Close Button - Only for signed in users */}
      {phase === 'idle' && session && (
        <button
          onClick={onClose}
          className="absolute z-50 p-3 transition-all rounded-full top-4 right-4 md:top-8 md:right-8 bg-black/20 hover:bg-black/40 text-white/70 hover:text-white backdrop-blur-md"
        >
          <X className="w-6 h-6" />
        </button>
      )}

      {/* Main Content */}
      <div
        className={cn(
          'relative z-10 flex flex-col items-center justify-center w-full max-w-md p-6 transition-transform duration-500',
          phase !== 'revealed' && '-translate-y-20',
        )}
      >
        <AnimatePresence mode="wait">
          {/* --- GIFT PHASE --- */}
          {phase !== 'revealed' && (
            <GiftBox
              key="gift"
              phase={phase}
              onOpen={handleOpen}
              loadingText={loadingText}
            />
          )}

          {/* --- REVEAL PHASE --- */}
          {phase === 'revealed' && prize && (
            <RewardCard
              key="card"
              prize={prize}
              claiming={claiming}
              onClaim={handleClaim}
            />
          )}
        </AnimatePresence>
      </div>

      {/* --- GUEST PROMPT OVERLAY --- */}
      <AnimatePresence>
        {showGuestPrompt && (
          <div className="absolute inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm overflow-hidden bg-white shadow-2xl rounded-3xl dark:bg-slate-900"
            >
              <div className="relative h-32 bg-gradient-to-br from-amber-400 to-orange-500">
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-6xl animate-bounce">👑</span>
                </div>
              </div>
              <div className="p-6 text-center">
                <h3 className="mb-2 text-2xl font-black text-slate-900 dark:text-white">
                  Save Your Prize!
                </h3>
                <p className="mb-6 text-slate-500 dark:text-slate-400">
                  To add this{' '}
                  <span className="font-bold text-amber-500">
                    Legendary Wizard Hat
                  </span>{' '}
                  to your collection, you need to sign in.
                </p>
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => router.push('/register')}
                    className="w-full py-3.5 text-lg font-bold text-white transition-transform rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-95 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                  >
                    Sign Up & Claim
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
