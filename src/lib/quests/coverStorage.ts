import { getAdminStorage } from '@/lib/firebaseAdmin';
import { optimizeImage } from '@/lib/imageOptimize';
import type { QuestCoverImageFile } from '@/lib/models/QuestTemplate';

export type CoverType = 'template' | 'category';

const DATA_URL_RE = /^data:([^;,]+);base64,(.+)$/;

/** A freshly-uploaded base64 cover from the admin UI. */
export const isCoverDataUrl = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith('data:image/');

/** An existing cover that already lives in storage (sent back unchanged on edit). */
export const isCoverProxyUrl = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith('/api/quests/cover');

/** Stable URL the client uses to fetch a cover; bytes are served from Firebase. */
export function coverProxyUrl(type: CoverType, id: string): string {
  return `/api/quests/cover?type=${type}&id=${encodeURIComponent(id)}`;
}

function storagePathFor(type: CoverType, id: string): string {
  // No extension: stable path so re-uploads overwrite (never orphan a file).
  return `quest-covers/${type}/${id}`;
}

/**
 * Optimize a base64 data-URL cover to WebP and upload it to Firebase Storage.
 * Returns the proxy URL to store on the doc plus the file metadata, or null if
 * the value isn't a data URL.
 */
export async function uploadCoverFromDataUrl(
  type: CoverType,
  id: string,
  dataUrl: string,
): Promise<{ url: string; file: QuestCoverImageFile } | null> {
  const match = DATA_URL_RE.exec(dataUrl);
  if (!match) return null;

  const input = Buffer.from(match[2], 'base64');
  const { buffer, contentType } = await optimizeImage(
    input,
    match[1] || 'image/jpeg',
    { sizeKey: 'web' },
  );

  const storagePath = storagePathFor(type, id);
  await getAdminStorage()
    .file(storagePath)
    .save(buffer, {
      metadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' },
    });

  return {
    url: coverProxyUrl(type, id),
    file: {
      storagePath,
      contentType,
      size: buffer.byteLength,
      updatedAt: new Date(),
    },
  };
}

/** Best-effort delete of a stored cover file (used when a cover is removed). */
export async function deleteCoverFile(type: CoverType, id: string): Promise<void> {
  await getAdminStorage()
    .file(storagePathFor(type, id))
    .delete({ ignoreNotFound: true })
    .catch(() => {});
}
