'use client';

import React, { useState } from 'react';
import { Search, QrCode, ChevronRight } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { InviteFriendsModal } from '@/components/ui/InviteFriendsModal';
import { EnterFriendCodeModal } from '@/components/ui/EnterFriendCodeModal';
import { QRFriendModal } from '@/components/ui/QRFriendModal';

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

  return (
    <>
      <BaseSheet
        open={open}
        onOpenChange={(v) => !v && onClose()}
        className="border-0 sm:max-w-2xl"
        closeAriaLabel="Close add friends"
        hideHandle
      >
        {() => (
          <div className="flex flex-col">
            <div className="relative">
              <img
                src="/friend-share.png"
                alt="Friends sending the flies they catch into your basket"
                className="h-[44dvh] w-full object-cover object-center sm:h-auto sm:max-h-none"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-5 pb-4 pt-20 text-center sm:pb-5 sm:pt-10">
                <h2 className="text-2xl font-black tracking-tight text-white drop-shadow-[0_2px_5px_rgba(0,0,0,0.55)] sm:text-4xl">
                  Earn together!
                </h2>
                <p className="mx-auto mt-1 max-w-[24rem] text-[13px] font-semibold leading-snug text-white/90 drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)] min-[360px]:text-sm min-[400px]:text-[15px] sm:text-base">
                  They catch 2 flies, you get 1 — and your catch pays them back
                  the same way.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 px-5 pb-[calc(env(safe-area-inset-bottom)+1.75rem)] pt-4 sm:gap-4 sm:px-6 sm:pt-5">
              <button
                type="button"
                onClick={() => setInviteOpen(true)}
                className="flex items-center gap-3 rounded-2xl bg-[#4f9149] px-4 py-3.5 text-left text-white ring-1 ring-[#34631f]/40 shadow-[0_4px_0_0_#34631f] transition-all [@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:shadow-[0_5px_0_0_#34631f] active:translate-y-1 active:shadow-none sm:py-4"
              >
                <span className="text-2xl leading-none sm:text-3xl">🎁</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-black tracking-tight sm:text-lg">
                    Invite friends
                  </span>
                  <span className="block text-xs font-semibold text-white/80 sm:text-[13px]">
                    They join with a gift — you unlock outfits
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-white/80" />
              </button>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setCodeOpen(true)}
                  className="flex flex-col items-center gap-2.5 rounded-2xl border border-border/60 bg-muted/40 px-4 py-5 transition-transform active:scale-[0.98] sm:py-6"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sky-500/10 sm:h-12 sm:w-12">
                    <Search className="h-6 w-6 text-sky-500" strokeWidth={2.5} />
                  </span>
                  <span className="text-sm font-black tracking-tight text-foreground sm:text-base">
                    Enter code
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setQrOpen(true)}
                  className="flex flex-col items-center gap-2.5 rounded-2xl border border-border/60 bg-muted/40 px-4 py-5 transition-transform active:scale-[0.98] sm:py-6"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/10 sm:h-12 sm:w-12">
                    <QrCode className="h-6 w-6 text-emerald-600" strokeWidth={2.5} />
                  </span>
                  <span className="text-sm font-black tracking-tight text-foreground sm:text-base">
                    QR code
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}
      </BaseSheet>

      <InviteFriendsModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <EnterFriendCodeModal open={codeOpen} onClose={() => setCodeOpen(false)} />
      <QRFriendModal
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        initialTab="mycode"
        indices={indices}
      />
    </>
  );
}
