'use client';

import { PlusUpgradeModal } from '@/components/ui/PlusUpgradeModal';
import { useUIStore } from '@/lib/uiStore';

/**
 * The one mount for the store-driven Plus paywall.
 *
 * `setPremiumModalOpen` is called from all over the app — insights, campaigns,
 * the fly limit, the task-completion intro — but the modal itself used to be
 * rendered only inside HomeDashboard, so every one of those calls silently did
 * nothing unless the user happened to be on the home page.
 */
export function PremiumModalHost() {
  const open = useUIStore((s) => s.isPremiumModalOpen);
  const placement = useUIStore((s) => s.premiumModalPlacement);
  const setOpen = useUIStore((s) => s.setPremiumModalOpen);

  return (
    <PlusUpgradeModal
      open={open}
      placement={placement}
      onClose={() => setOpen(false)}
    />
  );
}
