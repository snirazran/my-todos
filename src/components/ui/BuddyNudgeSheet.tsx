'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useRandomReveal } from '@/hooks/useRandomReveal';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { BuddyStartFlow } from '@/components/ui/BuddyStartFlow';
import Frog from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import type { FriendSummary } from '@/lib/friends/indices';

const BUDDY = '#4f9149';

type WardrobeIndices = Partial<
  Record<'skin' | 'hat' | 'body' | 'hand_item', number>
>;

export function BuddyNudgeSheet({
  friends,
  indices,
  ready,
}: {
  friends: FriendSummary[];
  indices?: WardrobeIndices;
  ready: boolean;
}) {
  const { show, dismiss } = useRandomReveal('friends_buddy');
  const [open, setOpen] = useState(false);
  const [flowOpen, setFlowOpen] = useState(false);

  useEffect(() => {
    if (!ready || !show) return;
    let cancelled = false;
    const openSheet = () => {
      if (!cancelled) setOpen(true);
    };
    const raf = requestAnimationFrame(() => {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(openSheet, { timeout: 1000 });
      } else {
        setTimeout(openSheet, 350);
      }
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [ready, show]);

  const closeSheet = (dismissed: boolean) => {
    setOpen(false);
    if (dismissed) dismiss();
  };

  return (
    <>
      <BaseSheet
        open={open && !flowOpen}
        onOpenChange={(v) => !v && closeSheet(true)}
        closeAriaLabel="Not now"
        className="sm:max-w-md"
      >
        {({ entered }) => (
          <div className="flex flex-col px-6 pb-[calc(env(safe-area-inset-bottom)+1.75rem)] pt-9 text-center">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-36"
              style={{
                background: `radial-gradient(120% 90% at 50% 0%, ${BUDDY}26 0%, transparent 70%)`,
              }}
            />
            <div className="relative mx-auto mb-3 h-24 w-40">
              {entered && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.25 }}
                  className="relative flex h-full w-full items-end justify-center"
                >
                  <div className="relative z-10 translate-x-4">
                    <Frog width={132} height={118} indices={indices} paused />
                  </div>
                  <div className="relative z-0 -ml-10 -translate-x-2 scale-90">
                    <Frog width={132} height={118} paused />
                  </div>
                  <span className="absolute -top-1 left-1/2 -translate-x-1/2">
                    <Fly size={30} y={-3} paused />
                  </span>
                </motion.div>
              )}
            </div>

            <h2 className="text-2xl font-black tracking-tight text-foreground">
              Catch flies together!
            </h2>
            <p className="mx-auto mt-1.5 max-w-xs text-[15px] font-medium text-muted-foreground">
              Share a repeating task with a friend. Every day you both finish it,
              you both catch extra flies.
            </p>

            <button
              type="button"
              onClick={() => setFlowOpen(true)}
              className="mt-6 flex h-14 w-full items-center justify-center rounded-2xl bg-[#4f9149] text-lg font-black tracking-tight text-white shadow-[0_5px_0_#34631f] transition-all active:translate-y-0.5 active:shadow-none"
            >
              Find a buddy
            </button>
            <button
              type="button"
              onClick={() => closeSheet(true)}
              className="mt-2 h-11 w-full rounded-2xl text-base font-black tracking-tight text-muted-foreground transition-colors hover:text-foreground"
            >
              Not now
            </button>
          </div>
        )}
      </BaseSheet>

      <BuddyStartFlow
        open={flowOpen}
        onClose={() => {
          setFlowOpen(false);
          closeSheet(false);
        }}
        friends={friends}
        indices={indices}
      />
    </>
  );
}
