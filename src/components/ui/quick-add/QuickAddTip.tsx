'use client';

export function QuickAddTip({
  show,
  text,
  onDismiss,
}: {
  show: boolean;
  text: string;
  onDismiss: () => void;
}) {
  return (
    <div
      className={`grid px-1 transition-[grid-template-rows,opacity] duration-[280ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${
        show
          ? 'mt-2.5 mb-4 grid-rows-[1fr] opacity-100'
          : 'grid-rows-[0fr] opacity-0'
      }`}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/5 px-3.5 py-3">
          <p
            role="status"
            aria-live="polite"
            className="min-w-0 flex-1 text-[12px] font-bold leading-snug text-foreground"
          >
            {text}
          </p>
          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onClick={onDismiss}
            className="shrink-0 rounded-lg px-2 py-1 text-[12px] font-black tracking-wide text-primary transition-colors [@media(hover:hover)]:hover:bg-primary/10"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
