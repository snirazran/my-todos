import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import connectMongo from '@/lib/mongoose';
import OAuthClientModel from '@/lib/models/OAuthClient';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const MAX_REDIRECT_URIS = 10;

/**
 * Dynamic Client Registration (RFC 7591). Deprecated in favour of Client ID
 * Metadata Documents, kept so 2025-era MCP clients can still connect.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json(
      { error: 'invalid_client_metadata' },
      { status: 400, headers: CORS },
    );
  }

  const redirectUris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris
        .filter((u: unknown) => typeof u === 'string')
        .slice(0, MAX_REDIRECT_URIS)
    : [];
  if (redirectUris.length === 0) {
    return NextResponse.json(
      {
        error: 'invalid_redirect_uri',
        error_description: 'At least one redirect_uri is required',
      },
      { status: 400, headers: CORS },
    );
  }

  await connectMongo();
  const clientId = `frgdcr_${randomUUID()}`;
  const now = new Date();

  await OAuthClientModel.create({
    clientId,
    clientName:
      typeof body.client_name === 'string'
        ? body.client_name.slice(0, 120)
        : 'MCP client',
    redirectUris,
    source: 'dcr',
    logoUri: typeof body.logo_uri === 'string' ? body.logo_uri : undefined,
    clientUri: typeof body.client_uri === 'string' ? body.client_uri : undefined,
    createdAt: now,
    refreshedAt: now,
  });

  return NextResponse.json(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(now.getTime() / 1000),
      redirect_uris: redirectUris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    },
    { status: 201, headers: { ...CORS, 'Cache-Control': 'no-store' } },
  );
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
