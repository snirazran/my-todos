import type { CampaignDoc } from '@/lib/models/Campaign';
import type { CampaignUserStateDoc } from '@/lib/models/CampaignUserState';
import type { CampaignPayload, PlatformTarget } from '@/lib/campaigns/types';

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

  if (state) {
    if (state.converted) return verdict(false, 'Already converted on this campaign');
    if (campaign.caps.perUser > 0 && state.impressions >= campaign.caps.perUser) {
      return verdict(false, `Hit the ${campaign.caps.perUser}-impression cap`);
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

export function toCampaignPayload(campaign: CampaignDoc): CampaignPayload {
  return {
    id: campaign.id,
    name: campaign.name,
    template: campaign.template,
    tier: campaign.tier,
    priority: campaign.priority,
    status: campaign.status,
    imageUrl: campaign.imageFile
      ? `/api/campaign-assets/${encodeURIComponent(campaign.id)}?v=${campaign.imageVersion}`
      : '',
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
    },
    offer: {
      packId: campaign.offer?.packId ?? '',
      bonusLabel: campaign.offer?.bonusLabel ?? '',
    },
    triggers: campaign.triggers.map((rule) => ({
      event: rule.event,
      minGap: rule.minGap,
      minDays: rule.minDays,
    })),
  };
}
