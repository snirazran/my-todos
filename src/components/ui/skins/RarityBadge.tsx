import { RARITY_CONFIG } from '@/components/ui/gift-box/constants';
import type { Rarity } from '@/lib/skins/catalog';
import { cn } from '@/lib/utils';

export function RarityBadge({ rarity, className }: { rarity?: Rarity | null; className?: string }) {
  const tone = rarity ? RARITY_CONFIG[rarity] : null;
  if (!tone) return null;
  return (
    <span className={cn('inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[10px] font-black leading-4', tone.bg, tone.text, tone.border, className)}>
      {tone.label}
    </span>
  );
}
