'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ChevronLeft, Loader2, Gift } from 'lucide-react';
import Frog from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import { GiftRive } from '@/components/ui/gift-box/GiftBox';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { BuddyFrogFace } from '@/components/ui/BuddyBadge';
import { useKeyboardInset } from '@/components/ui/quick-add/useKeyboardInset';
import {
  BUDDY_PRESETS,
  buddyRepeatSummary,
  daysForChoice,
  type BuddyRepeatChoice,
} from '@/lib/buddy/presets';
import type { FrogIndices } from '@/lib/friends/indices';
import { cn } from '@/lib/utils';

const BUDDY = '#4f9149';
const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export type BuddyGoalDraft = {
  text: string;
  days: number[];
  giftOptionId?: string | null;
};

export type BuddyGiftOption = {
  id: string;
  name: string;
  itemId: string;
  item?: {
    slot: 'skin' | 'hat' | 'body' | 'hand_item' | 'container';
    riveIndex: number;
    icon?: string;
  } | null;
};

/** Names the shared goal, its repeat, and (for link invites) the gift. */
export function BuddyGoalSheet({
  open,
  onClose,
  onBack,
  onSubmit,
  recipientName,
  recipientFrogName,
  recipientIndices,
  sending,
  error,
  giftOptions,
  giftLoading = false,
  submitLabel,
}: {
  open: boolean;
  onClose: () => void;
  onBack?: (() => void) | null;
  onSubmit: (draft: BuddyGoalDraft) => void;
  /** Name of the friend being invited; omitted for a shareable link invite. */
  recipientName?: string | null;
  /** The friend's frog name, shown alongside when it differs. */
  recipientFrogName?: string | null;
  recipientIndices?: FrogIndices;
  sending?: boolean;
  error?: string | null;
  /** When provided, the sheet also asks for a welcome gift (link invites). */
  giftOptions?: BuddyGiftOption[];
  giftLoading?: boolean;
  submitLabel?: string;
}) {
  const [text, setText] = useState('');
  const [choice, setChoice] = useState<BuddyRepeatChoice>('daily');
  const [customDays, setCustomDays] = useState<number[]>([]);
  const [giftId, setGiftId] = useState<string | null>(null);
  const [presetId, setPresetId] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const presetRowRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    id: number;
    x: number;
    left: number;
    moved: boolean;
  } | null>(null);
  const draggedRef = useRef(false);
  const { inset } = useKeyboardInset(open);
  const keyboardInset = inputFocused ? inset : 0;

  const handleRowWheel = useCallback((e: WheelEvent) => {
    const el = presetRowRef.current;
    if (!el || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 0) return;
    const next = Math.min(max, Math.max(0, el.scrollLeft + e.deltaY));
    if (next === el.scrollLeft) return;
    e.preventDefault();
    el.scrollLeft = next;
  }, []);

  const bindPresetRow = useCallback(
    (el: HTMLDivElement | null) => {
      presetRowRef.current?.removeEventListener('wheel', handleRowWheel);
      presetRowRef.current = el;
      el?.addEventListener('wheel', handleRowWheel, { passive: false });
    },
    [handleRowWheel],
  );

  const endRowDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== e.pointerId) return;
    if (drag.moved) {
      draggedRef.current = true;
      presetRowRef.current?.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
  };

  useEffect(() => {
    if (!open) return;
    setText('');
    setChoice('daily');
    setCustomDays([]);
    setGiftId(null);
    setPresetId(null);
    setInputFocused(false);
  }, [open]);

  const wantsGift = !!giftOptions || giftLoading;
  const days = useMemo(
    () => daysForChoice(choice, customDays),
    [choice, customDays],
  );
  const canSend =
    !!text.trim() && days.length > 0 && (!wantsGift || !!giftId) && !sending;

  const pickPreset = (id: string) => {
    const preset = BUDDY_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setPresetId(id);
    setText(preset.text);
    setChoice(preset.repeat);
    setCustomDays(preset.days ?? []);
  };

  const toggleDay = (d: number) => {
    setChoice('custom');
    setCustomDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
    );
  };

  const heading = recipientName
    ? `Your goal with ${recipientName}`
    : 'Your shared goal';
  const showFrogName =
    !!recipientName && !!recipientFrogName && recipientFrogName !== recipientName;

  return (
    <BaseSheet
      open={open}
      onOpenChange={(v) => {
        if (v) return;
        if (onBack) onBack();
        else onClose();
      }}
      closeAriaLabel="Close"
      className="sm:max-w-md"
      zIndex={1300}
      hideHandle
      bottomInset={keyboardInset}
    >
      {({ bindScroll, entered }) => (
        <div className="flex max-h-[88dvh] flex-col sm:max-h-[calc(100dvh-4rem)]">
          <div className="relative shrink-0 border-b border-border/50 px-4 pb-3 pt-4">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-24"
              style={{
                background: `radial-gradient(120% 100% at 50% 0%, ${BUDDY}22 0%, transparent 72%)`,
              }}
            />
            <div className="relative flex items-center gap-2 pr-11">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  aria-label="Back"
                  className="-ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              {recipientName ? (
                <BuddyFrogFace
                  indices={recipientIndices}
                  size={34}
                  className="shrink-0 ring-2 ring-inset ring-[#4f9149]/40"
                />
              ) : (
                <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-[#4f9149]/10 text-[#4f9149]">
                  <Gift className="h-4 w-4" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#4f9149]">
                  Goal buddy · Step 2 of 2
                </p>
                <p className="truncate text-[15px] font-black tracking-tight text-foreground">
                  {heading}
                </p>
                {showFrogName && (
                  <p className="truncate text-[12px] font-semibold text-muted-foreground">
                    {recipientFrogName}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div
            ref={bindScroll}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3 pt-4"
          >
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setPresetId(null);
              }}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              enterKeyHint="done"
              placeholder="What will you both do?"
              className="w-full rounded-2xl border border-border/60 bg-muted/40 px-4 py-3.5 text-[17px] font-bold tracking-tight text-foreground placeholder:font-semibold placeholder:text-muted-foreground/60 focus:border-[#4f9149]/50 focus:outline-none focus:ring-2 focus:ring-[#4f9149]/20"
            />

            <div
              ref={bindPresetRow}
              onPointerDown={(e) => {
                if (e.pointerType !== 'mouse' || e.button !== 0) return;
                const el = presetRowRef.current;
                if (!el || el.scrollWidth <= el.clientWidth) return;
                dragRef.current = {
                  id: e.pointerId,
                  x: e.clientX,
                  left: el.scrollLeft,
                  moved: false,
                };
              }}
              onPointerMove={(e) => {
                const drag = dragRef.current;
                const el = presetRowRef.current;
                if (!drag || !el || drag.id !== e.pointerId) return;
                const dx = e.clientX - drag.x;
                if (!drag.moved) {
                  if (Math.abs(dx) < 4) return;
                  drag.moved = true;
                  el.setPointerCapture(e.pointerId);
                }
                el.scrollLeft = drag.left - dx;
              }}
              onPointerUp={endRowDrag}
              onPointerCancel={endRowDrag}
              onClickCapture={(e) => {
                if (!draggedRef.current) return;
                draggedRef.current = false;
                e.preventDefault();
                e.stopPropagation();
              }}
              className="-mx-4 mt-2.5 select-none overflow-x-auto overscroll-x-contain px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <div className="flex w-max gap-1.5">
                {BUDDY_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pickPreset(p.id)}
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-[13px] font-black tracking-tight transition-colors',
                      presetId === p.id
                        ? 'border-[#4f9149] bg-[#4f9149]/10 text-[#4f9149]'
                        : 'border-border/60 bg-card text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <span aria-hidden>{p.emoji}</span>
                    {p.text}
                  </button>
                ))}
              </div>
            </div>

            <p className="mt-5 text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">
              How often
            </p>
            <div className="mt-2 flex gap-1.5">
              {(
                [
                  ['daily', 'Every day'],
                  ['weekdays', 'Weekdays'],
                  ['custom', 'Pick days'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setChoice(value)}
                  className={cn(
                    'h-11 flex-1 rounded-2xl border text-[13px] font-black tracking-tight transition-colors',
                    choice === value
                      ? 'border-[#4f9149] bg-[#4f9149]/10 text-[#4f9149]'
                      : 'border-border/60 bg-card text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {choice === 'custom' && (
              <div className="mt-2 flex justify-between gap-1">
                {DAY_LABELS.map((label, d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    aria-pressed={customDays.includes(d)}
                    className={cn(
                      'h-10 flex-1 rounded-xl text-[13px] font-black transition-colors',
                      customDays.includes(d)
                        ? 'bg-[#4f9149] text-white'
                        : 'bg-muted/60 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {wantsGift && (
              <>
                <p className="mt-5 text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                  Welcome gift
                </p>
                <p className="mt-1 text-[13px] font-semibold text-muted-foreground">
                  They unlock it when they join you.
                </p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(giftOptions ?? []).map((g) => {
                    const selected = giftId === g.id;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setGiftId(g.id)}
                        className={cn(
                          'aspect-square overflow-hidden rounded-[18px] border-4 bg-muted/40 p-1 transition-all active:scale-95',
                          selected
                            ? 'border-[#4f9149] ring-4 ring-inset ring-[#4f9149]/20'
                            : 'border-border/50 hover:border-[#4f9149]/50',
                        )}
                      >
                        <GiftPreview
                          item={g.item ?? null}
                          active={selected && entered}
                        />
                      </button>
                    );
                  })}
                  {giftLoading && !giftOptions && (
                    <div className="col-span-3 flex justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="mt-5 flex items-center gap-3 rounded-2xl border border-[#4f9149]/25 bg-[#4f9149]/[0.07] px-3.5 py-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/80 dark:bg-card">
                <Fly size={30} interactive={false} paused />
              </span>
              <p className="text-[13px] font-semibold leading-snug text-foreground">
                <span className="font-black">You both check it off</span> → you
                both catch double flies, and your shared streak grows.
              </p>
            </div>
          </div>

          <div
            className="shrink-0 border-t border-border/50 px-4 pt-3"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
          >
            {error && (
              <p className="mb-2 text-center text-[13px] font-bold text-rose-500">
                {error}
              </p>
            )}
            <p className="mb-2 text-center text-[12px] font-semibold text-muted-foreground">
              {buddyRepeatSummary(choice, customDays)} ·{' '}
              {recipientName
                ? `${recipientName} has 24h to accept`
                : 'link expires in 24h'}
            </p>
            <button
              type="button"
              disabled={!canSend}
              onClick={() =>
                onSubmit({ text: text.trim(), days, giftOptionId: giftId })
              }
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#4f9149] text-[17px] font-black tracking-tight text-white shadow-[0_4px_0_#34631f] transition-all active:translate-y-0.5 active:shadow-none disabled:pointer-events-none disabled:opacity-50"
            >
              {sending && <Loader2 className="h-5 w-5 animate-spin" />}
              {submitLabel ??
                (recipientName ? `Send invite to ${recipientName}` : 'Create invite link')}
            </button>
          </div>
        </div>
      )}
    </BaseSheet>
  );
}

function GiftPreview({
  item,
  active = false,
}: {
  item: BuddyGiftOption['item'];
  active?: boolean;
}) {
  if (!item) {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
        <Gift className="h-7 w-7" />
      </div>
    );
  }
  if (item.slot === 'container') {
    return (
      <div className="flex h-full w-full items-center justify-center overflow-visible">
        <div className="h-[170%] w-[170%]">
          <GiftRive color={item.riveIndex} isMilestone={false} paused={!active} />
        </div>
      </div>
    );
  }
  const indices =
    item.slot === 'skin'
      ? { skin: item.riveIndex }
      : item.slot === 'hat'
        ? { hat: item.riveIndex }
        : item.slot === 'body'
          ? { body: item.riveIndex }
          : { hand_item: item.riveIndex };
  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden">
      <Frog
        className="-translate-y-12"
        width={300}
        height={338}
        indices={indices}
        paused={!active}
      />
    </div>
  );
}
