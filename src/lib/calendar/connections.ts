import connectMongo from '@/lib/mongoose';
import CalendarConnectionModel, {
  type CalendarConnectionDoc,
} from '@/lib/models/CalendarConnection';

type ConnCache = { value: boolean; expires: number };

const globalStore = globalThis as unknown as {
  calendarConnCache?: Map<string, ConnCache>;
};

function cache() {
  if (!globalStore.calendarConnCache) globalStore.calendarConnCache = new Map();
  return globalStore.calendarConnCache;
}

const CACHE_TTL_MS = 60_000;

/** Cheap gate used on every task write — cached so the hot path stays free. */
export async function userHasCalendarConnections(userId: string): Promise<boolean> {
  const entry = cache().get(userId);
  if (entry && entry.expires > Date.now()) return entry.value;
  await connectMongo();
  const exists = await CalendarConnectionModel.exists({
    userId,
    status: { $ne: 'reauth_required' },
    'settings.exportEnabled': true,
  });
  cache().set(userId, { value: !!exists, expires: Date.now() + CACHE_TTL_MS });
  return !!exists;
}

export function invalidateConnectionCache(userId: string) {
  cache().delete(userId);
}

export async function getActiveConnections(userId: string) {
  await connectMongo();
  return CalendarConnectionModel.find({
    userId,
    status: { $ne: 'reauth_required' },
  }).exec();
}

export async function markConnectionError(
  connectionId: CalendarConnectionDoc['_id'],
  status: 'error' | 'reauth_required',
  message: string,
) {
  await connectMongo();
  await CalendarConnectionModel.updateOne(
    { _id: connectionId },
    { $set: { status, errorMessage: message } },
  );
}
