'use client';

import { useEffect, useState } from 'react';
import { StreakSheet } from '@/components/ui/streak/StreakSheet';
import type { CheckInResult, LoginStreakView } from '@/lib/streak/types';

function dayKey(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function StreakPreview() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(1);
  useEffect(() => {
    const n = Number(new URLSearchParams(window.location.search).get('n') || '1');
    setCount(n);
    setOpen(true);
  }, []);
  const view: LoginStreakView = {
    count,
    longestStreak: count,
    lastDayKey: dayKey(0),
    checkedInToday: true,
    alive: true,
    shields: 0,
    shieldCap: 2,
    shieldedDayKeys: [],
    protectedDayKeys: [],
    goal: null,
    goalTiers: [7, 14, 30, 50].map((days) => ({
      days,
      rewards: [
        { type: 'FLIES', amount: days * 10 },
        { type: 'BOX', amount: 1 },
      ],
      payoutPercent: 100,
      repeatIndex: 0,
    })),
    nextTierDays: 7,
  };
  const celebration: CheckInResult = {
    active: true,
    extended: true,
    previousCount: count - 1,
    view,
    shieldConsumedDays: [],
    goalEvent: null,
    rescue: null,
    shieldOffer: null,
    brokeFrom: 0,
  };
  return <StreakSheet open={open} onOpenChange={setOpen} celebration={celebration} />;
}
