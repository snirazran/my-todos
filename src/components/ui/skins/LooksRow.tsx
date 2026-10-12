'use client';

import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Bookmark, Check, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { DragScrollRow } from '@/components/ui/DragScrollRow';
import { Icon } from '@/components/ui/Icon';
import { useLooks } from '@/hooks/useLooks';
import type { WardrobeSlot } from '@/lib/skins/catalog';
import { LOOK_SLOTS, SAVED_LOOKS_PLUS } from '@/lib/skins/looks';
import { CloseButton } from '@/components/ui/CloseButton';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import { useWardrobeTryOn } from '@/lib/wardrobeTryOnStore';

type LooksProps = {
  enabled: boolean;
  equipped: Partial<Record<WardrobeSlot, string | null>> | undefined;
  equippedBackgroundId: string | null | undefined;
  onNotify: (n: { msg: string; type: 'error' | 'success' }) => void;
  onUpgrade: () => void;
};

export function SavedLooksButton(props: LooksProps) {
  const [open, setOpen] = React.useState(false);
  useRegisterOpenSheet(open);
  const onUpgrade = () => {
    setOpen(false);
    props.onUpgrade();
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border/60 bg-background/90 px-3 text-xs font-bold text-foreground shadow-sm backdrop-blur-md transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <Bookmark className="h-3.5 w-3.5 text-primary" />
          Saved looks
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1200] bg-black/30 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[1201] max-h-[80dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-3xl border border-border bg-background p-5 shadow-xl sm:p-6">
          <CloseButton onClick={() => setOpen(false)} ariaLabel="Close saved looks" />
          <Dialog.Title className="pr-10 text-xl font-black">Saved looks</Dialog.Title>
          <Dialog.Description className="mt-1 pr-6 text-sm text-muted-foreground">
            Keep your favorite outfits. Tap a look to wear it again.
          </Dialog.Description>
          <div className="mt-5">
            <LooksRow
              {...props}
              onUpgrade={onUpgrade}
              enabled={open && props.enabled}
              inDialog
              onApplied={() => {
                useWardrobeTryOn.getState().setTryOn(null);
                setOpen(false);
              }}
              action={<SaveFitButton {...props} onUpgrade={onUpgrade} enabled={open && props.enabled} />}
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function SaveFitButton({
  enabled,
  equipped,
  equippedBackgroundId,
  onNotify,
  onUpgrade,
}: {
  enabled: boolean;
  equipped: Partial<Record<WardrobeSlot, string | null>> | undefined;
  equippedBackgroundId: string | null | undefined;
  onNotify: (n: { msg: string; type: 'error' | 'success' }) => void;
  onUpgrade: () => void;
}) {
  const { looks, max, isPremium, isFull, busy, save } = useLooks(enabled);

  const alreadySaved = React.useMemo(
    () =>
      looks.some(
        (look) =>
          LOOK_SLOTS.every(
            (slot) =>
              (look.equipped[slot] ?? null) === (equipped?.[slot] ?? null),
          ) && (look.backgroundId ?? null) === (equippedBackgroundId ?? null),
      ),
    [looks, equipped, equippedBackgroundId],
  );

  if (!enabled) return null;

  if (alreadySaved) {
    return (
      <span className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-black tracking-wide text-muted-foreground">
        <Bookmark className="h-3 w-3 fill-current" />
        Saved
      </span>
    );
  }

  if (isFull) {
    if (isPremium) return null;
    return (
      <button
        type="button"
        onClick={onUpgrade}
        className="plus-upgrade-button ml-auto inline-flex min-h-9 items-center gap-1 rounded-full bg-amber-100 px-3 text-[12px] font-black tracking-wide text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
      >
        <Icon name="frogPlus" label="Plus" className="h-3.5 w-3.5" />
        {SAVED_LOOKS_PLUS} look slots
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        const result = await save();
        if (result.ok) onNotify({ msg: 'Look saved!', type: 'success' });
        else if (result.error) onNotify({ msg: result.error, type: 'error' });
      }}
      className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-full bg-primary/10 px-3 text-[12px] font-black tracking-wide text-primary transition-colors hover:bg-primary/15 disabled:opacity-50"
    >
      <Plus className="h-3 w-3" strokeWidth={3} />
      Save fit
      <span className="tabular-nums text-muted-foreground">
        {looks.length}/{max}
      </span>
    </button>
  );
}

/**
 * Saved outfits. Without this, a combination you liked is gone the moment
 * anything changes it — which Style Shuffle does on a timer.
 */
export function LooksRow({
  enabled,
  equipped,
  equippedBackgroundId,
  onNotify,
  onUpgrade,
  action,
  inDialog = false,
  onApplied,
}: LooksProps & {
  action?: React.ReactNode;
  inDialog?: boolean;
  onApplied?: () => void;
}) {
  const { looks, max, isPremium, isFull, busy, apply, remove } =
    useLooks(enabled);
  const [removing, setRemoving] = React.useState(false);

  const wearingId = React.useMemo(() => {
    const match = looks.find(
      (look) =>
        LOOK_SLOTS.every(
          (slot) => (look.equipped[slot] ?? null) === (equipped?.[slot] ?? null),
        ) &&
        (look.backgroundId ?? null) === (equippedBackgroundId ?? null),
    );
    return match?.id ?? null;
  }, [looks, equipped, equippedBackgroundId]);

  React.useEffect(() => {
    if (!looks.length) setRemoving(false);
  }, [looks.length]);

  if (!enabled) return null;
  if (!looks.length) {
    if (!action) return null;
    return (
      <div className="pb-3">
        <div className="flex items-center gap-2 px-1">
          <p className="text-[13px] font-black text-foreground">{inDialog ? 'Your first look' : 'Saved looks'}</p>
          {action}
        </div>
        <p className="mt-0.5 px-1 text-[12px] font-semibold text-muted-foreground">
          Save your outfit to switch back to it in one tap.
        </p>
      </div>
    );
  }

  const handleApply = async (lookId: string, name: string) => {
    if (lookId === wearingId) {
      onApplied?.();
      return;
    }
    const ok = await apply(lookId);
    onNotify(
      ok
        ? { msg: `Wearing ${name}`, type: 'success' }
        : { msg: 'Could not wear that look.', type: 'error' },
    );
    if (ok) onApplied?.();
  };

  return (
    <div className="pb-2">
      <div className="mb-2 flex items-center gap-2 px-1">
        <p className="text-[13px] font-black text-foreground">
          {inDialog ? 'Your outfits' : 'Saved looks'}
        </p>
        <span className="text-[11px] font-bold tabular-nums text-muted-foreground">
          {looks.length}/{max}
        </span>
        {action}
        <button
          type="button"
          onClick={() => setRemoving((v) => !v)}
          className={cn(
            'min-h-9 rounded-full px-2 text-[12px] font-black tracking-wide transition-colors',
            !action && 'ml-auto',
            removing
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted',
          )}
        >
          {removing ? 'Done' : 'Edit'}
        </button>
      </div>

      <LooksLayout grid={inDialog}>
        {looks.map((look) => {
          const isWearing = look.id === wearingId;
          return (
            <div key={look.id} className="relative shrink-0">
              <button
                type="button"
                onClick={() => handleApply(look.id, look.name)}
                disabled={busy || removing}
                title={look.name}
                aria-label={`Wear ${look.name}`}
                className={cn(
                  'relative flex items-end justify-center overflow-hidden rounded-xl border-2 bg-muted/40 transition-transform active:scale-[0.97] disabled:opacity-90',
                  inDialog ? 'aspect-square w-full' : 'h-[104px] w-[84px]',
                  isWearing ? 'border-[#4f9149]' : 'border-border/50',
                )}
              >
                {look.backgroundImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={look.backgroundImage}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                )}
                <FrogSnapshot
                  className="relative"
                  indices={look.indices}
                  width={inDialog ? '124%' : 120}
                  height={inDialog ? '124%' : 120}
                />
                {isWearing && !removing && (
                  <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-[#4f9149] text-white shadow-sm">
                    <Check className="h-2.5 w-2.5 stroke-[4]" />
                  </span>
                )}
              </button>
              {inDialog && (
                <p className="mt-1.5 truncate text-center text-xs font-bold text-muted-foreground">
                  {isWearing ? 'Wearing' : look.name}
                </p>
              )}

              {removing && (
                <button
                  type="button"
                  aria-label={`Delete ${look.name}`}
                  onClick={() => void remove(look.id)}
                  // Kept inside the card box — the scroll row clips anything
                  // hanging outside it.
                  className="absolute right-1.5 top-1.5 z-10 grid h-6 w-6 place-items-center rounded-full bg-rose-500 text-white shadow-md ring-2 ring-background"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={3} />
                </button>
              )}
            </div>
          );
        })}

        {isFull && !isPremium && (
          <button
            type="button"
            onClick={onUpgrade}
            className={cn('plus-upgrade-button flex shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-amber-400/60 bg-amber-50 px-1 text-center text-amber-700 transition-transform active:scale-[0.97] dark:bg-amber-950/30 dark:text-amber-400', inDialog ? 'aspect-square w-full' : 'h-[104px] w-[84px]')}
          >
            <Icon name="frogPlus" label="Plus" className="h-8 w-8" />
            <span className="text-[9px] font-black leading-tight">
              {SAVED_LOOKS_PLUS} slots
              <br />
              with Plus
            </span>
          </button>
        )}
      </LooksLayout>
    </div>
  );
}

function LooksLayout({ grid, children }: { grid: boolean; children: React.ReactNode }) {
  return grid ? (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">{children}</div>
  ) : (
    <DragScrollRow>{children}</DragScrollRow>
  );
}
