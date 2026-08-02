import { NextRequest, NextResponse } from 'next/server';
import { requireSessionAuth } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import ApiTokenModel from '@/lib/models/ApiToken';
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

export async function GET() {
  const uid = await currentUserId();
  if (!uid) return unauth();
  await connectMongo();

  const tokens = await ApiTokenModel.find({
    userId: uid,
    kind: 'pat',
    revokedAt: { $exists: false },
  })
    .sort({ createdAt: -1 })
    .select('prefix name scopes createdAt lastUsedAt')
    .lean();

  return NextResponse.json({
    tokens: tokens.map((t) => ({
      id: String(t._id),
      prefix: t.prefix,
      name: t.name,
      scopes: t.scopes ?? [],
      createdAt: t.createdAt,
      lastUsedAt: t.lastUsedAt ?? null,
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

  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
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
