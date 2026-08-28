'use client';

import React from 'react';
import { Handshake, PartyPopper, UserPlus } from 'lucide-react';
import Fly from '@/components/ui/fly';

const PERKS = [
  {
    icon: <Fly size={26} y={-1} interactive={false} paused />,
    title: 'Their tasks feed your frog',
    body: 'Every task a friend finishes sends flies your way.',
  },
  {
    icon: <PartyPopper className="h-5 w-5" strokeWidth={2.5} />,
    title: 'Cheer their streak',
    body: 'A tap tells them you saw it — and pays you both.',
  },
  {
    icon: <Handshake className="h-5 w-5" strokeWidth={2.5} />,
    title: 'Buddy up on a task',
    body: 'Share one goal and keep each other honest.',
  },
];

export function EmptyPond({ onAdd }: { onAdd: () => void }) {
  return (
    <section className="mt-8 w-full">
      <div className="mb-3 px-1.5">
        <h2 className="text-lg font-black tracking-tight text-foreground">
          Your pond
        </h2>
        <p className="mt-0.5 text-xs font-medium text-muted-foreground">
          Empty for now — here&apos;s what friends bring
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {PERKS.map((perk) => (
          <li
            key={perk.title}
            className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card px-3.5 py-3"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              {perk.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-black leading-tight tracking-tight text-foreground">
                {perk.title}
              </span>
              <span className="mt-0.5 block text-[12.5px] font-medium leading-snug text-muted-foreground">
                {perk.body}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onAdd}
        className="mt-3 flex min-h-[3rem] w-full touch-manipulation items-center justify-center gap-2 rounded-2xl border border-border/70 bg-card text-[14px] font-black tracking-tight text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <UserPlus className="h-4.5 w-4.5" strokeWidth={2.5} />
        Already know someone? Add by friend code
      </button>
    </section>
  );
}
