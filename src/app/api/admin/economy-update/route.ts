import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId } from '@/lib/adminAuth';
import {
  applyEconomyUpdate,
  previewEconomyUpdate,
  readEconomyUpdateInput,
  readEconomyUpdateState,
  undoLastEconomyUpdate,
} from '@/lib/economy/economyUpdate';

export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });

export async function GET() {
  try {
    await requireAdminUserId();
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
  try {
    return json(await readEconomyUpdateState());
  } catch (error) {
    console.error('[economy-update] read failed:', error);
    return json({ error: 'Could not read the current economy settings' }, 500);
  }
}

export async function POST(req: NextRequest) {
  let adminId: string;
  try {
    adminId = await requireAdminUserId();
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body: { action?: unknown; input?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  try {
    if (body.action === 'undo') return json(await undoLastEconomyUpdate());
    const input = readEconomyUpdateInput(body.input);
    if (body.action === 'preview') return json({ changes: await previewEconomyUpdate(input) });
    if (body.action === 'apply') return json(await applyEconomyUpdate(input, adminId));
    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    console.error('[economy-update] failed:', error);
    return json(
      { error: error instanceof Error ? error.message : 'Economy update failed' },
      400,
    );
  }
}
