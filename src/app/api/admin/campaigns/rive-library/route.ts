import { NextResponse } from 'next/server';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { requireAdminUserId } from '@/lib/adminAuth';

/** The .riv files already shipping in public/, so a campaign can reuse the
 *  frog or the fly instead of uploading a copy of it. */
export async function GET() {
  try {
    await requireAdminUserId();
    const dir = path.join(process.cwd(), 'public');
    const entries = await readdir(dir, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.riv'))
      .map((entry) => `/${entry.name}`)
      .sort();
    return NextResponse.json({ files });
  } catch {
    return NextResponse.json({ files: [] }, { status: 200 });
  }
}
