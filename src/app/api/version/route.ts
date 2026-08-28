export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { BUILD_ID } from '@/lib/generated/buildId';

export async function GET() {
  return NextResponse.json(
    { buildId: BUILD_ID },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } },
  );
}
