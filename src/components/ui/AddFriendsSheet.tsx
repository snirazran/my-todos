'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { Search, QrCode, Gift } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { InviteFriendsModal } from '@/components/ui/InviteFriendsModal';
import { EnterFriendCodeModal } from '@/components/ui/EnterFriendCodeModal';
import { QRFriendModal } from '@/components/ui/QRFriendModal';
import { FriendSuggestionsRow } from '@/components/ui/FriendSuggestionsRow';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function AddFriendsSheet({
  open,
  onClose,
  indices,
}: {
  open: boolean;
  onClose: () => void;
  indices?: Partial<Record<'skin' | 'hat' | 'body' | 'hand_item', number>>;
}) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  // The rate is admin-tunable, so the pitch reads it live rather than baking a
  // number that can quietly stop being true.
  const { data: friendsData } = useSWR<{
    pond?: { tasksPerGeneration?: number; fliesPerGeneration?: number };
  }>(open ? '/api/friends' : null, fetcher, { revalidateOnFocus: false });
  const perTasks = friendsData?.pond?.tasksPerGeneration;
  const perFlies = friendsData?.pond?.fliesPerGeneration;

  return (
    <>
      <BaseSheet
        open={open}
        onOpenChange={(v) => !v && onClose()}
        className="border-0 sm:max-w-lg"
        closeAriaLabel="Close add friends"
        hideHandle
      >
        {({ entered, bindScroll }) => (
          <div
            ref={bindScroll}
            className="flex max-h-[calc(100dvh-env(safe-area-inset-top)-0.5rem)] flex-col overflow-y-auto overscroll-contain sm:max-h-[calc(100dvh-3rem)]"
          >
            {/* The art carries no copy: text baked over an image gets cropped,
                fights the illustration and can't be sized per screen. It sets
                the mood, the words live on the surface below where they're
                fully legible. */}
            <div className="relative shrink-0">
              <img
                src="/friend-share.webp"
                alt="Frogs passing the flies they catch to each other across a pond"
                className="h-[18dvh] max-h-[180px] w-full object-cover object-center sm:h-[210px] sm:max-h-none"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-background to-transparent"
              />
            </div>

            <div className="flex flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] sm:px-6">
              <h2 className="text-center text-[25px] font-black leading-[1.1] tracking-tight text-foreground min-[400px]:text-[28px]">
                Better together
              </h2>
              <p className="mx-auto mt-2 max-w-[21rem] text-center text-[13px] font-semibold leading-snug text-muted-foreground min-[400px]:text-sm">
                Invite a friend and give them a welcome outfit.{' '}
                {perTasks != null && perFlies != null
                  ? `You’ll earn ${perFlies} ${perFlies === 1 ? 'fly' : 'flies'} for every ${perTasks} tasks they finish.`
                  : 'You’ll earn flies as they finish tasks.'}
              </p>

              {/* One primary action, sized and coloured so nothing competes. */}
              <button
                type="button"
                onClick={() => setInviteOpen(true)}
                className="mt-4 flex h-14 w-full touch-manipulation items-center justify-center gap-2 rounded-2xl bg-[#447d3f] text-[17px] font-black tracking-tight text-white ring-1 ring-[#2c511a]/40 shadow-[0_4px_0_0_#2c511a] transition-all [@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:shadow-[0_5px_0_0_#2c511a] active:translate-y-1 active:shadow-none sm:h-[60px] sm:text-lg"
              >
                <Gift className="h-5 w-5" strokeWidth={2.5} />
                Invite friends
              </button>

              <FriendSuggestionsRow
                enabled={open && entered}
                variant="embedded"
                className="mt-5"
                title="Already on Frogress"
                subtitle="People you may know — add them in one tap"
              />

              {/* Entry methods, not offers: quiet row, equal weight, out of the
                  way of the action above. */}
              <div className="mt-5 border-t border-border/60 pt-3">
                <p className="mb-2 text-center text-[11px] font-bold text-muted-foreground">
                  Got a friend&apos;s code?
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setCodeOpen(true)}
                    className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-2.5 text-[13px] font-black tracking-tight text-foreground transition-transform active:scale-[0.98] [@media(hover:hover)]:hover:bg-muted/60"
                  >
                    <Search
                      className="h-4 w-4 text-muted-foreground"
                      strokeWidth={2.5}
                    />
                    Enter code
                  </button>
                  <button
                    type="button"
                    onClick={() => setQrOpen(true)}
                    className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-2.5 text-[13px] font-black tracking-tight text-foreground transition-transform active:scale-[0.98] [@media(hover:hover)]:hover:bg-muted/60"
                  >
                    <QrCode
                      className="h-4 w-4 text-muted-foreground"
                      strokeWidth={2.5}
                    />
                    QR code
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </BaseSheet>

      <InviteFriendsModal
        initialStep="overview"
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
      />
      <EnterFriendCodeModal
        open={codeOpen}
        onClose={() => setCodeOpen(false)}
      />
      <QRFriendModal
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        initialTab="mycode"
        indices={indices}
      />
    </>
  );
}
