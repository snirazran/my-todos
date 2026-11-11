'use client';
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { PlusUpgradeModal } from '@/components/ui/PlusUpgradeModal';
import { PlusPreviewIntro } from '@/components/ui/PlusPreview';
import { PlusMembershipSheet } from '@/components/ui/PlusMembershipSheet';
import { PlusWelcomeCelebration } from '@/components/ui/PlusWelcome';
import { Icon } from '@/components/ui/Icon';
import { LeapPlusButton } from '@/components/leap/LeapPlusButton';
import type { PlusStatus } from '@/lib/plusStatus';

const PLACEMENTS = [
  'settings_menu',
  'first_gift',
  'season_plus_track',
  'shop_plus_slot',
  'shop_plus_sale',
  'leap_leagues',
  'streak_rescue',
  'wardrobe_looks',
  'quick_add_tag_limit',
  'plus_preview_ended',
  'plus_preview_active',
];

const DAY = 86_400_000;
const at = (days: number) => new Date(Date.now() + days * DAY).toISOString();

function mockStatus(kind: 'trial' | 'active' | 'preview'): PlusStatus {
  if (kind === 'preview') {
    return {
      isPremium: true,
      premiumUntil: at(2),
      source: 'gift',
      subscription: null,
      earned: { flies: 180, rareItems: 1 },
      preview: { phase: 'active', startedAt: at(-1), endsAt: at(2), offerUntil: null, offer: true },
    };
  }
  return {
    isPremium: true,
    premiumUntil: at(kind === 'trial' ? 6 : 200),
    source: 'subscription',
    subscription: {
      plan: 'yearly',
      store: 'app_store',
      periodType: kind === 'trial' ? 'trial' : 'normal',
      expiresAt: at(kind === 'trial' ? 6 : 200),
      startedAt: at(kind === 'trial' ? -1 : -165),
      willRenew: true,
      billingIssue: false,
      managementUrl: null,
      productId: 'io.frog.tasks.plus.yearly',
    },
    earned: kind === 'trial' ? { flies: 240, rareItems: 2 } : { flies: 5120, rareItems: 14 },
  };
}

export default function PlusPreview() {
  const [open, setOpen] = useState(false);
  const [intro, setIntro] = useState(false);
  const [membership, setMembership] = useState<PlusStatus | null>(null);
  const [welcome, setWelcome] = useState<PlusStatus | null>(null);
  const [wearing, setWearing] = useState(false);
  const [placement, setPlacement] = useState(PLACEMENTS[0]);
  const [endsAt] = useState(() => at(3));
  const openMembership = (kind: 'trial' | 'active' | 'preview') => setMembership(mockStatus(kind));
  return (
    <main className="relative z-10 flex flex-wrap items-center gap-3 p-10">
      <select aria-label="Placement" value={placement} onChange={(e) => setPlacement(e.target.value)}>
        {PLACEMENTS.map((p) => <option key={p}>{p}</option>)}
      </select>
      <label className="flex items-center gap-1.5 text-sm">
        <input type="checkbox" checked={wearing} onChange={(e) => setWearing(e.target.checked)} /> wearing an item
      </label>
      <button id="dev-open-paywall" onClick={() => setOpen(true)}>Preview Plus</button>
      <button id="dev-open-intro" onClick={() => setIntro(true)}>Preview intro</button>
      <button id="dev-open-trial" onClick={() => openMembership('trial')}>Membership: trial</button>
      <button id="dev-open-active" onClick={() => openMembership('active')}>Membership: member</button>
      <button id="dev-open-preview" onClick={() => openMembership('preview')}>Membership: preview</button>
      <button id="dev-open-welcome" onClick={() => setWelcome(mockStatus('trial'))}>Welcome</button>
      <div id="dev-buttons" className="flex w-full max-w-sm flex-col gap-5 pt-6">
        <button
          type="button"
          className="plus-upgrade-button plus-club group relative isolate flex min-h-[60px] w-full items-center gap-2.5 rounded-[18px] py-2 pl-2 pr-3 text-left"
        >
          <span className="-my-3 shrink-0">
            <Icon name="frogPlus" className="h-[58px] w-[58px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-black leading-tight tracking-tight">Try Frogress Plus</span>
            <span className="plus-club-sub mt-0.5 block text-[12.5px] font-bold leading-snug">
              <span className="text-[#f5c84c]">2×</span> rewards, every Special item
            </span>
          </span>
          <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-[#f5c84c]" strokeWidth={3} />
        </button>
        <LeapPlusButton title="Unlock Plus" subtitle="Extra reward every tier" onClick={() => {}} />
        <button
          type="button"
          className="plus-upgrade-button plus-club-soft inline-flex min-h-9 items-center gap-1 self-start rounded-full px-3 text-[12px] font-black tracking-wide"
        >
          <Icon name="frogPlus" label="Plus" className="-my-1 h-6 w-6" />
          12 look slots
        </button>
      </div>
      <PlusUpgradeModal
        open={open}
        onClose={() => setOpen(false)}
        placement={placement}
        frogName="Pebble"
        previewItem={wearing ? { slot: 'hat', riveIndex: 2 } : null}
      />
      <PlusPreviewIntro open={intro} endsAt={endsAt} onClose={() => setIntro(false)} />
      <PlusMembershipSheet open={!!membership} previewStatus={membership} onClose={() => setMembership(null)} />
      <PlusWelcomeCelebration open={!!welcome} status={welcome} onDone={() => setWelcome(null)} />
    </main>
  );
}
