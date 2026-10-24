'use client';

import PlusStep from '../onboarding/steps/PlusStep';

export default function PlusPreview() {
  return (
    <main className="fixed inset-0 isolate flex flex-col items-center overflow-y-auto overflow-x-hidden bg-background px-5 pt-4">
      <div className="relative z-10 flex w-full max-w-none flex-col md:max-w-lg lg:max-w-xl" style={{ minHeight: '100%' }}>
        <PlusStep frogName="Pebble" humanName="Snir" habitCount={5} indices={{ skin: 1, hat: 0, body: 0, hand_item: 0 }} onDone={() => {}} />
      </div>
    </main>
  );
}
