'use client';

import React from 'react';
import { CalendarRange, CheckCircle2 } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';

interface EditScopeDialogProps {
  open: boolean;
  onClose: () => void;
  onChoose: (scope: 'one' | 'all') => void;
}

/**
 * Asked when editing a field that can apply to a whole repeat group
 * (name, tags, notify): "This task only" vs "All repeats". Slides up from the
 * bottom on mobile, centered on desktop — like the other sheets.
 */
export function EditScopeDialog({ open, onClose, onChoose }: EditScopeDialogProps) {
  return (
    <BaseSheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      zIndex={1600}
      className="sm:max-w-[400px]"
    >
      {() => (
        <div className="px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-2 sm:pt-5">
          <h3 className="mb-1 text-center text-[17px] font-black text-foreground">
            This is a repeating task
          </h3>
          <p className="mb-4 text-center text-[12px] font-medium text-muted-foreground">
            Apply this change to…
          </p>

          <button
            onClick={() => onChoose('one')}
            className="mb-2 flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-muted/30 px-4 py-3.5 text-left transition-colors hover:bg-muted/60"
          >
            <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
            <span className="text-[14px] font-bold text-foreground">
              This task only
            </span>
          </button>

          <button
            onClick={() => onChoose('all')}
            className="flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-muted/30 px-4 py-3.5 text-left transition-colors hover:bg-muted/60"
          >
            <CalendarRange className="h-5 w-5 shrink-0 text-primary" />
            <span className="text-[14px] font-bold text-foreground">
              All repeats
            </span>
          </button>

          <button
            onClick={onClose}
            className="mt-3 h-11 w-full rounded-xl text-[13px] font-bold text-muted-foreground transition-colors hover:bg-muted/60"
          >
            Cancel
          </button>
        </div>
      )}
    </BaseSheet>
  );
}
