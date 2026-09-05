import type { NextRequest } from 'next/server';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import type { AdIdentity } from '@/lib/types/UserDoc';

function clientIp(req: NextRequest): string | undefined {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || undefined;
  return req.headers.get('x-real-ip') ?? undefined;
}

export function readAdIdentity(
  req: NextRequest,
  extra?: { ttclid?: unknown; consent?: unknown },
): Partial<AdIdentity> {
  const identity: Partial<AdIdentity> = {};
  const fbp = req.cookies.get('_fbp')?.value;
  const fbc = req.cookies.get('_fbc')?.value;
  const ttp = req.cookies.get('_ttp')?.value;
  if (fbp) identity.fbp = fbp;
  if (fbc) identity.fbc = fbc;
  if (ttp) identity.ttp = ttp;
  if (typeof extra?.ttclid === 'string' && extra.ttclid) {
    identity.ttclid = extra.ttclid.slice(0, 200);
  }
  if (extra?.consent === 'granted' || extra?.consent === 'denied') {
    identity.consent = extra.consent;
  }
  const ip = clientIp(req);
  if (ip) identity.ip = ip;
  const userAgent = req.headers.get('user-agent');
  if (userAgent) identity.userAgent = userAgent.slice(0, 400);
  return identity;
}

export async function saveAdIdentity(
  userId: string,
  identity: Partial<AdIdentity>,
) {
  const entries = Object.entries(identity).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;
  try {
    await connectMongo();
    const update: Record<string, unknown> = { 'adIdentity.updatedAt': new Date() };
    for (const [key, value] of entries) update[`adIdentity.${key}`] = value;
    await UserModel.updateOne({ _id: userId }, { $set: update });
  } catch (error) {
    console.error('Ad identity save failed:', error);
  }
}
