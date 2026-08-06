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

export const CAMPAIGN_TEMPLATES = ['canvas', 'nudge-banner'] as const;
export type CampaignTemplate = (typeof CAMPAIGN_TEMPLATES)[number];

/** Templates that take over the screen; everything else renders inline. */
export const BLOCKING_TEMPLATES: CampaignTemplate[] = ['canvas'];

export const TEMPLATE_LABELS: Record<CampaignTemplate, string> = {
  canvas: 'Canvas — your artwork',
  'nudge-banner': 'Nudge — inline banner',
};

export const TEMPLATE_HELP: Record<CampaignTemplate, string> = {
  canvas:
    'Your popup art, centred on a darkened screen, with text, buttons, timers and animation placed on top of it. Everything is positioned against the artwork, so the whole popup scales as one piece on any screen.',
  'nudge-banner':
    'A slim bar above the tab bar. Never blocks what the user is doing, so it can show while a sheet is open.',
};

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

/** Exactly what has to happen in the app for each trigger to fire. */
export const TRIGGER_HELP: Record<CampaignTrigger, string> = {
  session_start:
    'Once per app session, right after the campaign list loads. The everyday trigger — pair it with tight caps.',
  task_completed:
    'Every time a task is ticked off on the home list, including the frog task.',
  focus_completed:
    'A focus phase of a Frogodoro session runs to its end. Breaks and manual stops do not count.',
  quest_claimed:
    'A quest, objective, season day or streak reward is claimed — fired once the reward reveal finishes, never over it.',
  streak_milestone:
    'The login streak extends on the daily check-in. Set a minimum so it only fires on the days worth celebrating.',
  insufficient_flies:
    'The user tries to buy something they cannot afford, in the wardrobe or the shop.',
  wishlist_pinned: 'A cosmetic is pinned as a goal from the purchase sheet.',
  shop_opened: 'The fly shop sheet is opened, however the user got there.',
  shop_abandoned:
    'The fly shop is closed without a purchase in that visit — the classic second-chance moment.',
  purchase_completed:
    'A fly pack purchase succeeds. Best used for thank-yous, not for another offer.',
  returned_after_absence:
    'First session after a gap of at least a day. Fires alongside "App opened", and outranks it when both match.',
};

/** The one number each trigger can be narrowed by, if any. */
export type TriggerOption = {
  key: 'minGap' | 'minDays' | 'minMinutes' | 'minStreak';
  label: string;
  hint: string;
};

export const TRIGGER_OPTIONS: Partial<Record<CampaignTrigger, TriggerOption>> = {
  insufficient_flies: {
    key: 'minGap',
    label: 'min gap',
    hint: 'Only when they are short by at least this many flies.',
  },
  returned_after_absence: {
    key: 'minDays',
    label: 'min days',
    hint: 'Only after being away at least this many days.',
  },
  focus_completed: {
    key: 'minMinutes',
    label: 'min minutes',
    hint: 'Only for focus phases at least this long.',
  },
  streak_milestone: {
    key: 'minStreak',
    label: 'min streak',
    hint: 'Only once the streak reaches at least this many days.',
  },
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

export const TIER_SYSTEM_HELP =
  'When two campaigns want the same moment, the higher tier always wins — no matter what priority either one is set to. Priority only breaks ties inside the same tier. Pick the tier by what the message is, not by how much you want it seen.';

export const TIER_HELP: Record<CampaignTier, string> = {
  critical:
    'Something the user has to deal with: a failed payment, an expiring subscription, an account problem. Beats everything else.',
  moment_offer:
    "An offer that only makes sense right now — they're short on flies, or just left the shop. Beats anything scheduled.",
  timed_offer:
    'A sale or seasonal offer with an end date. Loses to a moment-of-need offer, because that one is answering a question the user just asked.',
  announcement:
    'News: a new feature, a policy change, a season starting. Nothing to buy, so it yields to any offer.',
  nudge:
    'Evergreen encouragement with no deadline. Lowest tier on purpose — it should only appear when nothing better wants the slot.',
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

/** What the art slot holds. Rive art can also own the buttons. */
export const CAMPAIGN_ART_KINDS = ['image', 'rive'] as const;
export type CampaignArtKind = (typeof CAMPAIGN_ART_KINDS)[number];

/**
 * `inline` keeps the app's popup chrome (headline, body, CTA button) and puts
 * the animation in the art slot. `full` hands the whole surface to the Rive
 * artboard — the buttons drawn in Rive are the only buttons.
 */
export const RIVE_LAYOUTS = ['inline', 'full'] as const;
export type RiveLayout = (typeof RIVE_LAYOUTS)[number];

export const RIVE_LAYOUT_LABELS: Record<RiveLayout, string> = {
  inline: 'Animation in the art slot, app chrome below',
  full: 'Animation is the whole popup',
};

/**
 * How a Rive button reaches JS. `event` is a General Rive Event fired from a
 * listener — self-describing, so the editor can learn the names by watching.
 * `trigger` is a data-bound trigger property, which has to be named by hand
 * because the runtime can't enumerate them.
 */
export const RIVE_SIGNAL_SOURCES = ['event', 'trigger'] as const;
export type RiveSignalSource = (typeof RIVE_SIGNAL_SOURCES)[number];

export const RIVE_SIGNAL_SOURCE_LABELS: Record<RiveSignalSource, string> = {
  event: 'Rive Event',
  trigger: 'Data-bind trigger',
};

/** `cta` reuses whatever the campaign's main button does. */
export const SIGNAL_ACTIONS = ['cta', ...CTA_ACTIONS] as const;
export type SignalAction = (typeof SIGNAL_ACTIONS)[number];

export const SIGNAL_ACTION_LABELS: Record<SignalAction, string> = {
  cta: 'Same as the main button',
  ...CTA_LABELS,
};

export type CampaignRiveButton = {
  /** Event or trigger name exactly as it appears in the Rive file. */
  signal: string;
  source: RiveSignalSource;
  action: SignalAction;
  /** Route for `navigate`; ignored otherwise. */
  path?: string;
  /** Overrides the campaign's pack when this button opens the shop. */
  packId?: string;
  /** Whether firing this signal also closes the popup. */
  closes: boolean;
};

/**
 * A canvas popup is one piece of artwork with elements placed on top of it.
 *
 * Every position and size is a percentage of the artwork box, never a pixel on
 * a particular phone: the whole popup scales as a single unit, so what the
 * designer lines up against the art stays lined up on every screen.
 */
export const ELEMENT_TYPES = [
  'text',
  'image',
  'rive',
  'button',
  'text_button',
  'discount',
  'timer',
  'close',
] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];

export const ELEMENT_LABELS: Record<ElementType, string> = {
  text: 'Text',
  image: 'Image',
  rive: 'Animation',
  button: 'Button',
  text_button: 'Text button',
  discount: 'Discount',
  timer: 'Timer',
  close: 'Close (X)',
};

/** Element types that respond to a tap and are worth counting separately. */
export const CLICKABLE_ELEMENTS: ElementType[] = ['button', 'text_button', 'close'];

export const isClickableElement = (type: ElementType) => CLICKABLE_ELEMENTS.includes(type);

export const TEXT_ALIGNMENTS = ['left', 'center', 'right'] as const;
export type TextAlignment = (typeof TEXT_ALIGNMENTS)[number];

/** How a discount price is struck out. */
export const DISCOUNT_STYLES = ['strike', 'slash', 'pill'] as const;
export type DiscountStyle = (typeof DISCOUNT_STYLES)[number];

export const DISCOUNT_STYLE_LABELS: Record<DiscountStyle, string> = {
  strike: 'Line through the price',
  slash: 'Diagonal slash',
  pill: 'Badge behind the text',
};

/**
 * `schedule` counts down to the campaign's end date — the same deadline for
 * everyone. `per_user` starts when this user first sees the popup, so a
 * "20 minutes left" offer is honest for someone who arrives late.
 */
export const TIMER_MODES = ['schedule', 'per_user'] as const;
export type TimerMode = (typeof TIMER_MODES)[number];

export const TIMER_MODE_LABELS: Record<TimerMode, string> = {
  schedule: 'Counts down to the end date',
  per_user: 'Counts down from first view',
};

export const TIMER_FORMATS = ['hms', 'ms', 'dhm'] as const;
export type TimerFormat = (typeof TIMER_FORMATS)[number];

export const TIMER_FORMAT_LABELS: Record<TimerFormat, string> = {
  hms: '01:59:59',
  ms: '59:59',
  dhm: '2d 4h 30m',
};

export const TIMER_EXPIRY = ['freeze', 'hide', 'close'] as const;
export type TimerExpiry = (typeof TIMER_EXPIRY)[number];

export const TIMER_EXPIRY_LABELS: Record<TimerExpiry, string> = {
  freeze: 'Stop at zero',
  hide: 'Hide the timer',
  close: 'Close the popup',
};

export type CampaignElement = {
  /** Stable id — also the analytics key for this element. */
  id: string;
  type: ElementType;
  /** Position and size, all as a percentage of the artwork box. */
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  /** Draw order, low to high. */
  z: number;
  /** Admin-facing name, and what shows up in the per-element stats. */
  label: string;

  /** text, button, discount, timer. */
  text?: string;
  /** Font size as a percentage of the artwork width, so type scales with art. */
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  align?: TextAlignment;
  lineHeight?: number;
  letterSpacing?: number;
  uppercase?: boolean;
  italic?: boolean;

  /** button, discount pill, close. */
  background?: string;
  radius?: number;
  shadow?: boolean;
  borderColor?: string;
  borderWidth?: number;

  /** button, close. */
  action?: CtaAction;
  path?: string;
  packId?: string;

  /** image, rive. */
  assetId?: string;
  fit?: 'contain' | 'cover';
  artboard?: string;
  stateMachine?: string;
  /** Rive signals still map to actions through the campaign's rive.buttons. */

  /** discount. */
  discountStyle?: DiscountStyle;

  /** timer. */
  timerMode?: TimerMode;
  timerMinutes?: number;
  timerFormat?: TimerFormat;
  timerExpiry?: TimerExpiry;
  opacity?: number;
};

export type CampaignCanvas = {
  /** Artwork aspect ratio, width / height. Set from the uploaded art. */
  aspect: number;
  /** Largest the popup gets on screen, px. */
  maxWidth: number;
  elements: CampaignElement[];
};

export type CampaignAssetRef = {
  id: string;
  kind: 'image' | 'rive';
  name: string;
  url: string;
};

export type CampaignRive = {
  /** A `/foo.riv` path served from public/; blank means use the upload. */
  libraryPath: string;
  artboard: string;
  stateMachine: string;
  layout: RiveLayout;
  fit: 'contain' | 'cover';
  /** Aspect ratio of the canvas box, width / height. */
  aspect: number;
  buttons: CampaignRiveButton[];
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
  /** `focus_completed` only: the focus phase lasted at least this long. */
  minMinutes?: number;
  /** `streak_milestone` only: the streak reached at least this many days. */
  minStreak?: number;
};

export type CampaignTargeting = {
  payer: PayerTarget;
  plus: PlusTarget;
  platform: PlatformTarget;
  minDaysSinceSignup?: number;
  maxDaysSinceSignup?: number;
  balanceBelow?: number;
  balanceAbove?: number;
  /**
   * Share of the targeted audience that may see this, 0–100. The bucket is a
   * stable hash of user + campaign, so a user never flips in or out and the
   * remainder is a real holdout to measure against.
   */
  rollout: number;
};

export type CampaignCaps = {
  /** Lifetime impressions per user. 0 = unlimited. */
  perUser: number;
  /** Hours before the same campaign may show again. */
  cooldownHours: number;
  /** Stop showing to a user after this many dismissals. 0 = never suppress. */
  suppressAfterDismissals: number;
  /** Beat between the trigger firing and the popup appearing. */
  delayMs: number;
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
  art: CampaignArtKind;
  imageUrl: string;
  riveUrl: string;
  rive: CampaignRive;
  copy: CampaignCopy;
  cta: CampaignCta;
  offer: CampaignOffer;
  canvas: CampaignCanvas;
  assets: CampaignAssetRef[];
  triggers: CampaignTriggerRule[];
  delayMs: number;
  /** Deadline for timers set to count down to the schedule. */
  endAt: string | null;
};

export type TriggerContext = {
  /** Flies the user is short by, for `insufficient_flies`. */
  gap?: number;
  /** Days away, for `returned_after_absence`. */
  days?: number;
  /** Length of the focus phase, for `focus_completed`. */
  minutes?: number;
  /** Streak length reached, for `streak_milestone`. */
  streak?: number;
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
  rollout: 100,
};

export const DEFAULT_CAPS: CampaignCaps = {
  perUser: 3,
  cooldownHours: 24,
  suppressAfterDismissals: 2,
  delayMs: 650,
};

export const DEFAULT_CANVAS: CampaignCanvas = {
  aspect: 0.75,
  maxWidth: 380,
  elements: [],
};

export const newElementId = (type: ElementType) =>
  `${type}_${Math.random().toString(36).slice(2, 8)}`;

/** A sensible starting element, dropped in the middle of the artwork. */
export function createElement(type: ElementType, z: number): CampaignElement {
  const base: CampaignElement = {
    id: newElementId(type),
    type,
    x: 25,
    y: 40,
    w: 50,
    h: 12,
    rotation: 0,
    z,
    label: ELEMENT_LABELS[type],
    align: 'center',
    color: '#ffffff',
    fontSize: 6,
    fontWeight: 900,
    lineHeight: 1.15,
    letterSpacing: 0,
    opacity: 100,
  };

  switch (type) {
    case 'button':
      return {
        ...base,
        text: 'Get it',
        y: 72,
        h: 11,
        background: '#4f9149',
        radius: 16,
        shadow: true,
        action: 'open_fly_shop',
        fontSize: 5.5,
      };
    // A tappable line of text with no fill — the "No thanks" under a CTA.
    case 'text_button':
      return {
        ...base,
        text: 'No thanks',
        y: 86,
        h: 8,
        fontSize: 4.5,
        fontWeight: 700,
        action: 'dismiss',
      };
    case 'close':
      return {
        ...base,
        x: 86,
        y: 3,
        w: 10,
        h: 7,
        text: '',
        background: 'rgba(0,0,0,0.35)',
        radius: 999,
        action: 'dismiss',
        label: 'Close',
      };
    case 'timer':
      return {
        ...base,
        y: 60,
        h: 8,
        fontSize: 5,
        timerMode: 'per_user',
        timerMinutes: 30,
        timerFormat: 'hms',
        timerExpiry: 'freeze',
        text: 'Ends in {time}',
      };
    case 'discount':
      return {
        ...base,
        text: '600',
        y: 55,
        w: 30,
        x: 35,
        h: 9,
        discountStyle: 'strike',
        color: '#ffffff',
        fontSize: 5,
      };
    case 'image':
      return { ...base, w: 30, h: 20, x: 35, y: 30, fit: 'contain' };
    case 'rive':
      return { ...base, w: 40, h: 30, x: 30, y: 25, fit: 'contain' };
    default:
      return { ...base, text: 'New text' };
  }
}

export const DEFAULT_RIVE: CampaignRive = {
  libraryPath: '',
  artboard: '',
  stateMachine: '',
  layout: 'inline',
  fit: 'contain',
  aspect: 1,
  buttons: [],
};

export const isBlockingTemplate = (template: CampaignTemplate) =>
  BLOCKING_TEMPLATES.includes(template);

/** True when Rive owns the whole surface, so the app draws no buttons of its own. */
export const isRiveTakeover = (campaign: {
  art: CampaignArtKind;
  riveUrl: string;
  rive: CampaignRive;
}) => campaign.art === 'rive' && campaign.rive.layout === 'full' && !!campaign.riveUrl;

/**
 * Stable 0–99 bucket for rollout and holdout splits. Same inputs, same bucket,
 * on every device and on the server.
 */
export const rolloutBucket = (userId: string, campaignId: string) => {
  let hash = 2166136261;
  const key = `${campaignId}:${userId}`;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 100;
};
