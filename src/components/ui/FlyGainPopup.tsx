'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { FlyCounter } from '@/components/ui/FlyCounter';
import { useInventory } from '@/hooks/useInventory';

type Toast = { id: number; from: number; to: number };

let nextId = 0;

export function FlyGainPopup() {
  const { data } = useInventory(true, true);
  const balance = data?.wardrobe?.flies;
  const prevRef = useRef<number | undefined>(undefined);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    if (typeof balance !== 'number') return;
    const prev = prevRef.current;
    prevRef.current = balance;
    if (prev === undefined || prev === balance) return;
    const id = ++nextId;
    setToast({ id, from: prev, to: balance });
    const timer = window.setTimeout(() => {
      setToast((curr) => (curr?.id === id ? null : curr));
    }, 3200);
    return () => window.clearTimeout(timer);
  }, [balance]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence mode="wait">
      {toast && <Pill key={toast.id} toast={toast} />}
    </AnimatePresence>,
    document.body,
  );
}

function Pill({ toast }: { toast: Toast }) {
  const [value, setValue] = useState(toast.from);

  useEffect(() => {
    const timer = window.setTimeout(() => setValue(toast.to), 260);
    return () => window.clearTimeout(timer);
  }, [toast.to]);

  return (
    <motion.div
      className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+3rem)] z-[10000] flex justify-center px-4 md:hidden"
      initial={{ opacity: 1, y: -42, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 1, y: -140, scale: 0.96 }}
      transition={{ duration: 0.42, ease: [0.32, 0.72, 0, 1] }}
    >
      <FlyCounter balance={value} variant="mobile" />
    </motion.div>
  );
}
