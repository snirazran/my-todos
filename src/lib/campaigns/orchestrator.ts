'use client';

import { create } from 'zustand';
import { holdAutoPopups, isScreenBusy, releaseAutoPopups } from '@/lib/popupGate';
import {
  TIER_BUDGET,
  TIER_WEIGHT,
  isBlockingTemplate,
  type CampaignPayload,
  type CampaignTrigger,
  type TriggerContext,
} from '@/lib/campaigns/types';

const MAX_AMBIENT_PER_SESSION = 1;
const MAX_MOMENT_PER_SESSION = 1;
const CROSS_CAMPAIGN_COOLDOWN_MS = 4 * 3600_000;
const LAST_BLOCKING_KEY = 'frogress.campaigns.lastBlockingAt';
/** A popup that lands in the same frame as the trigger reads as a glitch. */
const SHOW_DELAY_MS = 650;
const MOMENT_PENDING_MS = 60_000;
const PENDING_MS = 10 * 60_000;
const PREPARE_TIMEOUT_MS = 5_000;
const BANNER_LIFETIME_MS = 15_000;
export const CAMPAIGN_HOLD = 'campaign';
const CAMPAIGN_HOLD_MS = 15 * 60_000;

type CampaignEvent = 'impression' | 'click' | 'dismiss' | 'convert';

/** How long a click stays creditable for a purchase that follows it. */
const CONVERSION_WINDOW_MS = 30 * 60_000;

export type CampaignPreparer = (campaign: CampaignPayload) => Promise<boolean>;

let preparer: CampaignPreparer | null = null;
let bannerTimer = 0;
let scheduling: string | null = null;

type Store = {
  campaigns: CampaignPayload[];
  active: CampaignPayload | null;
  pending: CampaignPayload | null;
  pendingUntil: number;
  ambientShown: number;
  momentShown: number;
  shownIds: string[];
  /** Set by surfaces that must not be interrupted (sheets, focus, onboarding). */
  busyReasons: string[];
  /** Last campaign whose button was pressed, for conversion attribution. */
  lastClick: { id: string; at: number } | null;
  /** True once the open popup's tap has been counted, so closing can't double it. */
  clickReported: boolean;
  setCampaigns: (campaigns: CampaignPayload[]) => void;
  setBusy: (reason: string, busy: boolean) => void;
  emit: (trigger: CampaignTrigger, context?: TriggerContext) => void;
  show: (campaign: CampaignPayload) => void;
  schedule: (campaign: CampaignPayload) => void;
  close: (outcome: 'click' | 'dismiss' | 'expire', elementId?: string) => void;
  /** Report a tap on a button that stays open — a purchase or a claim. */
  reportClick: (elementId?: string) => void;
  flushPending: () => void;
  claimBlockingSlot: (earned?: boolean) => boolean;
  startNewSession: () => void;
};

const readLastBlockingAt = () => {
  try {
    return Number(window.localStorage.getItem(LAST_BLOCKING_KEY)) || 0;
  } catch {
    return 0;
  }
};

const writeLastBlockingAt = (at: number) => {
  try {
    window.localStorage.setItem(LAST_BLOCKING_KEY, String(at));
  } catch {
    /* best effort */
  }
};

function reportEvent(campaignId: string, event: CampaignEvent, elementId?: string) {
  void fetch('/api/campaigns/event', {
    method: 'POST',
    credentials: 'include',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campaignId, event, elementId }),
  }).catch(() => {});
}

const matchesTrigger = (
  campaign: CampaignPayload,
  trigger: CampaignTrigger,
  context: TriggerContext,
) =>
  campaign.triggers.some((rule) => {
    if (rule.event !== trigger) return false;
    if (rule.minGap != null && (context.gap ?? 0) < rule.minGap) return false;
    if (rule.minDays != null && (context.days ?? 0) < rule.minDays) return false;
    if (rule.minMinutes != null && (context.minutes ?? 0) < rule.minMinutes) return false;
    if (rule.minStreak != null && (context.streak ?? 0) < rule.minStreak) return false;
    return true;
  });

const inSchedule = (campaign: CampaignPayload, now = Date.now()) =>
  (!campaign.startAt || new Date(campaign.startAt).getTime() <= now) &&
  (!campaign.endAt || new Date(campaign.endAt).getTime() > now);

/**
 * Anything on screen, plus anything that has claimed the screen before it is
 * on it — the daily streak check-in spends its first second in a network call
 * with nothing rendered, and a campaign that only read `busyReasons` would
 * sail straight through that window and land first.
 */
const interrupts = () =>
  useCampaignStore.getState().busyReasons.length > 0 || isScreenBusy(CAMPAIGN_HOLD);

const rank = (a: CampaignPayload, b: CampaignPayload) =>
  TIER_WEIGHT[b.tier] - TIER_WEIGHT[a.tier] || b.priority - a.priority;

function hasBudget(state: Store, campaign: CampaignPayload) {
  if (!isBlockingTemplate(campaign.template)) return true;
  switch (TIER_BUDGET[campaign.tier]) {
    case 'unlimited':
      return true;
    case 'moment':
      return state.momentShown < MAX_MOMENT_PER_SESSION;
    default:
      return (
        state.ambientShown < MAX_AMBIENT_PER_SESSION &&
        Date.now() - readLastBlockingAt() >= CROSS_CAMPAIGN_COOLDOWN_MS
      );
  }
}

const pendingWindow = (campaign: CampaignPayload) =>
  TIER_BUDGET[campaign.tier] === 'moment' ? MOMENT_PENDING_MS : PENDING_MS;

function prepare(campaign: CampaignPayload): Promise<boolean> {
  if (!preparer) return Promise.resolve(true);
  const run = preparer;
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(false), PREPARE_TIMEOUT_MS);
    run(campaign)
      .then((ready) => resolve(ready))
      .catch(() => resolve(false))
      .finally(() => window.clearTimeout(timer));
  });
}

export const useCampaignStore = create<Store>((set, get) => ({
  campaigns: [],
  active: null,
  pending: null,
  pendingUntil: 0,
  ambientShown: 0,
  momentShown: 0,
  shownIds: [],
  busyReasons: [],
  lastClick: null,
  clickReported: false,

  setCampaigns: (campaigns) => set({ campaigns }),

  setBusy: (reason, busy) =>
    set((state) => {
      const busyReasons = busy
        ? state.busyReasons.includes(reason)
          ? state.busyReasons
          : [...state.busyReasons, reason]
        : state.busyReasons.filter((r) => r !== reason);
      return { busyReasons };
    }),

  emit: (trigger, context = {}) => {
    const state = get();
    if (state.active) return;

    const now = Date.now();
    const best = state.campaigns
      .filter((campaign) => !state.shownIds.includes(campaign.id))
      .filter((campaign) => inSchedule(campaign, now))
      .filter((campaign) => matchesTrigger(campaign, trigger, context))
      .filter((campaign) => hasBudget(state, campaign))
      .sort(rank)[0];
    if (!best) return;

    const waiting = state.pending && state.pendingUntil > now ? state.pending : null;
    if (waiting && (waiting.id === best.id || rank(best, waiting) >= 0)) return;

    if (interrupts()) {
      set({ pending: best, pendingUntil: now + pendingWindow(best) });
      return;
    }
    get().schedule(best);
  },

  /** Landing in the same frame as the trigger reads as a glitch, so every
   *  campaign waits out its own beat and re-checks the room before appearing.
   *  Holding it as pending in the meantime keeps a second trigger from queuing
   *  a second popup behind it. */
  schedule: (campaign) => {
    set({ pending: campaign, pendingUntil: Date.now() + pendingWindow(campaign) });
    if (scheduling === campaign.id) return;
    scheduling = campaign.id;
    const delay = Math.max(0, campaign.delayMs ?? SHOW_DELAY_MS);
    void Promise.all([prepare(campaign), new Promise((r) => window.setTimeout(r, delay))]).then(
      ([ready]) => {
        if (scheduling === campaign.id) scheduling = null;
        const now = get();
        if (now.active || now.pending?.id !== campaign.id) return;
        if (!ready) {
          set((state) => ({
            pending: null,
            pendingUntil: 0,
            shownIds: [...state.shownIds, campaign.id],
          }));
          return;
        }
        // Still pending, so `flushPending` picks it up the moment the screen
        // clears rather than dropping a campaign that only lost its timing.
        if (interrupts()) return;
        now.show(campaign);
      },
    );
  },

  show: (campaign) => {
    const state = get();
    if (state.active) return;
    if (!inSchedule(campaign) || !hasBudget(state, campaign)) {
      set({ pending: null, pendingUntil: 0 });
      return;
    }
    const blocking = isBlockingTemplate(campaign.template);
    const budget = blocking ? TIER_BUDGET[campaign.tier] : null;
    set({
      active: campaign,
      pending: null,
      pendingUntil: 0,
      shownIds: [...state.shownIds, campaign.id],
      clickReported: false,
      ambientShown: state.ambientShown + (budget === 'ambient' ? 1 : 0),
      momentShown: state.momentShown + (budget === 'moment' ? 1 : 0),
    });
    if (blocking && budget !== 'unlimited') writeLastBlockingAt(Date.now());
    if (blocking) {
      holdAutoPopups(CAMPAIGN_HOLD, CAMPAIGN_HOLD_MS);
    } else {
      window.clearTimeout(bannerTimer);
      bannerTimer = window.setTimeout(() => {
        if (get().active?.id === campaign.id) get().close('expire');
      }, BANNER_LIFETIME_MS);
    }
    reportEvent(campaign.id, 'impression');
  },

  close: (outcome, elementId) => {
    const campaign = get().active;
    if (!campaign) return;
    // A button that already reported its own tap (a purchase, a claim) closes
    // without reporting a second one.
    if (outcome !== 'expire' && !(outcome === 'click' && get().clickReported)) {
      reportEvent(campaign.id, outcome === 'click' ? 'click' : 'dismiss', elementId);
    }
    window.clearTimeout(bannerTimer);
    if (isBlockingTemplate(campaign.template)) releaseAutoPopups(CAMPAIGN_HOLD);
    set({
      active: null,
      clickReported: false,
      lastClick: outcome === 'click' ? { id: campaign.id, at: Date.now() } : get().lastClick,
    });
  },

  /**
   * A purchase or a reward claim keeps the popup up until it succeeds, so the
   * tap has to be counted when it happens. Otherwise a cancelled payment sheet
   * would leave no trace at all, and the buttons that matter most would look
   * like the ones nobody presses.
   */
  reportClick: (elementId) => {
    const campaign = get().active;
    if (!campaign || get().clickReported) return;
    reportEvent(campaign.id, 'click', elementId);
    set({ clickReported: true, lastClick: { id: campaign.id, at: Date.now() } });
  },

  claimBlockingSlot: (earned = false) => {
    const state = get();
    if (state.active || (state.pending && state.pendingUntil > Date.now())) return false;
    if (interrupts()) return false;
    if (!earned) {
      if (state.ambientShown >= MAX_AMBIENT_PER_SESSION) return false;
      if (Date.now() - readLastBlockingAt() < CROSS_CAMPAIGN_COOLDOWN_MS) return false;
    }
    set({ ambientShown: state.ambientShown + 1 });
    writeLastBlockingAt(Date.now());
    return true;
  },

  flushPending: () => {
    const state = get();
    if (!state.pending || state.active || interrupts()) return;
    const campaign = state.pending;
    if (state.pendingUntil <= Date.now() || !inSchedule(campaign) || !hasBudget(state, campaign)) {
      set({ pending: null, pendingUntil: 0 });
      return;
    }
    get().schedule(campaign);
  },

  startNewSession: () =>
    set((state) => ({
      shownIds: state.active ? [state.active.id] : [],
      ambientShown: 0,
      momentShown: 0,
      pending: null,
      pendingUntil: 0,
    })),
}));

/** Fire a trigger from anywhere in the app. Cheap and safe to over-call —
 *  the orchestrator decides whether anything is worth showing. */
export const emitCampaignTrigger = (
  trigger: CampaignTrigger,
  context?: TriggerContext,
) => {
  useCampaignStore.getState().emit(trigger, context);
};

export const claimBlockingSlot = (earned = false) =>
  useCampaignStore.getState().claimBlockingSlot(earned);

/** Mark a surface as uninterruptible while it's open. */
export const setCampaignBusy = (reason: string, busy: boolean) => {
  useCampaignStore.getState().setBusy(reason, busy);
};

export const setCampaignPreparer = (next: CampaignPreparer | null) => {
  preparer = next;
};

/**
 * Credits a purchase to the popup that sent the user there. Without an id it
 * uses the last campaign whose button was pressed, as long as that click is
 * recent enough to plausibly be the reason.
 */
export const markCampaignConverted = (campaignId?: string) => {
  if (campaignId) {
    reportEvent(campaignId, 'convert');
    return;
  }
  const { lastClick } = useCampaignStore.getState();
  if (!lastClick || Date.now() - lastClick.at > CONVERSION_WINDOW_MS) return;
  reportEvent(lastClick.id, 'convert');
  useCampaignStore.setState({ lastClick: null });
};

export { SHOW_DELAY_MS };
