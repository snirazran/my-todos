'use client';

import CreateAccountStep from '../onboarding/steps/CreateAccountStep';
import { OnboardingFrogStage } from '../onboarding/steps/OnboardingFrogHeader';

export default function AccountPreview() {
  return (
    <main className="fixed inset-0 isolate flex flex-col items-center overflow-y-auto overflow-x-hidden bg-background px-5 pt-4">
      <OnboardingFrogStage indices={{ skin: 1, hat: 0, body: 0, hand_item: 0 }} />
      <div className="relative z-10 flex w-full max-w-none flex-col md:max-w-lg lg:max-w-xl" style={{ minHeight: '100%' }}>
        <CreateAccountStep
          selections={{
            frogName: ['Pebble'],
            humanName: ['Snir'],
            frogSkin: ['blue'],
            focusAreas: [
              'd8eb461c-da89-4d6c-804b-67991c165cfb',
              'a681ca88-6a60-46a8-935c-8bbaab5158f7',
              '9c6610f1-b92f-4e49-99f2-f986b43f6217',
            ],
          }}
          onSelect={() => {}}
          onNext={() => {}}
          onBack={() => {}}
          saving={false}
          direction={1}
        />
      </div>
    </main>
  );
}
