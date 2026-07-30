import connectMongo from '@/lib/mongoose';
import ServerHeartbeatModel from '@/lib/models/ServerHeartbeat';

// The timer processor's liveness record. The ticker stamps it every tick, so on
// the next boot the gap between the last stamp and now is exactly how long this
// process was not running — a deploy, a crash, a container swap.
//
// Why it matters: a timer that ended while nobody was listening looks identical
// to a timer that ended half an hour ago and was never cleaned up, and the
// processor treats the latter as garbage and drops it WITHOUT crediting the
// focus time. Knowing the downtime window lets us tell the two apart, so a
// deploy can never eat someone's session.
const HEARTBEAT_KEY = 'frogodoro-processor';

// A gap this much larger than the tick interval can't be explained by a slow
// tick or a busy event loop — the process was down.
const DOWNTIME_THRESHOLD_MS = 45_000;

export type DowntimeWindow = { from: number; to: number };

type GlobalWithDowntime = typeof globalThis & {
  frogodoroDowntimeWindow?: DowntimeWindow | null;
};

export function getDowntimeWindow(): DowntimeWindow | null {
  return (globalThis as GlobalWithDowntime).frogodoroDowntimeWindow ?? null;
}

export async function beatServerHeartbeat(): Promise<void> {
  try {
    await ServerHeartbeatModel.updateOne(
      { key: HEARTBEAT_KEY },
      { $set: { beatAt: new Date() } },
      { upsert: true },
    );
  } catch (err) {
    console.error('Server heartbeat write failed:', err);
  }
}

// Read the previous process's last heartbeat, record the resulting downtime
// window for this process, and start a fresh heartbeat. Call once on boot.
export async function claimDowntimeWindow(): Promise<DowntimeWindow | null> {
  const g = globalThis as GlobalWithDowntime;
  try {
    await connectMongo();
    const previous = await ServerHeartbeatModel.findOne({ key: HEARTBEAT_KEY })
      .lean()
      .exec();
    const now = Date.now();
    const last = previous?.beatAt ? new Date(previous.beatAt).getTime() : 0;
    const gap = last > 0 ? now - last : 0;
    g.frogodoroDowntimeWindow =
      gap > DOWNTIME_THRESHOLD_MS ? { from: last, to: now } : null;
    if (g.frogodoroDowntimeWindow) {
      console.log(
        `Frogodoro heartbeat: server was down for ${Math.round(gap / 1000)}s — timers that ended in that window keep their credit`,
      );
    }
  } catch (err) {
    console.error('Server heartbeat read failed:', err);
    g.frogodoroDowntimeWindow = null;
  }
  await beatServerHeartbeat();
  return g.frogodoroDowntimeWindow ?? null;
}

// How long a due timer has been overdue *with the server actually running*.
// Lateness we caused by being offline doesn't count against the user.
export function unattendedOverdueMs(endsAtMs: number, nowMs: number): number {
  const window = getDowntimeWindow();
  if (window && endsAtMs >= window.from && endsAtMs <= window.to) {
    return Math.max(0, nowMs - window.to);
  }
  return Math.max(0, nowMs - endsAtMs);
}
