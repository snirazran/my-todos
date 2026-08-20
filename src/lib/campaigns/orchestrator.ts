'use client';

import { create } from 'zustand';
import {
  TIER_WEIGHT,
  isBlockingTemplate,
  type CampaignPayload,
  type CampaignTrigger,
  type TriggerContext,
} from '@/lib/campaigns/types';

/** At most one screen-taking popup per session, no matter how many campaigns
 *  are eligible — the single most important rule in the whole system. */
const MAX_BLOCKING_PER_SESSION = 1;
/** Quiet window between blocking popups, across every campaign. */
const CROSS_CAMPAIGN_COOLDOWN_MS = 4 * 3600_000;
const LAST_BLOCKING_KEY = 'frogress.campaigns.lastBlockingAt';
/** A popup that lands in the same frame as the trigger reads as a glitch. */
const SHOW_DELAY_MS = 650;

type CampaignEvent = 'impression' | 'click' | 'dismiss' | 'convert';

/** How long a click stays creditable for a purchase that follows it. */
const CONVERSION_WINDOW_MS = 30 * 60_000;

type Store = {
  campaigns: CampaignPayload[];
  active: CampaignPayload | null;
  /** Blocking campaign that lost to a busy moment, waiting for a clear one. */
  pending: CampaignPayload | null;
  blockingShown: number;
  shownIds: string[];
  /** Set by surfaces that must not be interrupted (sheets, focus, onboarding). */
  busyReasons: string[];
  /** Last campaign whose button was pressed, for conversion attribution. */
  lastClick: { id: string; at: number } | null;
  setCampaigns: (campaigns: CampaignPayload[]) => void;
  setBusy: (reason: string, busy: boolean) => void;
  emit: (trigger: CampaignTrigger, context?: TriggerContext) => void;
  show: (campaign: CampaignPayload) => void;
  schedule: (campaign: CampaignPayload) => void;
  close: (outcome: 'click' | 'dismiss', elementId?: string) => void;
  flushPending: () => void;
  claimBlockingSlot: () => boolean;
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

/** Tier first, then the admin's priority, then the campaign that was defined
 *  most recently — server order is already newest-last. */
const rank = (a: CampaignPayload, b: CampaignPayload) =>
  TIER_WEIGHT[b.tier] - TIER_WEIGHT[a.tier] || b.priority - a.priority;

export const useCampaignStore = create<Store>((set, get) => ({
  campaigns: [],
  active: null,
  pending: null,
  blockingShown: 0,
  shownIds: [],
  busyReasons: [],
  lastClick: null,

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
    if (state.active || state.pending) return;

    const candidates = state.campaigns
      .filter((campaign) => !state.shownIds.includes(campaign.id))
      .filter((campaign) => matchesTrigger(campaign, trigger, context))
      .sort(rank);

    for (const campaign of candidates) {
      const blocking = isBlockingTemplate(campaign.template);
      if (!blocking) {
        get().schedule(campaign);
        return;
      }
      if (state.blockingShown >= MAX_BLOCKING_PER_SESSION) return;
      if (Date.now() - readLastBlockingAt() < CROSS_CAMPAIGN_COOLDOWN_MS) return;
      // Interrupting an open sheet or a focus session costs more than the
      // popup could ever earn, so it waits for the next clear moment instead.
      if (state.busyReasons.length > 0) {
        set({ pending: campaign });
        return;
      }
      get().schedule(campaign);
      return;
    }
  },

  /** Landing in the same frame as the trigger reads as a glitch, so every
   *  campaign waits out its own beat and re-checks the room before appearing.
   *  Holding it as pending in the meantime keeps a second trigger from queuing
   *  a second popup behind it. */
  schedule: (campaign) => {
    set({ pending: campaign });
    const delay = Math.max(0, campaign.delayMs ?? SHOW_DELAY_MS);
    window.setTimeout(() => {
      const now = get();
      if (now.active || now.pending?.id !== campaign.id) return;
      if (isBlockingTemplate(campaign.template) && now.busyReasons.length > 0) return;
      now.show(campaign);
    }, delay);
  },

  show: (campaign) => {
    const state = get();
    if (state.active) return;
    const blocking = isBlockingTemplate(campaign.template);
    set({
      active: campaign,
      pending: null,
      shownIds: [...state.shownIds, campaign.id],
      blockingShown: state.blockingShown + (blocking ? 1 : 0),
    });
    if (blocking) writeLastBlockingAt(Date.now());
    reportEvent(campaign.id, 'impression');
  },

  close: (outcome, elementId) => {
    const campaign = get().active;
    if (!campaign) return;
    reportEvent(campaign.id, outcome === 'click' ? 'click' : 'dismiss', elementId);
    set({
      active: null,
      lastClick: outcome === 'click' ? { id: campaign.id, at: Date.now() } : get().lastClick,
    });
  },

  claimBlockingSlot: () => {
    const state = get();
    if (state.active || state.pending) return false;
    if (state.blockingShown >= MAX_BLOCKING_PER_SESSION) return false;
    if (state.busyReasons.length > 0) return false;
    if (Date.now() - readLastBlockingAt() < CROSS_CAMPAIGN_COOLDOWN_MS) return false;
    set({ blockingShown: state.blockingShown + 1 });
    writeLastBlockingAt(Date.now());
    return true;
  },

  flushPending: () => {
    const state = get();
    if (!state.pending || state.active || state.busyReasons.length > 0) return;
    const campaign = state.pending;
    window.setTimeout(() => {
      const now = get();
      if (now.active || now.busyReasons.length > 0) return;
      if (now.pending?.id !== campaign.id) return;
      now.show(campaign);
    }, campaign.delayMs ?? SHOW_DELAY_MS);
  },
}));

/** Fire a trigger from anywhere in the app. Cheap and safe to over-call —
 *  the orchestrator decides whether anything is worth showing. */
export const emitCampaignTrigger = (
  trigger: CampaignTrigger,
  context?: TriggerContext,
) => {
  useCampaignStore.getState().emit(trigger, context);
};

/**
 * Lets a hand-built popup take the session's one blocking slot, so an
 * in-product nudge and an admin campaign can never both interrupt the same
 * session.
 */
export const claimBlockingSlot = () =>
  useCampaignStore.getState().claimBlockingSlot();

/** Mark a surface as uninterruptible while it's open. */
export const setCampaignBusy = (reason: string, busy: boolean) => {
  useCampaignStore.getState().setBusy(reason, busy);
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
