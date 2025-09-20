'use client';

import Fly from '@/components/ui/fly';

type Props = Readonly<{
  label: string;
  disabled?: boolean;
  onClick: () => void;
}>;

export default function PrimaryButton({ label, disabled, onClick }: Props) {
  return (
    <button
      type="button"
      disabled={!!disabled}
      onClick={onClick}
      className={[
        'relative inline-flex items-center justify-center gap-2',
        'h-11 px-5 rounded-full text-[15px] font-semibold',
        'text-white bg-gradient-to-b from-emerald-500 to-emerald-600',
        'shadow-[0_10px_24px_rgba(16,185,129,.35)] ring-1 ring-emerald-700/30',
        'hover:brightness-105 active:scale-[0.995]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-300',
        'disabled:opacity-60 disabled:pointer-events-none',
      ].join(' ')}
    >
      {/* glossy top highlight */}
      <span className="absolute inset-0 rounded-full pointer-events-none bg-gradient-to-b from-white/25 to-transparent mix-blend-soft-light" />
      <span className="relative z-10 leading-none">{label}</span>
      <span className="relative z-10 inline-flex items-center leading-none">
        <Fly size={22} y={-2} />
      </span>
    </button>
  );
}
