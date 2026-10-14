'use client';

import { BaseSheet } from '@/components/ui/BaseSheet';
import { SHEET_TITLE } from './kit';
import { SuggestionTabs, type SuggestionPick } from './SuggestionTabs';

export function SavedTasksSheet({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (pick: SuggestionPick) => void;
}) {
  return (
    <BaseSheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      zIndex={1500}
      className="bg-background ring-1 ring-border/70 sm:mx-4 sm:max-w-[520px] max-h-[85vh]"
    >
      {({ bindScroll }) => (
        <div
          ref={bindScroll}
          className="mx-auto min-h-0 w-full flex-1 overflow-y-auto overscroll-none px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-1 sm:pb-8"
        >
          <div className="relative mb-5 flex h-9 items-center justify-center">
            <h2 className={SHEET_TITLE}>Saved Tasks</h2>
          </div>
          <SuggestionTabs
            open={open}
            variant="list"
            onPick={(pick) => {
              onPick(pick);
              onClose();
            }}
          />
        </div>
      )}
    </BaseSheet>
  );
}
