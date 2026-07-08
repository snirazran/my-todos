import type { Viewport } from 'next';
import type { ReactNode } from 'react';

// Scoped to onboarding: `resizes-content` makes Android Chrome shrink the
// layout viewport when the keyboard opens, so bottom CTAs stay visible above
// it. Kept off the rest of the app to avoid disturbing tuned sheet layouts.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1410' },
  ],
};

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return children;
}
