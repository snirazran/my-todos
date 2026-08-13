'use client';

import { Compass } from 'lucide-react';
import { PactCard } from './PactCard';

/**
 * The "Your areas" slot on the quests page. The pact answers the same question
 * the old chooser did — which area am I on — so only one of them is ever shown.
 */
export function PactAreaPanel() {
  return (
    <div className="flex flex-col gap-2 pb-6">
      <div className="px-1">
        <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
          <Compass className="h-3.5 w-3.5 text-primary" strokeWidth={2.75} />
          Your areas
        </p>
        <p className="mt-1.5 text-lg font-black leading-tight text-foreground">
          One area at a time
        </p>
        <p className="mt-0.5 text-xs font-bold text-muted-foreground/80">
          Pick one area a week. The rest keep their history and wait.
        </p>
      </div>
      <div className="-mx-1.5 mt-1 md:-mx-4">
        <PactCard variant="panel" />
      </div>
    </div>
  );
}
