'use client';

import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { canPinWidget, requestWidgetPin } from '@/lib/widget/bridge';
import { recordPromptShown, recordWidgetAdded } from '@/lib/widget/prompt';

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
          <WidgetPreview streak={streak} />

          <div className="flex flex-col gap-2 text-center">
            <h2 className="text-2xl font-bold leading-tight text-gray-900 dark:text-white">
              {headline}
            </h2>
            <p className="text-[15px] leading-snug text-gray-600 dark:text-gray-300">
              Your frog gets hungry whether or not you open the app. Keep today
              on your home screen and add what&apos;s on your mind in one tap.
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

/** A flat mock of the real 4x2 widget, so the ask shows what it's asking for. */
function WidgetPreview({ streak }: { streak: number }) {
  const platform = Capacitor.getPlatform();
  return (
    <div
      className="mx-auto w-full max-w-[280px] rounded-[22px] p-3 shadow-lg"
      style={{
        background:
          'linear-gradient(150deg, rgba(215,235,220,0.95), rgba(170,205,185,0.95))',
      }}
      aria-hidden="true"
    >
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-xs font-semibold text-green-900/70">Today</span>
        {streak > 0 && (
          <span className="ml-auto text-xs font-bold text-amber-700">
            🔥 {streak}
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          {['Email the landlord', 'Gym — legs'].map((t, i) => (
            <div key={t} className="flex items-center gap-2">
              <span
                className={`h-3.5 w-3.5 flex-none rounded-[5px] border-[1.5px] ${
                  i === 0
                    ? 'border-green-700 bg-green-700'
                    : 'border-green-900/30'
                }`}
              />
              <span
                className={`truncate text-[13px] ${
                  i === 0
                    ? 'text-green-900/40 line-through'
                    : 'text-green-950/90'
                }`}
              >
                {t}
              </span>
            </div>
          ))}
          <div className="mt-0.5 flex items-center gap-1.5 rounded-full border-[1.5px] border-dashed border-green-700/50 bg-white/50 px-2.5 py-1 text-[12px] font-medium text-green-800">
            + What&apos;s next?
          </div>
        </div>
        <div className="flex w-12 flex-none items-center justify-center">
          <svg width="42" height="42" viewBox="0 0 64 64">
            <ellipse cx="32" cy="40" rx="21" ry="18" fill="#3f9c63" />
            <circle cx="20" cy="20" r="9.5" fill="#3f9c63" />
            <circle cx="44" cy="20" r="9.5" fill="#3f9c63" />
            <circle cx="20" cy="20" r="5.5" fill="#fff" />
            <circle cx="44" cy="20" r="5.5" fill="#fff" />
            <circle cx="21" cy="21" r="2.6" fill="#13201A" />
            <circle cx="45" cy="21" r="2.6" fill="#13201A" />
            <path
              d="M23 46 Q32 41 41 46"
              stroke="#1d5c39"
              strokeWidth="2.6"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>
      <p className="sr-only">{platform} widget preview</p>
    </div>
  );
}
