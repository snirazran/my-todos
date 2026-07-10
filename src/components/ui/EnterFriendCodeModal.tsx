'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2, X } from 'lucide-react';
import { mutate as swrMutate } from 'swr';
import { useRegisterOpenSheet } from '@/lib/sheetStore';

export function EnterFriendCodeModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useRegisterOpenSheet(open);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [sentLabel, setSentLabel] = useState('Friend request sent!');

  useEffect(() => {
    if (!open) return;
    setCode('');
    setError(null);
    setSent(false);
    setLoading(false);
  }, [open]);

  const handleSend = async () => {
    const trimmed = code.trim();
    if (!trimmed || loading || sent) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed, source: 'code' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not send request');
        return;
      }
      setSentLabel(
        data.alreadyFriends
          ? 'Already your friend!'
          : data.autoAccepted
            ? "You're now friends!"
            : 'Friend request sent!',
      );
      setSent(true);
      swrMutate('/api/friends');
      swrMutate('/api/friends/request');
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[1500] bg-black/70 backdrop-blur-sm"
          />
          <div className="pointer-events-none fixed inset-0 z-[1501] flex items-center justify-center p-5">
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 12 }}
              transition={{ type: 'spring', damping: 26, stiffness: 300 }}
              className="pointer-events-auto relative w-full max-w-md rounded-[28px] border border-border bg-popover px-6 pb-7 pt-8 text-center text-popover-foreground shadow-2xl"
            >
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <X className="h-5 w-5" />
              </button>

              <h2 className="text-2xl font-black tracking-tight text-foreground">
                Enter Friend Code
              </h2>
              <p className="mt-1 text-[15px] font-medium text-muted-foreground">
                Enter your friend&apos;s code to find them!
              </p>

              <input
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setSent(false);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSend();
                }}
                placeholder="Enter code here..."
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                className="mt-6 h-14 w-full rounded-2xl border border-input bg-background px-5 text-center text-lg font-bold tracking-[0.12em] text-foreground outline-none ring-primary placeholder:font-medium placeholder:tracking-normal placeholder:text-muted-foreground focus:ring-2"
              />

              {error && (
                <p className="mt-3 text-sm font-bold text-rose-500">{error}</p>
              )}

              {sent && (
                <div className="mt-3 flex items-center justify-center gap-2 rounded-2xl bg-primary/10 px-4 py-3 text-sm font-black text-primary">
                  <Check className="h-4 w-4" strokeWidth={3} />
                  {sentLabel}
                </div>
              )}

              <button
                onClick={handleSend}
                disabled={loading || !code.trim() || sent}
                className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#5f9654] text-lg font-black tracking-tight text-white shadow-[0_5px_0_#47783d] transition-all hover:bg-[#548849] active:translate-y-0.5 disabled:opacity-60"
              >
                {loading && <Loader2 className="h-5 w-5 animate-spin" />}
                {sent ? 'Sent!' : 'Send friend request'}
              </button>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
