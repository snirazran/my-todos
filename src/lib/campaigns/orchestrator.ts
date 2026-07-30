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

type Store = {
  campaigns: CampaignPayload[];
  active: CampaignPayload | null;
  /** Blocking campaign that lost to a busy moment, waiting for a clear one. */
  pending: CampaignPayload | null;
  blockingShown: number;
  shownIds: string[];
  /** Set by surfaces that must not be interrupted (sheets, focus, onboarding). */
  busyReasons: string[];
  setCampaigns: (campaigns: CampaignPayload[]) => void;
  setBusy: (reason: string, busy: boolean) => void;
  emit: (trigger: CampaignTrigger, context?: TriggerContext) => void;
  show: (campaign: CampaignPayload) => void;
  close: (outcome: 'click' | 'dismiss') => void;
  flushPending: () => void;
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

function reportEvent(campaignId: string, event: CampaignEvent) {
  void fetch('/api/campaigns/event', {
    method: 'POST',
    credentials: 'include',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campaignId, event }),
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

    const candidates = state.campaigns
      .filter((campaign) => !state.shownIds.includes(campaign.id))
      .filter((campaign) => matchesTrigger(campaign, trigger, context))
      .sort(rank);

    for (const campaign of candidates) {
      const blocking = isBlockingTemplate(campaign.template);
      if (!blocking) {
        get().show(campaign);
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
      get().show(campaign);
      return;
    }
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

  close: (outcome) => {
    const campaign = get().active;
    if (!campaign) return;
    reportEvent(campaign.id, outcome === 'click' ? 'click' : 'dismiss');
    set({ active: null });
  },

  flushPending: () => {
    const state = get();
    if (!state.pending || state.active || state.busyReasons.length > 0) return;
    const campaign = state.pending;
    window.setTimeout(() => {
      const now = get();
      if (now.active || now.busyReasons.length > 0) return;
      now.show(campaign);
    }, SHOW_DELAY_MS);
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

/** Mark a surface as uninterruptible while it's open. */
export const setCampaignBusy = (reason: string, busy: boolean) => {
  useCampaignStore.getState().setBusy(reason, busy);
};

export const markCampaignConverted = (campaignId: string) => {
  reportEvent(campaignId, 'convert');
};

export { SHOW_DELAY_MS };
