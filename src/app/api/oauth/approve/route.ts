import { NextRequest, NextResponse } from 'next/server';
import { requireSessionAuth } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import OAuthCodeModel from '@/lib/models/OAuthCode';
import { generateOpaqueToken } from '@/lib/apiTokens';
import {
  AUTH_CODE_TTL_MS,
  buildRedirect,
  validateAuthorizeRequest,
} from '@/lib/oauth/authorize';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    const ctx = await requireSessionAuth();
    userId = ctx.uid;
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const form = await req.formData();
  const raw: Record<string, string | undefined> = {};
  form.forEach((value, key) => {
    if (typeof value === 'string') raw[key] = value;
  });

  // Re-validate rather than trusting the posted form: the browser controls it.
  const validation = await validateAuthorizeRequest(raw);
  if (!validation.ok) {
    if (validation.fatal) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    return NextResponse.redirect(
      buildRedirect(validation.redirectUri, {
        error: validation.error,
        state: validation.state,
      }),
      { status: 303 },
    );
  }

  const { params } = validation;

  if (raw.decision !== 'allow') {
    return NextResponse.redirect(
      buildRedirect(params.redirectUri, {
        error: 'access_denied',
        state: params.state,
      }),
      { status: 303 },
    );
  }

  await connectMongo();
  const { raw: code, hash } = generateOpaqueToken('frgc_');
  await OAuthCodeModel.create({
    codeHash: hash,
    userId,
    clientId: params.clientId,
    redirectUri: params.redirectUri,
    codeChallenge: params.codeChallenge,
    scopes: params.scopes,
    resource: params.resource,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
  });

  return NextResponse.redirect(
    buildRedirect(params.redirectUri, { code, state: params.state }),
    { status: 303 },
  );
}
