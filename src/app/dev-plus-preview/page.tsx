'use client';
import { useState } from 'react';
import { PlusUpgradeModal } from '@/components/ui/PlusUpgradeModal';

export default function PlusPreview() {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState('onboarding');
  return <main className="p-10"><select aria-label="Placement" value={placement} onChange={(e) => setPlacement(e.target.value)}>{['onboarding', 'season_plus_track', 'wardrobe_looks', 'gift_double', 'streak_rescue'].map((p) => <option key={p}>{p}</option>)}</select><button onClick={() => setOpen(true)}>Preview Plus</button><PlusUpgradeModal open={open} onClose={() => setOpen(false)} placement={placement} frogName="Pebble" /></main>;
}
