'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { hapticCelebrate } from '@/lib/haptics';

const Frog = dynamic(() => import('@/components/ui/frog'), { ssr: false });

type Props = {
  frogName: string;
  humanName?: string | null;
};

export default function CelebrationStep({ frogName, humanName }: Props) {
  useEffect(() => {
    confetti({
      particleCount: 120,
      spread: 100,
      startVelocity: 42,
      origin: { y: 0.35 },
      zIndex: 99999,
      disableForReducedMotion: true,
    });
    const encore = setTimeout(() => {
      confetti({
        particleCount: 50,
        angle: 60,
        spread: 70,
        startVelocity: 34,
        origin: { x: 0.1, y: 0.6 },
        zIndex: 99999,
        disableForReducedMotion: true,
      });
      confetti({
        particleCount: 50,
        angle: 120,
        spread: 70,
        startVelocity: 34,
        origin: { x: 0.9, y: 0.6 },
        zIndex: 99999,
        disableForReducedMotion: true,
      });
    }, 450);
    hapticCelebrate();
    return () => clearTimeout(encore);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background px-6"
    >
      <motion.div
        initial={{ scale: 0.6, y: 24 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        className="pointer-events-none h-[259px] w-[230px]"
      >
        <Frog
          width={230}
          height={259}
          indices={{ skin: 0, hat: 0, body: 0, hand_item: 0 }}
          emote="love"
        />
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="mt-2 text-center text-2xl font-black tracking-tight text-foreground"
      >
        You&apos;re all set{humanName ? `, ${humanName}` : ''}!
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="mt-2 text-center text-base font-medium text-muted-foreground"
      >
        {`${frogName} can't wait to hop in.`}
      </motion.p>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9 }}
        className="mt-8 text-xs font-bold uppercase tracking-widest text-muted-foreground/70"
      >
        Preparing your pond…
      </motion.p>
    </motion.div>
  );
}
