/**
 * The popup platform's shared vocabulary — one file both the admin editor and
 * the client renderer read from, so a template or trigger can never exist on
 * one side only.
 *
 * Admins compose campaigns out of these primitives rather than uploading
 * markup: an uploaded design can't be theme-aware, can't be typed, and can't
 * be safely rendered, so the design stays in code and the admin supplies
 * assets, copy, and an action picked from a fixed list.
 */

export const CAMPAIGN_TEMPLATES = [
  'hero-offer',
  'pack-offer',
  'announcement',
  'nudge-banner',
] as const;
export type CampaignTemplate = (typeof CAMPAIGN_TEMPLATES)[number];

/** Templates that take over the screen; everything else renders inline. */
export const BLOCKING_TEMPLATES: CampaignTemplate[] = [
  'hero-offer',
  'pack-offer',
  'announcement',
];

export const CAMPAIGN_TRIGGERS = [
  'session_start',
  'task_completed',
  'focus_completed',
  'quest_claimed',
  'streak_milestone',
  'insufficient_flies',
  'wishlist_pinned',
  'shop_opened',
  'shop_abandoned',
  'purchase_completed',
  'returned_after_absence',
] as const;
export type CampaignTrigger = (typeof CAMPAIGN_TRIGGERS)[number];

export const TRIGGER_LABELS: Record<CampaignTrigger, string> = {
  session_start: 'App opened',
  task_completed: 'Task completed',
  focus_completed: 'Focus session finished',
  quest_claimed: 'Quest reward claimed',
  streak_milestone: 'Streak milestone hit',
  insufficient_flies: "Can't afford an item",
  wishlist_pinned: 'Pinned a goal',
  shop_opened: 'Fly shop opened',
  shop_abandoned: 'Left the shop without buying',
  purchase_completed: 'Bought flies',
  returned_after_absence: 'Came back after time away',
};

/**
 * Tiers, not raw numbers, decide who wins a collision: a moment-of-need offer
 * should always beat an evergreen nudge no matter what priority someone typed
 * into the editor. The per-campaign priority only breaks ties inside a tier.
 */
export const CAMPAIGN_TIERS = [
  'critical',
  'moment_offer',
  'timed_offer',
  'announcement',
  'nudge',
] as const;
export type CampaignTier = (typeof CAMPAIGN_TIERS)[number];

export const TIER_WEIGHT: Record<CampaignTier, number> = {
  critical: 500,
  moment_offer: 400,
  timed_offer: 300,
  announcement: 200,
  nudge: 100,
};

export const TIER_LABELS: Record<CampaignTier, string> = {
  critical: 'Critical (account / system)',
  moment_offer: 'Moment-of-need offer',
  timed_offer: 'Time-limited offer',
  announcement: 'Announcement',
  nudge: 'Evergreen nudge',
};

export const CTA_ACTIONS = [
  'open_fly_shop',
  'open_wardrobe',
  'open_premium',
  'navigate',
  'dismiss',
] as const;
export type CtaAction = (typeof CTA_ACTIONS)[number];

export const CTA_LABELS: Record<CtaAction, string> = {
  open_fly_shop: 'Open the fly shop',
  open_wardrobe: 'Open the wardrobe',
  open_premium: 'Open the Plus paywall',
  navigate: 'Go to a page',
  dismiss: 'Just close',
};

export const PAYER_TARGETS = ['any', 'never_paid', 'has_paid'] as const;
export type PayerTarget = (typeof PAYER_TARGETS)[number];

export const PLUS_TARGETS = ['any', 'plus', 'not_plus'] as const;
export type PlusTarget = (typeof PLUS_TARGETS)[number];

export const PLATFORM_TARGETS = ['any', 'web', 'native'] as const;
export type PlatformTarget = (typeof PLATFORM_TARGETS)[number];

export const CAMPAIGN_STATUSES = ['draft', 'test', 'live', 'paused'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export type CampaignCopy = {
  eyebrow: string;
  headline: string;
  body: string;
  ctaLabel: string;
  dismissLabel: string;
};

export type CampaignCta = {
  action: CtaAction;
  /** Route for `navigate`; ignored otherwise. */
  path?: string;
};

export type CampaignOffer = {
  /** Highlights this pack when the CTA lands in the fly shop. */
  packId?: string;
  /** Copy-only badge, e.g. "+100% extra". Grants stay server-authoritative. */
  bonusLabel?: string;
};

export type CampaignTriggerRule = {
  event: CampaignTrigger;
  /** `insufficient_flies` only: needs a gap of at least this many flies. */
  minGap?: number;
  /** `returned_after_absence` only: away for at least this many days. */
  minDays?: number;
};

export type CampaignTargeting = {
  payer: PayerTarget;
  plus: PlusTarget;
  platform: PlatformTarget;
  minDaysSinceSignup?: number;
  maxDaysSinceSignup?: number;
  balanceBelow?: number;
  balanceAbove?: number;
};

export type CampaignCaps = {
  /** Lifetime impressions per user. 0 = unlimited. */
  perUser: number;
  /** Hours before the same campaign may show again. */
  cooldownHours: number;
  /** Stop showing to a user after this many dismissals. 0 = never suppress. */
  suppressAfterDismissals: number;
};

export type CampaignSchedule = {
  startAt: string | null;
  endAt: string | null;
};

/** A campaign as the client receives it — no admin-only fields. */
export type CampaignPayload = {
  id: string;
  name: string;
  template: CampaignTemplate;
  tier: CampaignTier;
  priority: number;
  status: CampaignStatus;
  imageUrl: string;
  copy: CampaignCopy;
  cta: CampaignCta;
  offer: CampaignOffer;
  triggers: CampaignTriggerRule[];
};

export type TriggerContext = {
  /** Flies the user is short by, for `insufficient_flies`. */
  gap?: number;
  /** Days away, for `returned_after_absence`. */
  days?: number;
};

export const DEFAULT_COPY: CampaignCopy = {
  eyebrow: '',
  headline: '',
  body: '',
  ctaLabel: 'Get it',
  dismissLabel: 'Not now',
};

export const DEFAULT_TARGETING: CampaignTargeting = {
  payer: 'any',
  plus: 'any',
  platform: 'any',
};

export const DEFAULT_CAPS: CampaignCaps = {
  perUser: 3,
  cooldownHours: 24,
  suppressAfterDismissals: 2,
};

export const isBlockingTemplate = (template: CampaignTemplate) =>
  BLOCKING_TEMPLATES.includes(template);
