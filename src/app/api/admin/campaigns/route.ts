import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import CampaignModel, { type CampaignAssetFile } from '@/lib/models/Campaign';
import CampaignUserStateModel from '@/lib/models/CampaignUserState';
import { getAdminStorage } from '@/lib/firebaseAdmin';
import {
  CAMPAIGN_ART_KINDS,
  CAMPAIGN_STATUSES,
  CAMPAIGN_TEMPLATES,
  CAMPAIGN_TIERS,
  CAMPAIGN_TRIGGERS,
  CTA_ACTIONS,
  DEFAULT_CAPS,
  DEFAULT_RIVE,
  DEFAULT_TARGETING,
  PAYER_TARGETS,
  PLATFORM_TARGETS,
  PLUS_TARGETS,
  RIVE_LAYOUTS,
  RIVE_SIGNAL_SOURCES,
  SIGNAL_ACTIONS,
  type CampaignArtKind,
  type CampaignStatus,
  type CampaignTemplate,
  type CampaignTier,
  type CampaignTrigger,
  type CtaAction,
  type RiveLayout,
  type RiveSignalSource,
  type SignalAction,
} from '@/lib/campaigns/types';
import { campaignAssetUrl } from '@/lib/campaigns/eligibility';
import {
  rivePath,
  sanitizeCanvas,
  sanitizeReward,
  sanitizeRiveInputs,
  sanitizeRiveTickers,
} from '@/lib/campaigns/sanitizeCanvas';
import { blocksGoingLive, reviewCampaign } from '@/lib/campaigns/review';

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
  const rive = (body.rive ?? {}) as Record<string, unknown>;
  const riveButtons = Array.isArray(rive.buttons) ? rive.buttons : [];
  const canvas = (body.canvas ?? {}) as Record<string, unknown>;

  return {
    name: str(body.name, 80),
    template: oneOf<CampaignTemplate>(body.template, CAMPAIGN_TEMPLATES, 'canvas'),
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
      productId: str(cta.productId, 120),
      reward: sanitizeReward(cta.reward),
    },
    offer: {
      packId: str(offer.packId, 40),
      productId: str(offer.productId, 120),
      bonusLabel: str(offer.bonusLabel, 40),
    },
    art: oneOf<CampaignArtKind>(body.art, CAMPAIGN_ART_KINDS, 'image'),
    canvas: sanitizeCanvas(canvas),
    rive: {
      libraryPath: rivePath(rive.libraryPath),
      artboard: str(rive.artboard, 80),
      stateMachine: str(rive.stateMachine, 80),
      layout: oneOf<RiveLayout>(rive.layout, RIVE_LAYOUTS, 'inline'),
      fit: oneOf(rive.fit, ['contain', 'cover'] as const, 'contain'),
      aspect: Math.min(3, Math.max(0.3, num(rive.aspect) ?? DEFAULT_RIVE.aspect)),
      inputs: sanitizeRiveInputs(rive.inputs),
      tickers: sanitizeRiveTickers(rive.tickers),
      buttons: riveButtons.flatMap((raw) => {
        const button = (raw ?? {}) as Record<string, unknown>;
        const signal = str(button.signal, 80);
        if (!signal) return [];
        return [
          {
            signal,
            source: oneOf<RiveSignalSource>(button.source, RIVE_SIGNAL_SOURCES, 'event'),
            action: oneOf<SignalAction>(button.action, SIGNAL_ACTIONS, 'cta'),
            path: str(button.path, 200),
            packId: str(button.packId, 40),
            productId: str(button.productId, 120),
            closes: button.closes !== false,
          },
        ];
      }),
    },
    triggers: triggers.flatMap((raw) => {
      const rule = (raw ?? {}) as Record<string, unknown>;
      if (!CAMPAIGN_TRIGGERS.includes(rule.event as CampaignTrigger)) return [];
      return [
        {
          event: rule.event as CampaignTrigger,
          minGap: num(rule.minGap),
          minDays: num(rule.minDays),
          minMinutes: num(rule.minMinutes),
          minStreak: num(rule.minStreak),
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
      rollout: Math.min(100, Math.max(0, num(targeting.rollout) ?? DEFAULT_TARGETING.rollout)),
    },
    caps: {
      perUser: Math.max(0, num(caps.perUser) ?? DEFAULT_CAPS.perUser),
      perDay: Math.max(0, num(caps.perDay) ?? DEFAULT_CAPS.perDay),
      cooldownHours: Math.max(0, num(caps.cooldownHours) ?? DEFAULT_CAPS.cooldownHours),
      suppressAfterDismissals: Math.max(
        0,
        num(caps.suppressAfterDismissals) ?? DEFAULT_CAPS.suppressAfterDismissals,
      ),
      delayMs: Math.min(20000, Math.max(0, num(caps.delayMs) ?? DEFAULT_CAPS.delayMs)),
    },
    startAt: date(body.startAt),
    endAt: date(body.endAt),
  };
}

/**
 * A campaign only reaches users through `live`, so that is the one transition
 * worth guarding. Drafts are allowed to be broken — that is what a draft is —
 * but a popup that can't render or a button that does nothing must not be
 * publishable, because nothing downstream will catch it.
 */
function liveBlockers(
  clean: ReturnType<typeof sanitize>,
  existing: { imageFile?: unknown } | null,
): string[] {
  if (clean.status !== 'live') return [];
  const notes = reviewCampaign({
    name: clean.name,
    template: clean.template,
    status: clean.status,
    imageUrl: existing?.imageFile ? 'stored' : '',
    copy: clean.copy,
    cta: clean.cta,
    offer: clean.offer,
    rive: clean.rive,
    canvas: clean.canvas,
    assets: [],
    triggers: clean.triggers,
    targeting: clean.targeting,
    caps: clean.caps,
    startAt: clean.startAt ? clean.startAt.toISOString() : null,
    endAt: clean.endAt ? clean.endAt.toISOString() : null,
  });
  return blocksGoingLive(notes)
    ? notes.filter((note) => note.level === 'error').map((note) => note.message)
    : [];
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
    // Dynamic keys can't be summed with a plain $group, so the per-element
    // clicks are flattened into rows first.
    const elementStats = await CampaignUserStateModel.aggregate<{
      _id: { campaignId: string; elementId: string };
      clicks: number;
    }>([
      { $match: { elementClicks: { $exists: true, $ne: {} } } },
      { $project: { campaignId: 1, kv: { $objectToArray: '$elementClicks' } } },
      { $unwind: '$kv' },
      {
        $group: {
          _id: { campaignId: '$campaignId', elementId: '$kv.k' },
          clicks: { $sum: '$kv.v' },
        },
      },
    ]);

    return json({
      items: items.map((item) => ({
        ...item,
        imageUrl: campaignAssetUrl(item, 'image'),
        riveUrl: item.rive?.libraryPath || campaignAssetUrl(item, 'rive'),
        riveUploadUrl: campaignAssetUrl(item, 'rive'),
      })),
      stats,
      elementStats: elementStats.map((row) => ({
        campaignId: row._id.campaignId,
        elementId: row._id.elementId,
        clicks: row.clicks,
      })),
    });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}

const uniqueId = async (base: string) => {
  let id = base || 'campaign';
  for (let i = 2; await CampaignModel.exists({ id }); i += 1) id = `${base}_${i}`;
  return id;
};

export async function POST(req: NextRequest) {
  try {
    await requireAdminUserId();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    await connectMongo();

    const cloneOf = str(body.cloneOf, 64);
    if (cloneOf) {
      const source = await CampaignModel.findOne({ id: cloneOf }).lean();
      if (!source) return json({ error: 'Campaign not found' }, 404);

      const name = `${source.name} copy`.slice(0, 80);
      const id = await uniqueId(slugify(name));
      const bucket = getAdminStorage();

      const copyAsset = async (file?: CampaignAssetFile | null, ext = 'webp') => {
        if (!file?.storagePath) return null;
        const destPath = `campaigns/${id}/art.${ext}`;
        try {
          await bucket.file(file.storagePath).copy(bucket.file(destPath));
          return { ...file, storagePath: destPath, updatedAt: new Date() };
        } catch {
          return null;
        }
      };

      const [imageFile, riveFile] = await Promise.all([
        copyAsset(source.imageFile, source.imageFile?.storagePath.split('.').pop() || 'webp'),
        copyAsset(source.riveFile, 'riv'),
      ]);

      const {
        _id: _ignoredId,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        ...rest
      } = source as typeof source & { _id: unknown };

      const item = await CampaignModel.create({
        ...rest,
        id,
        name,
        // A clone always starts dark: shipping a duplicate live by accident is
        // the one mistake a duplicate button can make.
        status: 'draft',
        imageFile,
        riveFile,
        imageVersion: imageFile ? 1 : 0,
        riveVersion: riveFile ? 1 : 0,
      });
      return json({ ok: true, item });
    }

    const clean = sanitize(body);
    if (!clean.name) return json({ error: 'Name is required' }, 400);

    const blockers = liveBlockers(clean, null);
    if (blockers.length) {
      return json({ error: `Can't go live yet: ${blockers[0]}`, blockers }, 400);
    }

    const id = await uniqueId(slugify(clean.name));
    const item = await CampaignModel.create({ id, ...clean, imageVersion: 0, riveVersion: 0 });
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

    const existing = await CampaignModel.findOne({ id }).select('imageFile').lean();
    if (!existing) return json({ error: 'Campaign not found' }, 404);

    const blockers = liveBlockers(clean, existing);
    if (blockers.length) {
      return json(
        { error: `Can't go live yet: ${blockers[0]}`, blockers },
        400,
      );
    }

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

    const bucket = getAdminStorage();
    for (const file of [campaign.imageFile, campaign.riveFile]) {
      if (!file?.storagePath) continue;
      await bucket.file(file.storagePath).delete({ ignoreNotFound: true }).catch(() => {});
    }
    await CampaignModel.deleteOne({ id });
    await CampaignUserStateModel.deleteMany({ campaignId: id });
    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Delete failed';
    return json({ error: message }, 500);
  }
}
