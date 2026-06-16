// `crypto.randomUUID` only exists in a secure context (HTTPS or localhost).
// When the Capacitor app loads from the LAN dev server over plain HTTP
// (CAP_DEV mode), the context is non-secure and `crypto.randomUUID` is
// undefined, which crashed anything that called it. This wrapper prefers the
// native UUID, falls back to `crypto.getRandomValues` (a real v4 UUID), and
// finally to a timestamp+random id if Web Crypto is missing entirely.
export function randomUUID(): string {
  const c = typeof crypto !== 'undefined' ? crypto : undefined;

  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }

  if (c && typeof c.getRandomValues === 'function') {
    const bytes = c.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex
      .slice(6, 8)
      .join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
  }

  return `id_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
