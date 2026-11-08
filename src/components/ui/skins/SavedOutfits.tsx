'use client';

import React, { useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, X } from 'lucide-react';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { Icon } from '@/components/ui/Icon';
import { useLooks } from '@/hooks/useLooks';
import { hapticTick } from '@/lib/haptics';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import type { WardrobeSlot } from '@/lib/skins/catalog';
import {
  LOOK_NAME_MAX,
  SAVED_LOOKS_PLUS,
  looksMatch,
  nextOutfitName,
  type SavedLookView,
} from '@/lib/skins/looks';
import { useWardrobeTryOn } from '@/lib/wardrobeTryOnStore';
import { cn } from '@/lib/utils';
import { ClosetEmptyPrompt, useShelfGrid } from './DressingRoom';

type Equipped = Partial<Record<WardrobeSlot, string | null>> | undefined;
type Notify = (n: { msg: string; type: 'error' | 'success' }) => void;

type Naming = {
  name: string;
  lookId: string | null;
};

export function useOutfitSaver({
  enabled,
  equipped,
  equippedBackgroundId,
  onNotify,
  onUpgrade,
}: {
  enabled: boolean;
  equipped: Equipped;
  equippedBackgroundId: string | null | undefined;
  onNotify: Notify;
  onUpgrade: () => void;
}) {
  const { looks, max, isPremium, isFull, save, rename, remove } = useLooks(enabled);
  const [naming, setNaming] = useState<Naming | null>(null);
  const [discarding, setDiscarding] = useState<SavedLookView | null>(null);
  const [saving, setSaving] = useState(false);

  const current = useMemo(
    () =>
      looks.find((look) =>
        looksMatch(look.equipped, equipped ?? {}, look.backgroundId, equippedBackgroundId),
      ) ?? null,
    [looks, equipped, equippedBackgroundId],
  );

  const openRename = (look: Pick<SavedLookView, 'id' | 'name'>) => {
    hapticTick();
    setNaming({ name: look.name, lookId: look.id });
  };

  const saveNow = () => {
    if (!enabled || saving) return;
    if (current) {
      hapticTick();
      setDiscarding(current);
      return;
    }
    if (isFull) {
      if (isPremium) onNotify({ msg: `You can keep ${max} outfits. Delete one first.`, type: 'error' });
      else onUpgrade();
      return;
    }
    hapticTick();
    setNaming({ name: nextOutfitName(looks.map((look) => look.name)), lookId: null });
  };

  const submit = async (typed: string) => {
    const pending = naming;
    setNaming(null);
    const name = typed.trim().slice(0, LOOK_NAME_MAX);
    if (!pending || !name) return;
    if (pending.lookId) {
      if (name === pending.name) return;
      const ok = await rename(pending.lookId, name);
      if (!ok) onNotify({ msg: 'Could not rename this outfit.', type: 'error' });
      return;
    }
    setSaving(true);
    const result = await save(name);
    setSaving(false);
    if (result.ok) return;
    if (result.atCap && !isPremium) onUpgrade();
    else onNotify({ msg: result.error ?? 'Could not save this outfit.', type: 'error' });
  };

  const dialog = (
    <>
      <OutfitNameDialog
        key={naming ? `open:${naming.lookId ?? 'new'}` : 'closed'}
        open={!!naming}
        renaming={!!naming?.lookId}
        defaultName={naming?.name ?? ''}
        onSubmit={(value) => void submit(value)}
        onDismiss={() => setNaming(null)}
      />
      <OutfitDiscardDialog
        look={discarding}
        onConfirm={() => {
          const look = discarding;
          setDiscarding(null);
          if (look) void remove(look.id);
        }}
        onDismiss={() => setDiscarding(null)}
      />
    </>
  );

  const askDiscard = (look: SavedLookView) => {
    hapticTick();
    setDiscarding(look);
  };

  return { saved: !!current || saving, saveNow, openRename, askDiscard, dialog };
}

function OutfitNameDialog({
  open,
  renaming,
  defaultName,
  onSubmit,
  onDismiss,
}: {
  open: boolean;
  renaming: boolean;
  defaultName: string;
  onSubmit: (name: string) => void;
  onDismiss: () => void;
}) {
  const [value, setValue] = useState(defaultName);
  const inputRef = useRef<HTMLInputElement>(null);
  useRegisterOpenSheet(open);
  const canSave = value.trim().length > 0;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onDismiss();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1200] bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus({ preventScroll: true });
            inputRef.current?.select();
          }}
          className="fixed left-1/2 top-[18dvh] z-[1201] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-[28px] bg-background px-5 pb-5 pt-4 shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:top-[24dvh]"
        >
          <Dialog.Close
            aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-full bg-muted text-muted-foreground transition-transform active:scale-95"
          >
            <X className="h-4 w-4" strokeWidth={3} />
          </Dialog.Close>
          <Dialog.Title className="mt-2 text-center text-[17px] font-black text-foreground">
            Choose a name for your outfit
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            {renaming
              ? 'Give this saved outfit a new name.'
              : 'Name the outfit you are wearing, then save it to Outfits.'}
          </Dialog.Description>
          <form
            className="mt-4 flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (canSave) onSubmit(value);
            }}
          >
            <input
              ref={inputRef}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              maxLength={LOOK_NAME_MAX}
              placeholder="Name your outfit…"
              enterKeyHint="done"
              autoComplete="off"
              className="h-12 w-full rounded-2xl border border-border/60 bg-muted/50 px-4 text-center text-[16px] font-bold text-foreground outline-none transition-colors placeholder:font-semibold placeholder:text-muted-foreground/70 focus:border-primary/50 focus:bg-background"
            />
            <button
              type="submit"
              disabled={!canSave}
              className="h-12 w-full rounded-2xl bg-[#447d3f] text-[15px] font-black text-white shadow-[0_3px_0_0_#2c511a] transition-[transform,box-shadow] active:translate-y-0.5 active:shadow-none disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
            >
              Save
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function OutfitDiscardDialog({
  look,
  onConfirm,
  onDismiss,
}: {
  look: SavedLookView | null;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const open = !!look;
  const [shown, setShown] = useState<SavedLookView | null>(look);
  if (look && look !== shown) setShown(look);
  useRegisterOpenSheet(open);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onDismiss();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1200] bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="fixed left-1/2 top-[22dvh] z-[1201] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-[28px] bg-background px-5 pb-5 pt-4 shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:top-[26dvh]"
        >
          <Dialog.Close
            aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-full bg-muted text-muted-foreground transition-transform active:scale-95"
          >
            <X className="h-4 w-4" strokeWidth={3} />
          </Dialog.Close>
          {shown && (
            <div className="mx-auto -mt-3 h-24 w-24 overflow-hidden rounded-2xl bg-muted/60">
              {shown.backgroundImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={shown.backgroundImage}
                  alt=""
                  aria-hidden
                  draggable={false}
                  className="h-full w-full object-cover"
                />
              )}
              <span className="relative -mt-24 flex h-24 w-24 items-end justify-center">
                <FrogSnapshot
                  className="pointer-events-none shrink-0"
                  indices={shown.indices}
                  width="124%"
                  height="124%"
                />
              </span>
            </div>
          )}
          <Dialog.Title className="mt-3 text-center text-[17px] font-black text-foreground">
            Remove {shown?.name ?? 'this outfit'}?
          </Dialog.Title>
          <Dialog.Description className="mx-auto mt-1 max-w-[28ch] text-center text-[14px] font-semibold text-muted-foreground">
            It leaves your Outfits. Every item stays in your closet.
          </Dialog.Description>
          <div className="mt-4 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={onConfirm}
              className="h-12 w-full rounded-2xl bg-rose-500 text-[15px] font-black text-white shadow-[0_3px_0_0_#be123c] transition-[transform,box-shadow] active:translate-y-0.5 active:shadow-none"
            >
              Remove outfit
            </button>
            <Dialog.Close className="h-12 w-full rounded-2xl bg-muted text-[15px] font-black text-foreground transition-transform active:scale-[0.98]">
              Keep it
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function SaveOutfitButton({
  saved,
  onClick,
}: {
  saved: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={saved ? 'Outfit saved, remove it' : 'Save this outfit'}
      aria-pressed={saved}
      title={saved ? 'Saved outfit' : 'Save this outfit'}
      className="grid h-11 w-11 place-items-center rounded-full border border-border/60 bg-background/90 shadow-sm backdrop-blur-md transition-[background-color,transform] hover:bg-background active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      <Icon
        key={saved ? 'saved' : 'idle'}
        name={saved ? 'closetSaved' : 'closetSavedEmpty'}
        className={cn('h-7 w-7', saved && 'chip-pop')}
      />
    </button>
  );
}

export function SavedOutfitsGrid({
  enabled,
  equipped,
  equippedBackgroundId,
  onNotify,
  onUpgrade,
  onSaveNow,
  onRename,
  onDiscard,
}: {
  enabled: boolean;
  equipped: Equipped;
  equippedBackgroundId: string | null | undefined;
  onNotify: Notify;
  onUpgrade: () => void;
  onSaveNow: () => void;
  onRename: (look: SavedLookView) => void;
  onDiscard: (look: SavedLookView) => void;
}) {
  const { looks, isPremium, isFull, apply } = useLooks(enabled);
  const { gridClass } = useShelfGrid();

  const wearingId = useMemo(
    () =>
      looks.find((look) =>
        looksMatch(look.equipped, equipped ?? {}, look.backgroundId, equippedBackgroundId),
      )?.id ?? null,
    [looks, equipped, equippedBackgroundId],
  );

  if (!looks.length) {
    return (
      <ClosetEmptyPrompt
        icon={<Icon name="closetSaved" className="h-12 w-12" />}
        line="Tap the heart to save the outfit you're wearing!"
        action={{ label: 'Save this outfit', onClick: onSaveNow }}
      />
    );
  }

  const wear = async (look: SavedLookView) => {
    if (look.id === wearingId) return;
    useWardrobeTryOn.getState().setTryOn(null);
    const ok = await apply(look.id);
    if (!ok) onNotify({ msg: 'Could not wear that outfit.', type: 'error' });
  };

  return (
    <div className={cn(gridClass, 'pb-4 pt-1')}>
      {looks.map((look) => {
        const wearing = look.id === wearingId;
        return (
          <div key={look.id} className="relative min-w-0">
            <button
              type="button"
              onClick={() => void wear(look)}
              aria-label={`Wear ${look.name}`}
              className="group block w-full"
            >
              <span
                className={cn(
                  'relative block aspect-square w-full overflow-hidden rounded-2xl bg-muted/60 transition-transform duration-150 group-active:scale-95',
                  wearing && 'ring-2 ring-primary',
                )}
              >
                {look.backgroundImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={look.backgroundImage}
                    alt=""
                    aria-hidden
                    draggable={false}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                )}
                <span className="absolute inset-0 flex items-end justify-center">
                  <FrogSnapshot
                    className="pointer-events-none shrink-0"
                    indices={look.indices}
                    width="124%"
                    height="124%"
                  />
                </span>
                {wearing && (
                  <span className="absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm">
                    <Check className="h-3 w-3" strokeWidth={4} />
                  </span>
                )}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onRename(look)}
              className="mt-1 block w-full truncate px-0.5 text-center text-[12px] font-black text-muted-foreground transition-colors hover:text-foreground"
            >
              {look.name}
            </button>
            <button
              type="button"
              aria-label={`Delete ${look.name}`}
              onClick={() => onDiscard(look)}
              className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-background text-muted-foreground shadow-md ring-1 ring-border/70 transition-transform active:scale-90"
            >
              <X className="h-3.5 w-3.5" strokeWidth={3} />
            </button>
          </div>
        );
      })}
      {isFull && !isPremium && (
        <button
          type="button"
          onClick={onUpgrade}
          className="plus-upgrade-button plus-club-soft flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-2xl px-1 text-center"
        >
          <Icon name="frogPlus" label="Plus" className="h-10 w-10" />
          <span className="text-[10px] font-black leading-tight">
            {SAVED_LOOKS_PLUS} outfits
            <br />
            with Plus
          </span>
        </button>
      )}
    </div>
  );
}
