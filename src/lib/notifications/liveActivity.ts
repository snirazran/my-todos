import crypto from 'crypto';
import http2 from 'http2';
import type { LiveActivityData } from '@/lib/liveActivityData';

const KEY_ID = process.env.APNS_KEY_ID;
const TEAM_ID = process.env.APNS_TEAM_ID;
const BUNDLE_ID = process.env.APNS_BUNDLE_ID || 'io.frog.tasks';
const PRODUCTION = process.env.APNS_PRODUCTION !== 'false';

function getPrivateKey(): string | null {
  const raw = process.env.APNS_PRIVATE_KEY;
  if (!raw) return null;
  let key = raw.trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }
  key = key.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
  if (!key.includes('\n')) {
    const match = key.match(/^(-----BEGIN [^-]+-----)(.+)(-----END [^-]+-----)$/);
    if (match) {
      key = `${match[1]}\n${match[2].match(/.{1,64}/g)?.join('\n') ?? match[2]}\n${match[3]}`;
    }
  }
  return key;
}

export function isLiveActivityPushConfigured(): boolean {
  return Boolean(KEY_ID && TEAM_ID && getPrivateKey());
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

let cachedToken: { value: string; iat: number } | null = null;

function providerToken(): string | null {
  const privateKey = getPrivateKey();
  if (!KEY_ID || !TEAM_ID || !privateKey) return null;

  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now - cachedToken.iat < 3000) return cachedToken.value;

  const header = b64url(JSON.stringify({ alg: 'ES256', kid: KEY_ID }));
  const payload = b64url(JSON.stringify({ iss: TEAM_ID, iat: now }));
  const signingInput = `${header}.${payload}`;
  const signature = crypto.sign('sha256', Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  const token = `${signingInput}.${b64url(signature)}`;
  cachedToken = { value: token, iat: now };
  return token;
}

function postToApns(
  deviceToken: string,
  payload: unknown,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const token = providerToken();
    if (!token) {
      reject(new Error('APNs not configured'));
      return;
    }

    const host = PRODUCTION
      ? 'https://api.push.apple.com'
      : 'https://api.sandbox.push.apple.com';
    const client = http2.connect(host);
    client.on('error', reject);

    const body = JSON.stringify(payload);
    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${deviceToken}`,
      authorization: `bearer ${token}`,
      'apns-topic': `${BUNDLE_ID}.push-type.liveactivity`,
      'apns-push-type': 'liveactivity',
      'apns-priority': '10',
      'content-type': 'application/json',
    });

    let status = 0;
    let data = '';
    req.on('response', (headers) => {
      status = Number(headers[':status'] ?? 0);
    });
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      client.close();
      resolve({ status, body: data });
    });
    req.on('error', (err) => {
      client.close();
      reject(err);
    });

    req.write(body);
    req.end();
  });
}

type PushResult = { ok: boolean; status: number; gone: boolean };

async function send(payload: unknown, pushToken: string): Promise<PushResult> {
  if (!isLiveActivityPushConfigured()) return { ok: false, status: 0, gone: false };
  try {
    const { status, body } = await postToApns(pushToken, payload);
    if (status !== 200) {
      console.error('APNs Live Activity push failed:', status, body);
    }
    return { ok: status === 200, status, gone: status === 410 };
  } catch (err) {
    console.error('APNs Live Activity push error:', err);
    return { ok: false, status: 0, gone: false };
  }
}

export async function sendLiveActivityUpdate(opts: {
  pushToken: string;
  activityId: string;
  data: LiveActivityData;
  staleDate?: number | null;
}): Promise<PushResult> {
  const aps: Record<string, unknown> = {
    timestamp: Math.floor(Date.now() / 1000),
    event: 'update',
    'content-state': { data: opts.data, activityId: opts.activityId },
  };
  if (opts.staleDate) aps['stale-date'] = Math.floor(opts.staleDate / 1000);
  return send({ aps }, opts.pushToken);
}

export async function sendLiveActivityEnd(opts: {
  pushToken: string;
  activityId: string;
  data: LiveActivityData;
}): Promise<PushResult> {
  const aps: Record<string, unknown> = {
    timestamp: Math.floor(Date.now() / 1000),
    event: 'end',
    'content-state': { data: opts.data, activityId: opts.activityId },
    'dismissal-date': Math.floor(Date.now() / 1000),
  };
  return send({ aps }, opts.pushToken);
}
