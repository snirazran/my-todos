import { NextRequest, NextResponse } from 'next/server';
import connectMongo from '@/lib/mongoose';
import OAuthCodeModel from '@/lib/models/OAuthCode';
import ApiTokenModel from '@/lib/models/ApiToken';
import { generateOpaqueToken, hashToken } from '@/lib/apiTokens';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  mcpResourceUrl,
  oauthConfigured,
  signAccessJwt,
} from '@/lib/oauth/keys';
import { verifyPkceS256 } from '@/lib/oauth/authorize';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function oauthError(error: string, description?: string, status = 400) {
  return NextResponse.json(
    { error, ...(description ? { error_description: description } : {}) },
    { status, headers: { ...CORS, 'Cache-Control': 'no-store' } },
  );
}

async function issueTokens(args: {
  userId: string;
  clientId: string;
  scopes: string[];
  resource: string;
}) {
  const accessToken = await signAccessJwt({
    userId: args.userId,
    scopes: args.scopes,
    clientId: args.clientId,
    resource: args.resource,
  });

  const { raw: refreshToken, hash, prefix } = generateOpaqueToken('frgr_');
  await ApiTokenModel.create({
    userId: args.userId,
    kind: 'refresh',
    tokenHash: hash,
    prefix,
    name: args.clientId,
    scopes: args.scopes,
    clientId: args.clientId,
    resource: args.resource,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });

  return NextResponse.json(
    {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
      scope: args.scopes.join(' '),
    },
    { headers: { ...CORS, 'Cache-Control': 'no-store' } },
  );
}

export async function POST(req: NextRequest) {
  if (!oauthConfigured()) {
    return oauthError('server_error', 'OAuth signing keys are not configured', 500);
  }

  const form = await req.formData().catch(() => null);
  if (!form) return oauthError('invalid_request', 'Expected form encoding');

  const get = (key: string) => {
    const value = form.get(key);
    return typeof value === 'string' ? value.trim() : undefined;
  };

  const grantType = get('grant_type');
  const clientId = get('client_id');
  if (!clientId) return oauthError('invalid_client', 'client_id is required');

  await connectMongo();

  if (grantType === 'authorization_code') {
    const code = get('code');
    const verifier = get('code_verifier');
    const redirectUri = get('redirect_uri');
    if (!code || !verifier || !redirectUri) {
      return oauthError('invalid_request', 'Missing code, verifier or redirect_uri');
    }

    const hash = hashToken(code);
    // Single-use: claim the code atomically so a replay loses the race.
    const doc = await OAuthCodeModel.findOneAndUpdate(
      { codeHash: hash, usedAt: { $exists: false } },
      { $set: { usedAt: new Date() } },
    ).lean();

    if (!doc) return oauthError('invalid_grant', 'Code is invalid or already used');
    if (doc.expiresAt.getTime() < Date.now()) {
      return oauthError('invalid_grant', 'Code expired');
    }
    if (doc.clientId !== clientId) {
      return oauthError('invalid_grant', 'Code was issued to another client');
    }
    if (doc.redirectUri !== redirectUri) {
      return oauthError('invalid_grant', 'redirect_uri mismatch');
    }
    if (!verifyPkceS256(verifier, doc.codeChallenge)) {
      return oauthError('invalid_grant', 'PKCE verification failed');
    }

    const requestedResource = get('resource');
    if (requestedResource && requestedResource !== doc.resource) {
      return oauthError('invalid_target', 'resource mismatch');
    }

    return issueTokens({
      userId: doc.userId,
      clientId: doc.clientId,
      scopes: doc.scopes,
      resource: doc.resource,
    });
  }

  if (grantType === 'refresh_token') {
    const refresh = get('refresh_token');
    if (!refresh) return oauthError('invalid_request', 'refresh_token is required');

    const hash = hashToken(refresh);
    // Rotate: the presented token is consumed whether or not issuing succeeds.
    const doc = await ApiTokenModel.findOneAndUpdate(
      { tokenHash: hash, kind: 'refresh', revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date(), lastUsedAt: new Date() } },
    ).lean();

    if (!doc) return oauthError('invalid_grant', 'Refresh token is invalid or used');
    if (doc.expiresAt && doc.expiresAt.getTime() < Date.now()) {
      return oauthError('invalid_grant', 'Refresh token expired');
    }
    if (doc.clientId !== clientId) {
      return oauthError('invalid_grant', 'Refresh token belongs to another client');
    }

    return issueTokens({
      userId: doc.userId,
      clientId: doc.clientId,
      scopes: doc.scopes ?? [],
      resource: doc.resource ?? mcpResourceUrl(),
    });
  }

  return oauthError('unsupported_grant_type');
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
