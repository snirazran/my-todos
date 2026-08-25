'use client';

import { useEffect, useState } from 'react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { artForDay } from '@/lib/widget/art';
import { canPinWidget, requestWidgetPin } from '@/lib/widget/bridge';
import { recordPromptShown, recordWidgetAdded } from '@/lib/widget/prompt';
import { todayKey } from '@/lib/widget/sync';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  streak: number;
  onPinned: () => void;
};

const IOS_STEPS = [
  'Touch and hold anywhere empty on your home screen.',
  'Tap the + in the top corner.',
  'Search for Frogress and pick a size.',
  'Tap Add Widget, then Done.',
];

export function WidgetPromptSheet({
  open,
  onOpenChange,
  streak,
  onPinned,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const pinnable = canPinWidget();

  useEffect(() => {
    if (open) recordPromptShown();
  }, [open]);

  const headline =
    streak >= 2
      ? `Keep your ${streak}-day streak in sight`
      : 'Put your frog on your home screen';

  const handleAdd = async () => {
    if (!pinnable) {
      setShowSteps(true);
      return;
    }
    setBusy(true);
    const requested = await requestWidgetPin();
    setBusy(false);
    if (requested) {
      recordWidgetAdded();
      onPinned();
      onOpenChange(false);
    } else {
      setShowSteps(true);
    }
  };

  const handleIosDone = () => {
    recordWidgetAdded();
    onPinned();
    onOpenChange(false);
  };

  return (
    <BaseSheet
      open={open}
      onOpenChange={onOpenChange}
      className="max-w-md"
      closeAriaLabel="Not now"
    >
      {() => (
        <div className="flex flex-col gap-5 px-5 pb-6 pt-2">
          <WidgetPreview art={artForDay(todayKey())} />

          <div className="flex flex-col gap-2 text-center">
            <h2 className="text-2xl font-bold leading-tight text-gray-900 dark:text-white">
              {headline}
            </h2>
            <p className="text-[15px] leading-snug text-gray-600 dark:text-gray-300">
              Today&apos;s list, on your home screen. Tap a fly to tick a task
              off without opening anything, or the + to add what just came to
              mind.
            </p>
          </div>

          {showSteps && !pinnable && (
            <ol className="flex flex-col gap-2 rounded-2xl bg-gray-100 p-4 text-[15px] text-gray-700 dark:bg-white/10 dark:text-gray-200">
              {IOS_STEPS.map((step, i) => (
                <li key={step} className="flex gap-3">
                  <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-green-600 text-sm font-bold text-white">
                    {i + 1}
                  </span>
                  <span className="leading-snug">{step}</span>
                </li>
              ))}
            </ol>
          )}

          <div className="flex flex-col gap-2">
            {showSteps && !pinnable ? (
              <button
                type="button"
                onClick={handleIosDone}
                className="w-full rounded-2xl bg-green-600 py-4 text-lg font-bold text-white transition active:scale-[0.98]"
              >
                Done, it&apos;s on there
              </button>
            ) : (
              <button
                type="button"
                onClick={handleAdd}
                disabled={busy}
                className="w-full rounded-2xl bg-green-600 py-4 text-lg font-bold text-white transition active:scale-[0.98] disabled:opacity-60"
              >
                {busy ? 'Adding…' : 'Add the widget'}
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="w-full py-2 text-[15px] font-medium text-gray-500 dark:text-gray-400"
            >
              Not now
            </button>
          </div>
        </div>
      )}
    </BaseSheet>
  );
}

const PREVIEW_ROWS = [
  'Pick up arts & crafts supplies',
  'Send cookie recipe to Rigo',
  'Book club prep',
  'Hike with Darla',
];

/**
 * The real 4x2 widget at reduced scale.
 *
 * Sized in `cqw` off a 338pt container so every measurement is the one from the
 * design rather than a hand-tuned approximation, and the whole thing still
 * shrinks to fit a narrow phone. The art and the fly are the same files the
 * native widgets ship, so what the ask shows is what the user gets.
 */
function WidgetPreview({ art }: { art: string }) {
  const u = (px: number) => `${(px / 338) * 100}cqw`;

  return (
    <div
      className="mx-auto w-full max-w-[338px] [container-type:inline-size]"
      aria-hidden="true"
    >
      <div
        className="relative w-full overflow-hidden bg-white dark:bg-[#E3F7EB]"
        style={{ aspectRatio: '338 / 158', borderRadius: u(27) }}
      >
        <img
          src={`/widgets/frog-${art}.svg`}
          alt=""
          className="absolute bottom-0 left-0 -scale-x-100"
          style={{ width: u(113), height: u(82) }}
        />

        <div className="absolute inset-0 flex" style={{ padding: u(18) }}>
          <div
            className="flex flex-col"
            style={{ width: u(75), gap: u(4) }}
          >
            <span
              className="font-bold leading-none tracking-[0.3px] text-black"
              style={{ fontSize: u(30) }}
            >
              26
            </span>
            <span
              className="font-semibold leading-none tracking-[0.1px] text-black"
              style={{ fontSize: u(15.5) }}
            >
              tasks left
            </span>
            <div
              className="w-full overflow-hidden bg-[#D9D9D9] dark:bg-[#B2EBC7]"
              style={{ height: u(6), borderRadius: u(27) }}
            >
              <div className="h-full w-[32%] rounded-full bg-[#96D367]" />
            </div>
          </div>

          <div
            className="flex min-w-0 flex-1 flex-col justify-between"
            style={{ marginLeft: u(28) }}
          >
            {PREVIEW_ROWS.map((row, i) => (
              <div
                key={row}
                className="flex items-center"
                style={{
                  gap: u(8.88),
                  // The add button sits over the bottom row, so its title has
                  // to truncate before reaching it rather than run underneath.
                  paddingRight: i === PREVIEW_ROWS.length - 1 ? u(39.9) : 0,
                }}
              >
                <span
                  className="flex flex-none items-center justify-center rounded-full border border-[#EFEFEF] bg-[#FAFAFA] dark:border-[#B2EBC7] dark:bg-[#E3F7EB]"
                  style={{ width: u(23.74), height: u(23.74) }}
                >
                  <img
                    src="/widgets/Fly.svg"
                    alt=""
                    style={{ width: u(12.5), height: u(11.2) }}
                  />
                </span>
                <span
                  className="truncate tracking-[0.5px] text-[#0A0A0A]"
                  style={{ fontSize: u(13) }}
                >
                  {row}
                </span>
              </div>
            ))}
          </div>
        </div>

        <img
          src="/widgets/plus.svg"
          alt=""
          className="absolute"
          style={{
            width: u(31.9),
            height: u(31.9),
            right: u(18),
            bottom: u(12),
          }}
        />
      </div>
    </div>
  );
}
