import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import CampaignModel from '@/lib/models/Campaign';
import CampaignUserStateModel from '@/lib/models/CampaignUserState';
import { getAdminStorage } from '@/lib/firebaseAdmin';
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_TEMPLATES,
  CAMPAIGN_TIERS,
  CAMPAIGN_TRIGGERS,
  CTA_ACTIONS,
  DEFAULT_CAPS,
  DEFAULT_TARGETING,
  PAYER_TARGETS,
  PLATFORM_TARGETS,
  PLUS_TARGETS,
  type CampaignStatus,
  type CampaignTemplate,
  type CampaignTier,
  type CampaignTrigger,
  type CtaAction,
} from '@/lib/campaigns/types';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48);

const num = (value: unknown): number | undefined => {
  if (value === '' || value == null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const str = (value: unknown, max = 240) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

const date = (value: unknown): Date | null => {
  if (typeof value !== 'string' || !value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Everything an admin can set, normalized. Nothing here is rendered as
 *  markup — copy is text and the action comes from a fixed list. */
function sanitize(body: Record<string, unknown>) {
  const copy = (body.copy ?? {}) as Record<string, unknown>;
  const cta = (body.cta ?? {}) as Record<string, unknown>;
  const offer = (body.offer ?? {}) as Record<string, unknown>;
  const targeting = (body.targeting ?? {}) as Record<string, unknown>;
  const caps = (body.caps ?? {}) as Record<string, unknown>;
  const triggers = Array.isArray(body.triggers) ? body.triggers : [];

  return {
    name: str(body.name, 80),
    template: oneOf<CampaignTemplate>(body.template, CAMPAIGN_TEMPLATES, 'announcement'),
    tier: oneOf<CampaignTier>(body.tier, CAMPAIGN_TIERS, 'nudge'),
    status: oneOf<CampaignStatus>(body.status, CAMPAIGN_STATUSES, 'draft'),
    priority: Math.min(100, Math.max(0, num(body.priority) ?? 50)),
    copy: {
      eyebrow: str(copy.eyebrow, 40),
      headline: str(copy.headline, 80),
      body: str(copy.body, 240),
      ctaLabel: str(copy.ctaLabel, 40) || 'Get it',
      dismissLabel: str(copy.dismissLabel, 40) || 'Not now',
    },
    cta: {
      action: oneOf<CtaAction>(cta.action, CTA_ACTIONS, 'dismiss'),
      path: str(cta.path, 200),
    },
    offer: {
      packId: str(offer.packId, 40),
      bonusLabel: str(offer.bonusLabel, 40),
    },
    triggers: triggers.flatMap((raw) => {
      const rule = (raw ?? {}) as Record<string, unknown>;
      if (!CAMPAIGN_TRIGGERS.includes(rule.event as CampaignTrigger)) return [];
      return [
        {
          event: rule.event as CampaignTrigger,
          minGap: num(rule.minGap),
          minDays: num(rule.minDays),
        },
      ];
    }),
    targeting: {
      payer: oneOf(targeting.payer, PAYER_TARGETS, DEFAULT_TARGETING.payer),
      plus: oneOf(targeting.plus, PLUS_TARGETS, DEFAULT_TARGETING.plus),
      platform: oneOf(targeting.platform, PLATFORM_TARGETS, DEFAULT_TARGETING.platform),
      minDaysSinceSignup: num(targeting.minDaysSinceSignup),
      maxDaysSinceSignup: num(targeting.maxDaysSinceSignup),
      balanceBelow: num(targeting.balanceBelow),
      balanceAbove: num(targeting.balanceAbove),
    },
    caps: {
      perUser: Math.max(0, num(caps.perUser) ?? DEFAULT_CAPS.perUser),
      cooldownHours: Math.max(0, num(caps.cooldownHours) ?? DEFAULT_CAPS.cooldownHours),
      suppressAfterDismissals: Math.max(
        0,
        num(caps.suppressAfterDismissals) ?? DEFAULT_CAPS.suppressAfterDismissals,
      ),
    },
    startAt: date(body.startAt),
    endAt: date(body.endAt),
  };
}

export async function GET() {
  try {
    await requireAdminUserId();
    await connectMongo();
    const items = await CampaignModel.find({}).sort({ createdAt: -1 }).lean();
    const stats = await CampaignUserStateModel.aggregate<{
      _id: string;
      impressions: number;
      clicks: number;
      dismissals: number;
      conversions: number;
      reach: number;
    }>([
      {
        $group: {
          _id: '$campaignId',
          impressions: { $sum: '$impressions' },
          clicks: { $sum: '$clicks' },
          dismissals: { $sum: '$dismissals' },
          conversions: { $sum: { $cond: ['$converted', 1, 0] } },
          reach: { $sum: 1 },
        },
      },
    ]);
    return json({
      items: items.map((item) => ({
        ...item,
        imageUrl: item.imageFile
          ? `/api/campaign-assets/${encodeURIComponent(item.id)}?v=${item.imageVersion}`
          : '',
      })),
      stats,
    });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminUserId();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const clean = sanitize(body);
    if (!clean.name) return json({ error: 'Name is required' }, 400);

    const base = slugify(clean.name) || 'campaign';
    await connectMongo();

    let id = base;
    for (let i = 2; await CampaignModel.exists({ id }); i += 1) id = `${base}_${i}`;

    const item = await CampaignModel.create({ id, ...clean, imageVersion: 0 });
    return json({ ok: true, item });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Create failed';
    return json({ error: message }, 500);
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireAdminUserId();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const id = str(body.id, 64);
    if (!id) return json({ error: 'Missing id' }, 400);

    await connectMongo();
    const clean = sanitize(body);
    if (!clean.name) return json({ error: 'Name is required' }, 400);

    const item = await CampaignModel.findOneAndUpdate({ id }, { $set: clean }, { new: true });
    if (!item) return json({ error: 'Campaign not found' }, 404);
    return json({ ok: true, item });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Update failed';
    return json({ error: message }, 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAdminUserId();
    const body = (await req.json().catch(() => ({}))) as { id?: string };
    const id = str(body.id, 64);
    if (!id) return json({ error: 'Missing id' }, 400);

    await connectMongo();
    const campaign = await CampaignModel.findOne({ id });
    if (!campaign) return json({ error: 'Campaign not found' }, 404);

    if (campaign.imageFile?.storagePath) {
      await getAdminStorage()
        .file(campaign.imageFile.storagePath)
        .delete({ ignoreNotFound: true })
        .catch(() => {});
    }
    await CampaignModel.deleteOne({ id });
    await CampaignUserStateModel.deleteMany({ campaignId: id });
    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Delete failed';
    return json({ error: message }, 500);
  }
}
