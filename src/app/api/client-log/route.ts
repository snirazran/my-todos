import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';

const REPORT_TYPES = new Set([
  'error',
  'unhandledrejection',
  'resource_error',
  'boot_failed',
  'abnormal_end',
]);

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 16_384) return new NextResponse(null, { status: 204 });

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  if (typeof body.type !== 'string' || !REPORT_TYPES.has(body.type)) {
    return new NextResponse(null, { status: 204 });
  }

  let userId: string | undefined;
  try {
    userId = await requireUserId();
  } catch {}

  console.error('[client-log]', JSON.stringify({ userId, ...body }));
  return new NextResponse(null, { status: 204 });
}
