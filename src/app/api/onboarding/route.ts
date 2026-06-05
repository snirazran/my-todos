export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import UserModel from '@/lib/models/User';
import connectMongo from '@/lib/mongoose';

const VALID_AGE_RANGES = new Set(['under-18', '18-24', '25-34', '35-44', '45-54', '55-64', '65-plus']);
const VALID_ABOUT_GENDERS = new Set(['male', 'female', 'non-binary', 'prefer-not']);
const VALID_USED_BEFORE = new Set(['first-time', 'starting-fresh']);
const MAX_ONBOARDING_KEYS = 100;
const MAX_ONBOARDING_VALUES_PER_KEY = 20;
const MAX_ONBOARDING_VALUE_LENGTH = 80;

function sanitizeOnboardingResponses(value: unknown): Record<string, string[]> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const entries = Object.entries(value);
  const sanitized: Record<string, string[]> = {};

  for (const [rawKey, rawValues] of entries.slice(0, MAX_ONBOARDING_KEYS)) {
    const key = rawKey.trim().slice(0, 64);
    if (!key || !Array.isArray(rawValues)) continue;

    const values = rawValues
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim().slice(0, MAX_ONBOARDING_VALUE_LENGTH))
      .filter(Boolean)
      .slice(0, MAX_ONBOARDING_VALUES_PER_KEY);

    if (values.length > 0) {
      sanitized[key] = values;
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

export async function POST(req: Request) {
  let uid: string;
  try {
    uid = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    let body: {
      frogName?: unknown;
      humanName?: unknown;
      ageRange?: unknown;
      aboutGender?: unknown;
      usedBefore?: unknown;
      onboardingResponses?: unknown;
    } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const frogName =
      typeof body.frogName === 'string' && body.frogName.trim()
        ? body.frogName.trim().slice(0, 24)
        : 'Cookie';
    const humanName =
      typeof body.humanName === 'string' && body.humanName.trim()
        ? body.humanName.trim().slice(0, 40)
        : undefined;
    const ageRange =
      typeof body.ageRange === 'string' && VALID_AGE_RANGES.has(body.ageRange)
        ? body.ageRange
        : undefined;
    const aboutGender =
      typeof body.aboutGender === 'string' && VALID_ABOUT_GENDERS.has(body.aboutGender)
        ? body.aboutGender
        : undefined;
    const usedBefore =
      typeof body.usedBefore === 'string' && VALID_USED_BEFORE.has(body.usedBefore)
        ? body.usedBefore
        : undefined;
    const onboardingResponses = sanitizeOnboardingResponses(body.onboardingResponses);

    await connectMongo();
    await UserModel.updateOne(
      { _id: uid },
      {
        $set: {
          onboardingCompleted: true,
          frogName,
          ...(humanName ? { name: humanName } : {}),
          ...(ageRange ? { ageRange } : {}),
          ...(aboutGender ? { aboutGender } : {}),
          ...(usedBefore ? { usedBefore } : {}),
          ...(onboardingResponses ? { onboardingResponses } : {}),
        },
      },
    );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to save onboarding' }, { status: 500 });
  }
}
