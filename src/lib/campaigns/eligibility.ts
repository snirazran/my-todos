import type { CampaignDoc } from '@/lib/models/Campaign';
import type { CampaignUserStateDoc } from '@/lib/models/CampaignUserState';
import {
  DEFAULT_CANVAS,
  DEFAULT_CAPS,
  DEFAULT_RIVE,
  rolloutBucket,
  type CampaignPayload,
  type PlatformTarget,
} from '@/lib/campaigns/types';

export type CampaignAudience = {
  userId: string;
  platform: 'web' | 'ios' | 'android' | 'unknown';
  balance: number;
  hasPaid: boolean;
  isPlus: boolean;
  daysSinceSignup: number;
  isAdmin: boolean;
};

export type EligibilityVerdict = {
  campaignId: string;
  eligible: boolean;
  /** Human-readable reason, surfaced by the admin dry-run. */
  reason: string;
};

const platformMatches = (target: PlatformTarget, platform: string) => {
  if (target === 'any') return true;
  if (target === 'web') return platform === 'web' || platform === 'unknown';
  return platform === 'ios' || platform === 'android';
};

/**
 * Server half of the orchestrator: everything that depends on data the client
 * shouldn't be trusted with (or shouldn't have to download) — status,
 * schedule, audience, and lifetime frequency caps.
 *
 * Session-level rules (one blocking popup per session, the cross-campaign
 * cooldown, which trigger just fired) live on the client, because only the
 * client knows what the user is in the middle of.
 */
export function evaluateCampaign(
  campaign: CampaignDoc,
  audience: CampaignAudience,
  state: CampaignUserStateDoc | undefined,
  now: Date = new Date(),
): EligibilityVerdict {
  const verdict = (eligible: boolean, reason: string): EligibilityVerdict => ({
    campaignId: campaign.id,
    eligible,
    reason,
  });

  if (campaign.status === 'paused') return verdict(false, 'Campaign is paused');
  if (campaign.status === 'draft') return verdict(false, 'Campaign is a draft');
  if (campaign.status === 'test' && !audience.isAdmin) {
    return verdict(false, 'Test mode — admins only');
  }
  if (!campaign.triggers.length) return verdict(false, 'No triggers configured');

  if (campaign.startAt && now < new Date(campaign.startAt)) {
    return verdict(false, 'Scheduled to start later');
  }
  if (campaign.endAt && now > new Date(campaign.endAt)) {
    return verdict(false, 'Schedule has ended');
  }

  const t = campaign.targeting;
  if (!platformMatches(t.platform, audience.platform)) {
    return verdict(false, `Platform is ${audience.platform}, targets ${t.platform}`);
  }
  if (t.payer === 'never_paid' && audience.hasPaid) {
    return verdict(false, 'Targets users who never paid');
  }
  if (t.payer === 'has_paid' && !audience.hasPaid) {
    return verdict(false, 'Targets users who have paid');
  }
  if (t.plus === 'plus' && !audience.isPlus) return verdict(false, 'Targets Plus members');
  if (t.plus === 'not_plus' && audience.isPlus) {
    return verdict(false, 'Targets non-Plus members');
  }
  if (t.minDaysSinceSignup != null && audience.daysSinceSignup < t.minDaysSinceSignup) {
    return verdict(false, `Account is ${audience.daysSinceSignup}d old, needs ${t.minDaysSinceSignup}d`);
  }
  if (t.maxDaysSinceSignup != null && audience.daysSinceSignup > t.maxDaysSinceSignup) {
    return verdict(false, `Account is ${audience.daysSinceSignup}d old, max ${t.maxDaysSinceSignup}d`);
  }
  if (t.balanceBelow != null && audience.balance >= t.balanceBelow) {
    return verdict(false, `Balance ${audience.balance} is not below ${t.balanceBelow}`);
  }
  if (t.balanceAbove != null && audience.balance <= t.balanceAbove) {
    return verdict(false, `Balance ${audience.balance} is not above ${t.balanceAbove}`);
  }
  const rollout = t.rollout ?? 100;
  if (rollout < 100) {
    const bucket = rolloutBucket(audience.userId, campaign.id);
    if (bucket >= rollout) {
      return verdict(false, `Held out — bucket ${bucket} of ${rollout}% rollout`);
    }
  }

  if (state) {
    if (state.converted) return verdict(false, 'Already converted on this campaign');
    if (campaign.caps.perUser > 0 && state.impressions >= campaign.caps.perUser) {
      return verdict(false, `Hit the ${campaign.caps.perUser}-impression cap`);
    }
    const perDay = campaign.caps.perDay ?? 0;
    if (perDay > 0 && state.dayKey === now.toISOString().slice(0, 10)) {
      if ((state.dayCount ?? 0) >= perDay) {
        return verdict(false, `Already shown ${state.dayCount}× today, max ${perDay}`);
      }
    }
    if (
      campaign.caps.suppressAfterDismissals > 0 &&
      state.dismissals >= campaign.caps.suppressAfterDismissals
    ) {
      return verdict(false, `Dismissed ${state.dismissals}× — suppressed`);
    }
    if (campaign.caps.cooldownHours > 0 && state.lastShownAt) {
      const readyAt =
        new Date(state.lastShownAt).getTime() + campaign.caps.cooldownHours * 3600_000;
      if (now.getTime() < readyAt) {
        const hours = Math.ceil((readyAt - now.getTime()) / 3600_000);
        return verdict(false, `Cooling down for another ${hours}h`);
      }
    }
  }

  return verdict(true, 'Eligible');
}

export const campaignAssetUrl = (
  campaign: Pick<CampaignDoc, 'id' | 'imageFile' | 'imageVersion' | 'riveFile' | 'riveVersion'>,
  kind: 'image' | 'rive',
) => {
  const file = kind === 'rive' ? campaign.riveFile : campaign.imageFile;
  if (!file?.storagePath) return '';
  const version = kind === 'rive' ? campaign.riveVersion : campaign.imageVersion;
  const suffix = kind === 'rive' ? '&kind=rive' : '';
  return `/api/campaign-assets/${encodeURIComponent(campaign.id)}?v=${version ?? 0}${suffix}`;
};

export function toCampaignPayload(campaign: CampaignDoc): CampaignPayload {
  const rive = { ...DEFAULT_RIVE, ...(campaign.rive ?? {}) };
  const canvas = {
    aspect: campaign.canvas?.aspect || DEFAULT_CANVAS.aspect,
    maxWidth: campaign.canvas?.maxWidth || DEFAULT_CANVAS.maxWidth,
    elements: campaign.canvas?.elements ?? [],
  };
  return {
    id: campaign.id,
    name: campaign.name,
    template: campaign.template,
    tier: campaign.tier,
    priority: campaign.priority,
    status: campaign.status,
    art: campaign.art ?? 'image',
    imageUrl: campaignAssetUrl(campaign, 'image'),
    riveUrl: rive.libraryPath || campaignAssetUrl(campaign, 'rive'),
    rive: {
      ...rive,
      buttons: (rive.buttons ?? []).map((button) => ({
        signal: button.signal,
        source: button.source ?? 'event',
        action: button.action ?? 'cta',
        path: button.path ?? '',
        packId: button.packId ?? '',
        productId: button.productId ?? '',
        closes: button.closes !== false,
      })),
      inputs: rive.inputs ?? [],
      tickers: rive.tickers ?? [],
    },
    canvas,
    assets: (campaign.assets ?? []).map((asset) => ({
      id: asset.id,
      kind: asset.kind,
      name: asset.name,
      url: `/api/campaign-assets/${encodeURIComponent(campaign.id)}?asset=${encodeURIComponent(asset.id)}&v=${asset.version ?? 1}`,
    })),
    endAt: campaign.endAt ? new Date(campaign.endAt).toISOString() : null,
    delayMs: campaign.caps?.delayMs ?? DEFAULT_CAPS.delayMs,
    copy: {
      eyebrow: campaign.copy?.eyebrow ?? '',
      headline: campaign.copy?.headline ?? '',
      body: campaign.copy?.body ?? '',
      ctaLabel: campaign.copy?.ctaLabel || 'Get it',
      dismissLabel: campaign.copy?.dismissLabel || 'Not now',
    },
    cta: {
      action: campaign.cta?.action ?? 'dismiss',
      path: campaign.cta?.path ?? '',
      productId: campaign.cta?.productId ?? '',
      reward: campaign.cta?.reward ?? { grants: [], limit: 'once' },
    },
    offer: {
      packId: campaign.offer?.packId ?? '',
      productId: campaign.offer?.productId ?? '',
      bonusLabel: campaign.offer?.bonusLabel ?? '',
    },
    triggers: campaign.triggers.map((rule) => ({
      event: rule.event,
      minGap: rule.minGap,
      minDays: rule.minDays,
      minMinutes: rule.minMinutes,
      minStreak: rule.minStreak,
    })),
  };
}
