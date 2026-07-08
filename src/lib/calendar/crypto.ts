import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'crypto';

function getKey(): Buffer {
  const raw = process.env.CALENDAR_CRED_KEY;
  if (!raw) throw new Error('CALENDAR_CRED_KEY is not set');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('CALENDAR_CRED_KEY must be 32 bytes base64');
  return key;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decryptSecret(payload: string): string {
  const [iv, tag, data] = payload.split(':').map((p) => Buffer.from(p, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function hmacSign(value: string): string {
  return createHmac('sha256', getKey()).update(value).digest('base64url');
}

export function hmacVerify(value: string, signature: string): boolean {
  const expected = Buffer.from(hmacSign(value));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function signStateToken(payload: Record<string, unknown>, ttlMs: number): string {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Date.now() + ttlMs }),
  ).toString('base64url');
  return `${body}.${hmacSign(body)}`;
}

export function verifyStateToken<T = Record<string, unknown>>(token: string): T | null {
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!hmacVerify(body, sig)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (typeof parsed.exp !== 'number' || parsed.exp < Date.now()) return null;
    return parsed as T;
  } catch {
    return null;
  }
}
