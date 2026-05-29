import sharp from 'sharp';

// Max width per logical size key. Aspect ratio is preserved; images are never
// upscaled. Tuned for the header-strip backgrounds + quest art these serve.
const MAX_WIDTH: Record<string, number> = {
  mobile: 768,
  tablet: 1200,
  web: 1600,
  webLarge: 2560,
};

function extFromContentType(contentType: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
  };
  return map[contentType] ?? 'bin';
}

export type OptimizeOptions = {
  /** Logical size key (mobile/tablet/web/webLarge) to pick a sensible max width. */
  sizeKey?: string;
  /** Explicit max width override. */
  maxWidth?: number;
  /** WebP quality (default 80). */
  quality?: number;
};

/**
 * Re-encode an uploaded image to a sensibly-sized WebP. Animated GIFs/WebPs keep
 * their animation. Falls back to the original bytes if encoding fails or doesn't
 * shrink the file, so uploads never hard-fail or get bigger.
 */
export async function optimizeImage(
  input: Buffer,
  fallbackContentType: string,
  opts: OptimizeOptions = {},
): Promise<{ buffer: Buffer; contentType: string; ext: string }> {
  const maxWidth =
    opts.maxWidth ?? (opts.sizeKey ? MAX_WIDTH[opts.sizeKey] : undefined) ?? 1600;

  try {
    const buffer = await sharp(input, { animated: true })
      .rotate() // honour EXIF orientation
      .resize({ width: maxWidth, withoutEnlargement: true })
      .webp({ quality: opts.quality ?? 80, effort: 4 })
      .toBuffer();

    if (buffer.byteLength < input.byteLength) {
      return { buffer, contentType: 'image/webp', ext: 'webp' };
    }
  } catch {
    // SVG or an unexpected format — keep the original below.
  }

  return {
    buffer: input,
    contentType: fallbackContentType,
    ext: extFromContentType(fallbackContentType),
  };
}
