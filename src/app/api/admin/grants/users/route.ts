import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';

export const dynamic = 'force-dynamic';

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

type Row = {
  _id: unknown;
  name?: string;
  email?: string;
  friendCode?: string;
  isGuest?: boolean;
  createdAt?: Date;
  premiumUntil?: Date;
  wardrobe?: { flies?: number };
};

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const query = (req.nextUrl.searchParams.get('q') ?? '').trim();
    if (query.length < 2) {
      return NextResponse.json({ users: [] });
    }

    await connectMongo();
    const pattern = new RegExp(escapeRegex(query), 'i');
    const users = await UserModel.find({
      $or: [
        { _id: query },
        { name: pattern },
        { email: pattern },
        { friendCode: pattern },
      ],
    })
      .select('name email friendCode isGuest createdAt premiumUntil wardrobe.flies')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean<Row[]>();

    const now = Date.now();
    return NextResponse.json(
      {
        users: users.map((user) => ({
          id: String(user._id),
          name: user.name ?? 'Unnamed',
          email: user.email ?? null,
          friendCode: user.friendCode ?? null,
          isGuest: !!user.isGuest,
          createdAt: user.createdAt ?? null,
          premiumUntil: user.premiumUntil ?? null,
          isPremium: user.premiumUntil
            ? new Date(user.premiumUntil).getTime() > now
            : false,
          flies: user.wardrobe?.flies ?? 0,
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';
    return NextResponse.json(
      { error: message },
      { status: message.startsWith('Forbidden') ? 403 : 401 },
    );
  }
}
