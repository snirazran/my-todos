'use client';

import { motion } from 'framer-motion';

type Props = Readonly<{
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}>;

export default function Seg({ icon, active, onClick, children }: Props) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={[
        'group flex items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 text-sm transition shadow-sm',
        active
          ? 'border-emerald-600 bg-gradient-to-br from-emerald-500 to-lime-500 text-emerald-950'
          : 'border-emerald-600/10 bg-emerald-50/60 hover:bg-emerald-100/70 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-100 dark:border-emerald-400/10 dark:hover:bg-emerald-800/50',
      ].join(' ')}
    >
      <span className="opacity-90 group-hover:opacity-100">{icon}</span>
      {children}
    </motion.button>
  );
}
