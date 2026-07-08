import { v4 as uuid } from 'uuid';
import CalendarConnectionModel, {
  type CalendarConnectionDoc,
} from '@/lib/models/CalendarConnection';
import { hmacSign } from '../crypto';
import { GoogleAuthError, stopChannel, watchEvents } from './client';

const RENEW_BEFORE_MS = 48 * 60 * 60 * 1000;

/** Create (or renew when close to expiry) the push channel for a connection. */
export async function ensureChannel(conn: CalendarConnectionDoc): Promise<void> {
  if (!process.env.APP_BASE_URL?.startsWith('https://')) return;

  const expiresSoon =
    !conn.channelExpiration ||
    conn.channelExpiration.getTime() < Date.now() + RENEW_BEFORE_MS;
  if (conn.channelId && !expiresSoon) return;

  if (conn.channelId && conn.resourceId) {
    await stopChannel(conn, conn.channelId, conn.resourceId);
  }

  const channelId = uuid();
  const token = hmacSign(String(conn._id));
  try {
    const res = await watchEvents(conn, { id: channelId, token });
    await CalendarConnectionModel.updateOne(
      { _id: conn._id },
      {
        $set: {
          channelId,
          channelToken: token,
          resourceId: res.resourceId,
          channelExpiration: res.expiration
            ? new Date(Number(res.expiration))
            : new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
        },
      },
    );
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      await CalendarConnectionModel.updateOne(
        { _id: conn._id },
        { $set: { status: 'reauth_required', errorMessage: err.message } },
      );
      return;
    }
    console.error('calendar watch failed:', (err as Error)?.message);
  }
}
