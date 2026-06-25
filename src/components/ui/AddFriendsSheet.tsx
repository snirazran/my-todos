'use client';

import React, { useState } from 'react';
import { Search, QrCode } from 'lucide-react';
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
        className="!bg-[#4f9149] bg-gradient-to-b from-[#57a84e] to-[#3f8038] text-white sm:max-w-md"
        closeAriaLabel="Close add friends"
      >
        {() => (
          <div
            className="flex flex-col gap-4 px-5 pb-[calc(env(safe-area-inset-bottom)+1.75rem)] pt-2"
          >
            <h2 className="text-center text-xl font-black tracking-tight text-white">
              Add Friends
            </h2>

            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="rounded-[22px] bg-white px-5 py-6 text-center shadow-sm transition-transform active:scale-[0.98]"
            >
              <div className="text-3xl">🎁</div>
              <p className="mt-1 text-xl font-black tracking-tight text-zinc-900">
                Invite your friends
              </p>
              <p className="mt-0.5 text-sm font-medium text-zinc-400">
                Get rewarded when they join!
              </p>
            </button>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setCodeOpen(true)}
                className="flex flex-col items-center gap-3 rounded-[22px] bg-white px-4 py-6 shadow-sm transition-transform active:scale-[0.98]"
              >
                <Search className="h-8 w-8 text-sky-500" strokeWidth={2.5} />
                <span className="text-base font-black tracking-tight text-zinc-900">
                  Enter code
                </span>
              </button>
              <button
                type="button"
                onClick={() => setQrOpen(true)}
                className="flex flex-col items-center gap-3 rounded-[22px] bg-white px-4 py-6 shadow-sm transition-transform active:scale-[0.98]"
              >
                <QrCode className="h-8 w-8 text-zinc-800" strokeWidth={2.5} />
                <span className="text-base font-black tracking-tight text-zinc-900">
                  QR code
                </span>
              </button>
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
