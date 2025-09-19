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
      disabled={!!disabled}
      onClick={onClick}
      className="relative overflow-hidden px-5 py-2.5 text-base font-semibold rounded-2xl text-emerald-950 shadow-lg disabled:opacity-50 inline-flex items-center gap-2"
      style={{
        background:
          'radial-gradient(120% 120% at 100% 0%, #bef264 0%, #34d399 40%, #059669 100%)',
      }}
    >
      <span>{label}</span>
      {/* Static Fly (no fading) */}
      <span className="inline-flex items-center -translate-y-1">
        <Fly size={26} />
      </span>
    </button>
  );
}
