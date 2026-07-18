'use client';

import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

export function AccountConflictDialog({
  open,
  busy,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  busy?: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[1400] flex items-center justify-center bg-black/60 px-5 backdrop-blur-sm"
          onClick={busy ? undefined : onCancel}
        >
          <motion.div
            initial={{ scale: 0.95, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 10 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-[28px] bg-card p-6 text-center shadow-2xl ring-1 ring-border/60"
          >
            <h2 className="text-lg font-black tracking-tight text-foreground">
              {title}
            </h2>
            <p className="mt-2 text-sm font-medium text-muted-foreground">
              {message}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={onConfirm}
              className="mt-5 flex h-12 w-full items-center justify-center rounded-2xl bg-primary text-sm font-black uppercase tracking-wider text-primary-foreground transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : confirmLabel}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="mt-2 h-11 w-full rounded-2xl text-sm font-bold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
            >
              Cancel
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
