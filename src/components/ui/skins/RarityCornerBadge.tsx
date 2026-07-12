import { RARITY_CONFIG } from '@/components/ui/gift-box/constants';
import { cn } from '@/lib/utils';
import type { Rarity } from '@/lib/skins/catalog';

export function RarityCornerBadge({
  rarity,
  className,
}: {
  rarity: Rarity;
  className?: string;
}) {
  const config = RARITY_CONFIG[rarity];

  return (
    <div
      className={cn(
        'absolute left-0 top-0 z-20 overflow-hidden rounded-br-2xl bg-background',
        className,
      )}
    >
      <div
        className={cn(
          'rounded-br-2xl border-b border-r px-2 py-1 text-[9px] font-black uppercase tracking-wider md:px-2.5 md:text-[10px]',
          config.bg,
          config.text,
          config.border,
        )}
      >
        {config.label}
      </div>
    </div>
  );
}
