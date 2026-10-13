'use client';

import { QuestsPanel } from '@/components/ui/QuestsPanel';

export default function DevQuestsHarness() {
  return (
    <main className="h-[100dvh] overflow-hidden bg-background md:h-auto md:min-h-[100dvh] md:overflow-visible">
      <div className="flex h-full w-full flex-col md:h-auto">
        <QuestsPanel isGuest={false} />
      </div>
    </main>
  );
}
