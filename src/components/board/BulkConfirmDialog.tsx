'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';

/**
 * Confirmation for a bulk action that can't be taken back — bulk delete hard-
 * removes one-off tasks, so it never gets an Undo toast the way a bulk move
 * does.
 */
export default function BulkConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <BaseSheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      zIndex={1600}
      className="sm:max-w-[400px]"
    >
      {() => (
        <div className="px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-2 sm:pt-5">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-red-500/12 text-red-500">
            <AlertTriangle className="h-7 w-7" strokeWidth={2.5} />
          </div>
          <h3 className="mb-1 text-center text-[17px] font-black text-foreground">
            {title}
          </h3>
          <p className="mx-auto mb-5 max-w-[20rem] text-center text-[13px] font-medium leading-snug text-muted-foreground">
            {description}
          </p>

          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="h-12 w-full rounded-2xl bg-red-500 text-[14px] font-black uppercase tracking-wide text-white transition active:translate-y-[2px]"
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="mt-2 h-11 w-full rounded-xl text-[13px] font-bold text-muted-foreground transition-colors hover:bg-muted/60"
          >
            Cancel
          </button>
        </div>
      )}
    </BaseSheet>
  );
}
