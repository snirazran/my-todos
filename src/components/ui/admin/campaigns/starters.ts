import {
  createElement,
  type CampaignElement,
  type ElementType,
} from '@/lib/campaigns/types';
import type { CampaignRow } from './types';

export type CampaignStarter = {
  key: string;
  label: string;
  description: string;
  build: (base: CampaignRow) => CampaignRow;
};

type Layout = [ElementType, Partial<CampaignElement>][];

const elementsFrom = (layout: Layout) =>
  layout.map(([type, partial], index) => ({ ...createElement(type, index), ...partial }));

const card = (background: string): [ElementType, Partial<CampaignElement>] => [
  'text',
  { label: 'Card — delete once artwork is uploaded', text: '', x: 0, y: 0, w: 100, h: 100, background, radius: 7 },
];

const eyebrow = (text: string, color: string): [ElementType, Partial<CampaignElement>] => [
  'text',
  { label: 'Eyebrow', text, y: 11, h: 6, fontSize: 3.6, letterSpacing: 0.12, uppercase: true, color },
];

const headline = (text: string, y = 18): [ElementType, Partial<CampaignElement>] => [
  'text',
  { label: 'Headline', text, x: 8, w: 84, y, h: 16, fontSize: 8 },
];

const body = (text: string, y: number): [ElementType, Partial<CampaignElement>] => [
  'text',
  { label: 'Body', text, x: 10, w: 80, y, h: 12, fontSize: 4.2, fontWeight: 700, color: 'rgba(255,255,255,0.82)' },
];

const close: [ElementType, Partial<CampaignElement>] = ['close', {}];

const later = (text: string): [ElementType, Partial<CampaignElement>] => [
  'text_button',
  { label: 'Not now', text, y: 88, h: 8, color: 'rgba(255,255,255,0.7)' },
];

const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

export const CAMPAIGN_STARTERS: CampaignStarter[] = [
  {
    key: 'sale',
    label: 'Sale',
    description: 'A discounted product with its old price struck out and a real end date.',
    build: (base) => ({
      ...base,
      name: 'Sale',
      tier: 'timed_offer',
      endAt: daysFromNow(7),
      caps: { ...base.caps, perUser: 3, perDay: 1, cooldownHours: 24 },
      canvas: {
        ...base.canvas,
        elements: elementsFrom([
          card('#1f4a2a'),
          close,
          eyebrow('Limited-time sale', '#b9f5a8'),
          headline("{frog}'s fly sale"),
          ['discount', { label: 'Was price', x: 30, w: 40, y: 40, h: 7, color: 'rgba(255,255,255,0.65)' }],
          ['text', { label: 'Price', text: '{price}', y: 47, h: 12, fontSize: 11 }],
          ['timer', { label: 'Countdown', timerMode: 'schedule', text: 'Ends in {time}', y: 61, h: 7, fontSize: 4, color: '#b9f5a8' }],
          ['button', { label: 'Buy', text: 'Get it for {price}', action: 'buy_product', productId: '', x: 12, w: 76, y: 72, h: 11 }],
          later('Not now'),
        ]),
      },
    }),
  },
  {
    key: 'bundle',
    label: 'Bundle',
    description: 'Several things for one price — flies, items, a background — paid with real money.',
    build: (base) => ({
      ...base,
      name: 'Bundle',
      tier: 'timed_offer',
      caps: { ...base.caps, perUser: 3, perDay: 1, cooldownHours: 48 },
      canvas: {
        ...base.canvas,
        elements: elementsFrom([
          card('#21364f'),
          close,
          eyebrow('Bundle', '#a8d8ff'),
          headline('The Pond Starter Pack'),
          body('Flies, a hat and a fresh pond — all in one go.', 36),
          ['text', { label: 'Price', text: '{price}', y: 52, h: 12, fontSize: 11 }],
          ['button', { label: 'Buy', text: 'Get the bundle', action: 'buy_product', productId: '', x: 12, w: 76, y: 72, h: 11, background: '#2f7fd1' }],
          later('Maybe later'),
        ]),
      },
    }),
  },
  {
    key: 'plus',
    label: 'Plus offer',
    description: 'The real Plus subscription at its introductory price, with the renewal price spelled out.',
    build: (base) => ({
      ...base,
      name: 'Plus offer',
      tier: 'timed_offer',
      targeting: { ...base.targeting, plus: 'not_plus' },
      caps: { ...base.caps, perUser: 2, perDay: 1, cooldownHours: 72 },
      canvas: {
        ...base.canvas,
        elements: elementsFrom([
          card('#2a2210'),
          close,
          eyebrow('Frogress Plus', '#ffd66b'),
          headline('{save} off your first {period}'),
          ['discount', { label: 'Regular price', x: 30, w: 40, y: 38, h: 7, color: 'rgba(255,255,255,0.6)' }],
          ['text', { label: 'Price', text: '{price}', y: 45, h: 12, fontSize: 11, color: '#ffd66b' }],
          body('Then {regular_price} a {period}. Cancel anytime.', 58),
          ['button', { label: 'Subscribe', text: 'Start Plus', action: 'buy_product', productId: '', x: 12, w: 76, y: 72, h: 11, background: '#d89b16' }],
          later('Not now'),
        ]),
      },
    }),
  },
  {
    key: 'announcement',
    label: 'Announcement',
    description: 'News about the app — a feature, a season, a change — with one button to see it.',
    build: (base) => ({
      ...base,
      name: 'Announcement',
      tier: 'announcement',
      caps: { ...base.caps, perUser: 1, perDay: 1 },
      canvas: {
        ...base.canvas,
        elements: elementsFrom([
          card('#1f4a2a'),
          close,
          eyebrow('New', '#b9f5a8'),
          headline('Something new in the pond', 20),
          body("Say what changed and why {frog} will like it.", 40),
          ['button', { label: 'See it', text: 'Take a look', action: 'navigate', path: '', x: 12, w: 76, y: 72, h: 11 }],
          later('Later'),
        ]),
      },
    }),
  },
  {
    key: 'nudge',
    label: 'Action nudge',
    description: 'A small banner asking for one thing, without blocking the screen.',
    build: (base) => ({
      ...base,
      name: 'Action nudge',
      template: 'nudge-banner',
      tier: 'nudge',
      copy: {
        ...base.copy,
        headline: '{frog} has an idea',
        body: 'Finish one task today to keep the streak alive.',
        ctaLabel: "Let's go",
      },
      cta: { action: 'navigate', path: '/' },
    }),
  },
];
