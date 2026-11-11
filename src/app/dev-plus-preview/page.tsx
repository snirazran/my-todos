'use client';
import { useState } from 'react';
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
      <div id="dev-variants" className="flex w-full max-w-sm flex-col gap-5 rounded-3xl bg-white p-4">
        {(['a', 'b', 'c'] as const).map((v) => (
          <div key={v} className="flex flex-col gap-4">
            <span className="text-xs font-bold text-slate-500">{v.toUpperCase()}</span>
            <button type="button" className={`plus-upgrade-button plus-try-${v} group relative isolate flex w-full items-center gap-3 rounded-[20px] py-3 pl-2.5 pr-3 text-left`}>
              <span className="-my-3 shrink-0"><Icon name="frogPlus" className="h-[58px] w-[58px]" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-black leading-tight tracking-tight">Frogress Plus</span>
                <span className="plus-club-sub mt-1 block text-[12.5px] font-bold leading-snug">2× rewards and every Special item</span>
              </span>
              <span aria-hidden className="plus-try-chip shrink-0 rounded-xl px-3 py-2 text-[13px]">Try Plus</span>
            </button>
            <button type="button" className={`plus-upgrade-button plus-try-${v} relative flex h-12 items-center self-start rounded-[16px] pl-[3.4rem] pr-5 text-left`}>
              <Icon name="frogPlus" className="pointer-events-none absolute -left-1 -top-5 h-14 w-14" />
              <span>
                <span className="block text-[15px] font-black leading-tight">Unlock Plus</span>
                <span className="plus-club-sub mt-0.5 block text-[11px] font-bold leading-tight">Extra reward every tier</span>
              </span>
            </button>
          </div>
        ))}
      </div>
      <div id="dev-buttons" className="flex w-full max-w-sm flex-col gap-5 pt-6">
        <button
          type="button"
          className="plus-upgrade-button plus-club group relative isolate flex w-full items-center gap-3 overflow-hidden rounded-[20px] py-3 pl-2.5 pr-3 text-left"
        >
          <span className="-my-3 shrink-0">
            <Icon name="frogPlus" className="h-[58px] w-[58px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-[16px] font-black leading-tight tracking-tight">
              Frogress
              <span className="plus-club-chip rounded-full px-1.5 py-[2px] text-[10px] tracking-wide">PLUS</span>
            </span>
            <span className="plus-club-sub mt-1 block text-[12.5px] font-bold leading-snug">
              <span className="plus-club-accent">2×</span> rewards and every Special item
            </span>
          </span>
          <span aria-hidden className="plus-club-chip shrink-0 rounded-xl px-3 py-2 text-[13px]">
            Try Plus
          </span>
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
