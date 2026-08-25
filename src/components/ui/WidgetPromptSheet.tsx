'use client';

import { useEffect, useRef, useState } from 'react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { artForDay } from '@/lib/widget/art';
import { canPinWidget, requestWidgetPin } from '@/lib/widget/bridge';
import { recordPromptShown, recordWidgetAdded } from '@/lib/widget/prompt';
import { todayKey } from '@/lib/widget/sync';

type PreviewTask = { id: string; text: string; completed: boolean };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  streak: number;
  /** Today's real list. The preview is the pitch, so it shows their own work. */
  tasks: PreviewTask[];
  /** Web testing: render the sheet without spending one of the two real asks. */
  preview?: boolean;
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
  tasks,
  preview = false,
  onPinned,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const pinnable = canPinWidget();
  const stepsRef = useRef<HTMLOListElement | null>(null);

  useEffect(() => {
    if (open && !preview) recordPromptShown();
  }, [open, preview]);

  // The steps open below the fold, so without this the only thing that visibly
  // happens is the button changing its label.
  useEffect(() => {
    if (!showSteps) return;
    const frame = requestAnimationFrame(() => {
      stepsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
    return () => cancelAnimationFrame(frame);
  }, [showSteps]);

  const remaining = tasks.filter((t) => !t.completed).length;

  // A streak is the most concrete thing we can put on the line, so it wins
  // when there is one; otherwise lead with why seeing the list matters at all.
  const headline =
    streak >= 2
      ? `Don't let day ${streak} slip`
      : 'Goals you see are goals you keep';

  const handleAdd = async () => {
    if (!pinnable) {
      setShowSteps(true);
      return;
    }
    setBusy(true);
    const requested = await requestWidgetPin();
    setBusy(false);
    if (requested) {
      if (!preview) recordWidgetAdded();
      onPinned();
      onOpenChange(false);
    } else {
      setShowSteps(true);
    }
  };

  const handleIosDone = () => {
    if (!preview) recordWidgetAdded();
    onPinned();
    onOpenChange(false);
  };

  return (
    <BaseSheet
      open={open}
      onOpenChange={onOpenChange}
      className="max-h-[92dvh] max-w-md sm:max-h-[min(92dvh,780px)]"
      closeAriaLabel="Not now"
    >
      {({ bindScroll }) => (
        <div className="flex min-h-0 w-full flex-1 flex-col">
          <div className="h-11 shrink-0" />
          <div
            ref={bindScroll}
            className="flex min-h-0 flex-1 touch-pan-y flex-col gap-5 overflow-y-auto overscroll-contain px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] sm:pb-6"
          >
            <HomeScreenPreview art={artForDay(todayKey())} tasks={tasks} />

            <div className="flex shrink-0 flex-col gap-2 text-center">
              <h2 className="text-[22px] font-black leading-tight tracking-tight text-gray-900 dark:text-white">
                {headline}
              </h2>
              <p className="text-[15px] leading-snug text-gray-600 dark:text-gray-300">
                You check your phone all day. Now you&apos;ll check your list
                too — tap a fly and it&apos;s done.
              </p>
            </div>

            {showSteps && !pinnable && (
              <ol
                ref={stepsRef}
                className="flex shrink-0 flex-col gap-2 rounded-2xl bg-gray-100 p-4 text-[15px] text-gray-700 dark:bg-white/10 dark:text-gray-200"
              >
                {IOS_STEPS.map((step, i) => (
                  <li key={step} className="flex gap-3">
                    <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#4f9149] text-sm font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="leading-snug">{step}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="shrink-0 border-t border-border/40 bg-card px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3 sm:pb-5">
            <button
              type="button"
              onClick={showSteps && !pinnable ? handleIosDone : handleAdd}
              disabled={busy}
              className="h-14 w-full rounded-2xl bg-[#4f9149] text-lg font-black tracking-tight text-white shadow-[0_4px_0_0_#34631f] ring-1 ring-[#34631f]/40 transition-all hover:-translate-y-0.5 hover:shadow-[0_5px_0_0_#34631f] active:translate-y-1 active:shadow-none disabled:opacity-50 disabled:grayscale"
            >
              {showSteps && !pinnable
                ? "Done, it's on there"
                : busy
                  ? 'Adding…'
                  : 'Add the widget'}
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="w-full py-3 text-[15px] font-bold text-gray-500 dark:text-gray-400"
            >
              Not now
            </button>
          </div>
        </div>
      )}
    </BaseSheet>
  );
}

/**
 * The widget on a stand-in home screen.
 *
 * Sized in `cqw` off a 338pt container so every measurement is the one from the
 * design rather than a hand-tuned approximation, and the whole thing still
 * shrinks to fit a narrow phone. The art and the fly are the same files the
 * native widgets ship.
 *
 * It draws the user's own list. A mock full of invented errands asks people to
 * imagine the benefit; their own three tasks, already sitting there, just show
 * it — which matters more now that every account starts with tasks in it.
 */
function HomeScreenPreview({
  art,
  tasks,
}: {
  art: string;
  tasks: PreviewTask[];
}) {
  const u = (px: number) => `${(px / 338) * 100}cqw`;

  // Open work first, exactly as the widget itself orders it.
  const ordered = [
    ...tasks.filter((t) => !t.completed),
    ...tasks.filter((t) => t.completed),
  ].slice(0, 4);
  const rows = ordered.length > 0 ? ordered : FALLBACK_ROWS;
  const remaining = tasks.filter((t) => !t.completed).length;
  const done = tasks.length - remaining;
  const percent = tasks.length > 0 ? (done / tasks.length) * 100 : 32;

  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-[34px] p-5 ring-1 ring-black/10 dark:ring-white/10"
      style={{ backgroundImage: WALLPAPER }}
      aria-hidden="true"
    >
      <div className="mx-auto w-full max-w-[338px] [container-type:inline-size]">
        <div
          className="relative w-full overflow-hidden bg-white shadow-[0_10px_30px_-6px_rgba(0,0,0,0.45)] dark:bg-[#E3F7EB]"
          style={{ aspectRatio: '338 / 158', borderRadius: u(27) }}
        >
          <img
            src={`/widgets/frog-${art}.svg`}
            alt=""
            className="absolute bottom-0 left-0 -scale-x-100"
            style={{ width: u(113), height: u(82) }}
          />

          <div className="absolute inset-0 flex" style={{ padding: u(18) }}>
            <div className="flex flex-col" style={{ width: u(75), gap: u(4) }}>
              <span
                className="font-bold tracking-[0.3px] text-black"
                style={{ fontSize: u(30), height: u(21), lineHeight: u(21) }}
              >
                {remaining}
              </span>
              <span
                className="font-semibold tracking-[0.1px] text-black"
                style={{ fontSize: u(15.5), height: u(11), lineHeight: u(11) }}
              >
                tasks left
              </span>
              <div
                className="w-full overflow-hidden bg-[#D9D9D9] dark:bg-[#B2EBC7]"
                style={{ height: u(6), borderRadius: u(27) }}
              >
                <div
                  className="h-full rounded-full bg-[#96D367]"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>

            <div
              className="flex min-w-0 flex-1 flex-col"
              style={{ marginLeft: u(28), gap: u(12) }}
            >
              {rows.map((row, i) => (
                <div
                  key={row.id}
                  className="flex items-center"
                  style={{
                    gap: u(8.88),
                    // Only the fourth row reaches the add button, so a shorter
                    // list gives up no width at all.
                    paddingRight: i === 3 ? u(39.9) : 0,
                  }}
                >
                  {row.completed ? (
                    <span
                      className="flex flex-none items-center justify-center rounded-full bg-[#00A53C]"
                      style={{ width: u(23.74), height: u(23.74) }}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        style={{ width: u(13), height: u(13) }}
                      >
                        <path
                          d="M5 12.5L10 17.5L19 7"
                          stroke="#E3F7EB"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  ) : (
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
                  )}
                  <span
                    className={`truncate tracking-[0.5px] ${
                      row.completed
                        ? 'text-[#0A0A0A]/45 line-through'
                        : 'text-[#0A0A0A]'
                    }`}
                    style={{ fontSize: u(13) }}
                  >
                    {row.text}
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

        <p
          className="pt-2 text-center font-medium text-white/95 [text-shadow:0_1px_3px_rgba(0,0,0,0.35)]"
          style={{ fontSize: u(12) }}
        >
          Frogress
        </p>
      </div>
    </div>
  );
}

/**
 * Stands in for a home screen wallpaper: soft colour blooms over a deep field,
 * the way the stock iOS abstracts look. Fixed in both themes on purpose — a
 * wallpaper does not follow the app's appearance, and holding it still is what
 * makes the panel read as somebody's phone rather than another app surface.
 */
const WALLPAPER = [
  'radial-gradient(55% 45% at 18% 12%, rgba(134,222,180,0.95) 0%, rgba(134,222,180,0) 60%)',
  'radial-gradient(50% 40% at 88% 16%, rgba(125,196,255,0.80) 0%, rgba(125,196,255,0) 62%)',
  'radial-gradient(65% 55% at 74% 96%, rgba(255,205,130,0.70) 0%, rgba(255,205,130,0) 64%)',
  'radial-gradient(60% 50% at 26% 92%, rgba(163,143,255,0.55) 0%, rgba(163,143,255,0) 62%)',
  'linear-gradient(165deg, #3f7f66 0%, #2b5a4c 45%, #1c3a31 100%)',
].join(', ');

/** Only reachable before the first sync; every account starts with tasks. */
const FALLBACK_ROWS: PreviewTask[] = [
  { id: 'a', text: 'Pick up arts & crafts supplies', completed: false },
  { id: 'b', text: 'Send cookie recipe to Rigo', completed: false },
  { id: 'c', text: 'Book club prep', completed: false },
  { id: 'd', text: 'Hike with Darla', completed: false },
];
