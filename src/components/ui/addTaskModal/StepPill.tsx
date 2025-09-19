'use client';

type Props = Readonly<{
  active: boolean;
  children: React.ReactNode;
}>;

export default function StepPill({ active, children }: Props) {
  return (
    <span
      className={[
        'rounded-full px-2.5 py-1',
        active
          ? 'bg-emerald-200/70 text-emerald-900 dark:bg-emerald-700/60 dark:text-emerald-50'
          : 'bg-emerald-900/5 text-emerald-800/80 dark:bg-emerald-900/30 dark:text-emerald-200/80',
      ].join(' ')}
    >
      {children}
    </span>
  );
}
