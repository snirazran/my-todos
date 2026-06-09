'use client';

import React from 'react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { RepeatView } from '@/components/ui/quick-add/RepeatView';
import type { RepeatMode } from '@/components/ui/quick-add/utils';

interface TaskRepeatPopupProps {
  open: boolean;
  onClose: () => void;
  currentMode: RepeatMode;
  repeatDayLabel: string;
  onChange: (mode: RepeatMode) => void;
}

export function TaskRepeatPopup({
  open,
  onClose,
  currentMode,
  repeatDayLabel,
  onChange,
}: TaskRepeatPopupProps) {
  return (
    <BaseSheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      zIndex={1500}
      className="sm:max-w-[400px]"
    >
      {() => (
        <div className="px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-2 sm:pt-5">
          <h3 className="mb-1 text-center text-[17px] font-black text-foreground">
            Repeat
          </h3>
          <p className="mb-4 text-center text-[12px] font-medium text-muted-foreground">
            Choose when this task comes back.
          </p>

          <RepeatView
            currentMode={currentMode}
            setRepeatMode={onChange}
            repeatDayLabel={repeatDayLabel}
            onClose={onClose}
          />

          <button
            onClick={onClose}
            className="mt-4 h-11 w-full rounded-xl text-[13px] font-bold text-muted-foreground transition-colors hover:bg-muted/60"
          >
            Done
          </button>
        </div>
      )}
    </BaseSheet>
  );
}
