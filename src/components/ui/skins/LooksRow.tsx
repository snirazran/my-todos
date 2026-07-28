'use client';

import React from 'react';
import { Bookmark, Check, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { DragScrollRow } from '@/components/ui/DragScrollRow';
import { Icon } from '@/components/ui/Icon';
import { useLooks } from '@/hooks/useLooks';
import type { WardrobeSlot } from '@/lib/skins/catalog';
import { LOOK_SLOTS, SAVED_LOOKS_PLUS } from '@/lib/skins/looks';

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
}: {
  enabled: boolean;
  equipped: Partial<Record<WardrobeSlot, string | null>> | undefined;
  equippedBackgroundId: string | null | undefined;
  onNotify: (n: { msg: string; type: 'error' | 'success' }) => void;
  onUpgrade: () => void;
}) {
  const { looks, max, isPremium, isFull, busy, save, apply, remove } =
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

  const handleSave = async () => {
    const result = await save();
    if (result.ok) onNotify({ msg: 'Look saved!', type: 'success' });
    else if (result.error) onNotify({ msg: result.error, type: 'error' });
  };

  const handleApply = async (lookId: string, name: string) => {
    if (lookId === wearingId) return;
    const ok = await apply(lookId);
    onNotify(
      ok
        ? { msg: `Wearing ${name}`, type: 'success' }
        : { msg: 'Could not wear that look.', type: 'error' },
    );
  };

  return (
    <div className="pb-2">
      <div className="mb-2 flex items-center gap-2 px-1">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-foreground">
          Saved looks
        </p>
        <span className="text-[10px] font-bold tabular-nums text-muted-foreground">
          {looks.length}/{max}
        </span>
        {looks.length > 0 && (
          <button
            type="button"
            onClick={() => setRemoving((v) => !v)}
            className={cn(
              'ml-auto rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide transition-colors',
              removing
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {removing ? 'Done' : 'Edit'}
          </button>
        )}
      </div>

      <DragScrollRow>
        {!isFull && (
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className="flex h-[104px] w-[84px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border/70 bg-card text-muted-foreground transition-colors hover:border-[#4f9149] hover:text-[#4f9149] disabled:opacity-50"
          >
            <Plus className="h-5 w-5" strokeWidth={3} />
            <span className="text-[10px] font-black uppercase tracking-wide">
              Save
              <br />
              this fit
            </span>
          </button>
        )}

        {looks.map((look) => {
          const isWearing = look.id === wearingId;
          return (
            <div key={look.id} className="relative shrink-0">
              <button
                type="button"
                onClick={() => handleApply(look.id, look.name)}
                disabled={busy || removing}
                className={cn(
                  'flex h-[104px] w-[84px] flex-col items-stretch overflow-hidden rounded-xl border-2 bg-card p-1 text-left transition-transform active:scale-[0.97] disabled:opacity-90',
                  isWearing ? 'border-[#4f9149]' : 'border-border/50',
                )}
              >
                <span className="relative flex h-16 items-end justify-center overflow-hidden rounded-lg bg-muted/40">
                  <FrogSnapshot
                    className="h-[125%] w-[125%] object-contain"
                    indices={look.indices}
                    width={110}
                    height={110}
                  />
                  {isWearing && !removing && (
                    <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-[#4f9149] text-white">
                      <Check className="h-2.5 w-2.5 stroke-[4]" />
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    'mt-1 truncate text-[10px] font-black leading-tight',
                    isWearing ? 'text-[#4f9149]' : 'text-foreground',
                  )}
                >
                  {look.name}
                </span>
                {!look.complete && (
                  <span className="truncate text-[9px] font-bold text-amber-600 dark:text-amber-400">
                    Missing a piece
                  </span>
                )}
              </button>

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

        {isFull &&
          (isPremium ? (
            <div className="flex h-[104px] w-[84px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border/50 px-1 text-center text-muted-foreground">
              <Bookmark className="h-4 w-4" />
              <span className="text-[9px] font-bold leading-tight">
                All {max} slots full
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={onUpgrade}
              className="flex h-[104px] w-[84px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-amber-400/60 bg-amber-50 px-1 text-center text-amber-700 transition-transform active:scale-[0.97] dark:bg-amber-950/30 dark:text-amber-400"
            >
              <Icon name="frogPlus" label="Plus" className="h-8 w-8" />
              <span className="text-[9px] font-black leading-tight">
                {SAVED_LOOKS_PLUS} slots
                <br />
                with Plus
              </span>
            </button>
          ))}
      </DragScrollRow>
    </div>
  );
}
