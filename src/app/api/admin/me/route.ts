import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { isAdminEmail } from '@/lib/adminAuth';

export async function GET() {
  try {
    const decoded = await requireAuth();
    return NextResponse.json({
      isAdmin: isAdminEmail(decoded.email),
      email: decoded.email ?? null,
    });
  } catch {
    return NextResponse.json({ isAdmin: false, email: null });
  }
}
