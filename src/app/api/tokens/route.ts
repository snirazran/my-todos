import { NextRequest, NextResponse } from 'next/server';
import { requireSessionAuth } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import ApiTokenModel from '@/lib/models/ApiToken';
import OAuthClientModel from '@/lib/models/OAuthClient';
import OAuthRevocationModel from '@/lib/models/OAuthRevocation';
import {
  DEFAULT_SCOPES,
  generatePat,
  normalizeScopes,
} from '@/lib/apiTokens';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NAME_MAX = 60;
const MAX_TOKENS = 10;

async function currentUserId() {
  try {
    const ctx = await requireSessionAuth();
    return ctx.uid;
  } catch {
    return null;
  }
}

function unauth() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/** CIMD client ids are URLs; fall back to the hostname when we have no name. */
function displayNameFor(clientId: string) {
  try {
    return new URL(clientId).host;
  } catch {
    return 'Connected app';
  }
}

export async function GET() {
  const uid = await currentUserId();
  if (!uid) return unauth();
  await connectMongo();

  const [tokens, grants] = await Promise.all([
    ApiTokenModel.find({
      userId: uid,
      kind: 'pat',
      revokedAt: { $exists: false },
    })
      .sort({ createdAt: -1 })
      .select('prefix name scopes createdAt lastUsedAt')
      .lean(),
    ApiTokenModel.find({
      userId: uid,
      kind: 'refresh',
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    })
      .sort({ createdAt: -1 })
      .select('clientId scopes createdAt lastUsedAt')
      .lean(),
  ]);

  // Refresh tokens rotate on every use, so one app can have several live rows.
  // Collapse them into a single connection per client.
  const byClient = new Map<string, (typeof grants)[number]>();
  for (const grant of grants) {
    if (!grant.clientId) continue;
    if (!byClient.has(grant.clientId)) byClient.set(grant.clientId, grant);
  }

  const clients = byClient.size
    ? await OAuthClientModel.find({ clientId: { $in: Array.from(byClient.keys()) } })
        .select('clientId clientName')
        .lean()
    : [];
  const nameById = new Map(clients.map((c) => [c.clientId, c.clientName]));

  return NextResponse.json({
    tokens: tokens.map((t) => ({
      id: String(t._id),
      prefix: t.prefix,
      name: t.name,
      scopes: t.scopes ?? [],
      createdAt: t.createdAt,
      lastUsedAt: t.lastUsedAt ?? null,
    })),
    connections: Array.from(byClient.entries()).map(([clientId, grant]) => ({
      clientId,
      name: nameById.get(clientId) || displayNameFor(clientId),
      scopes: grant.scopes ?? [],
      connectedAt: grant.createdAt,
      lastUsedAt: grant.lastUsedAt ?? null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();
  await connectMongo();

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const name =
    typeof body?.name === 'string' && body.name.trim()
      ? body.name.trim().slice(0, NAME_MAX)
      : 'AI assistant';
  const scopes = normalizeScopes(body?.scopes);

  const active = await ApiTokenModel.countDocuments({
    userId: uid,
    kind: 'pat',
    revokedAt: { $exists: false },
  });
  if (active >= MAX_TOKENS) {
    return NextResponse.json(
      { error: `You can have at most ${MAX_TOKENS} tokens` },
      { status: 400 },
    );
  }

  const { raw, hash, prefix } = generatePat();
  const doc = await ApiTokenModel.create({
    userId: uid,
    kind: 'pat',
    tokenHash: hash,
    prefix,
    name,
    scopes: scopes.length > 0 ? scopes : DEFAULT_SCOPES,
    createdAt: new Date(),
  });

  return NextResponse.json({
    id: String(doc._id),
    name: doc.name,
    scopes: doc.scopes,
    prefix: doc.prefix,
    token: raw,
  });
}

export async function DELETE(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();
  await connectMongo();

  const clientId = req.nextUrl.searchParams.get('clientId');
  if (clientId) {
    const now = new Date();
    await Promise.all([
      ApiTokenModel.updateMany(
        { userId: uid, kind: 'refresh', clientId, revokedAt: { $exists: false } },
        { $set: { revokedAt: now } },
      ),
      // Access tokens already issued are JWTs, so record the cut-off too.
      OAuthRevocationModel.updateOne(
        { userId: uid, clientId },
        { $set: { revokedAt: now } },
        { upsert: true },
      ),
    ]);
    return NextResponse.json({ ok: true });
  }

  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id or clientId is required' }, { status: 400 });
  }

  const result = await ApiTokenModel.updateOne(
    { _id: id, userId: uid, kind: 'pat' },
    { $set: { revokedAt: new Date() } },
  );
  if (result.matchedCount === 0) {
    return NextResponse.json({ error: 'Token not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
