import { NextResponse } from 'next/server';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { requireAdminUserId } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

/** Old copies kept for rollback, not art anyone should place in a popup. */
const SKIP_DIRS = new Set(['rive-backups', 'node_modules', '.next']);
const MAX_DEPTH = 3;

export type RiveLibraryFile = {
  /** Same-origin path the runtime loads, e.g. `/frog_idle.riv`. */
  path: string;
  name: string;
  sizeKb: number;
};

/**
 * The .riv files already shipping in public/, so a campaign can reuse the
 * frog, the fly or the gift box instead of uploading a second copy that then
 * drifts from the one the app animates.
 */
export async function GET() {
  try {
    await requireAdminUserId();
    const root = path.join(process.cwd(), 'public');
    const files: RiveLibraryFile[] = [];

    const walk = async (dir: string, depth: number) => {
      if (depth > MAX_DEPTH) return;
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
          await walk(full, depth + 1);
          continue;
        }
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.riv')) continue;
        const info = await stat(full).catch(() => null);
        files.push({
          path: `/${path.relative(root, full).split(path.sep).join('/')}`,
          name: entry.name,
          sizeKb: info ? Math.round(info.size / 1024) : 0,
        });
      }
    };

    await walk(root, 0);
    files.sort((a, b) => a.path.localeCompare(b.path));

    return NextResponse.json({ files });
  } catch {
    return NextResponse.json({ files: [] }, { status: 200 });
  }
}
