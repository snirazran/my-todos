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
      className="relative inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-2.5 text-base font-semibold text-emerald-950 shadow-lg disabled:opacity-50 text-center"
      style={{
        background:
          'radial-gradient(120% 120% at 100% 0%, #bef264 0%, #34d399 40%, #059669 100%)',
      }}
    >
      <span className="leading-none">{label}</span>
      <span className="inline-flex items-center leading-none">
        <Fly size={26} y={-3} />
      </span>
    </button>
  );
}
