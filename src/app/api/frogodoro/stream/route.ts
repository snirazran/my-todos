export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { subscribeTimer, type TimerEvent } from '@/lib/frogodoroEvents';
import { advanceUserTimer } from '@/lib/frogodoroTimerProcessor';
import type { ActiveFrogodoroTimer } from '@/lib/types/UserDoc';

// The in-process bus only reaches subscribers that happen to live in the same
// instance as the write. Serverless spreads them across instances, so the bus
// alone can leave a device deaf until a slow client-side backstop poll. A cheap
// projected read of the one document closes that gap with bounded latency.
const DB_POLL_MS = 3000;

export async function GET() {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return new Response('Unauthorized', { status: 401 });
  }

  await connectMongo();
  // A connecting client is a chance to notice a phase that ran out while nobody
  // was processing it, instead of leaving it for the next cron minute.
  await advanceUserTimer(userId).catch(() => null);

  const user = await UserModel.findById(userId, {
    activeFrogodoroTimer: 1,
    frogodoroSeq: 1,
  }).lean();
  const initial =
    (user as { activeFrogodoroTimer?: ActiveFrogodoroTimer | null } | null)
      ?.activeFrogodoroTimer ?? null;
  const initialSeq =
    (user as { frogodoroSeq?: number } | null)?.frogodoroSeq ?? 0;

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let lastSeq = -1;

      const send = (event: TimerEvent) => {
        if (closed) return;
        if (event.seq <= lastSeq) return;
        lastSeq = event.seq;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };

      send({ timer: initial, serverNow: Date.now(), seq: initialSeq });

      const unsubscribe = subscribeTimer(userId, send);

      const poll = setInterval(() => {
        if (closed) return;
        void UserModel.findById(userId, {
          activeFrogodoroTimer: 1,
          frogodoroSeq: 1,
        })
          .lean()
          .then((doc) => {
            const seq = (doc as { frogodoroSeq?: number } | null)?.frogodoroSeq ?? 0;
            if (seq <= lastSeq) return;
            send({
              timer:
                (doc as { activeFrogodoroTimer?: ActiveFrogodoroTimer | null } | null)
                  ?.activeFrogodoroTimer ?? null,
              serverNow: Date.now(),
              seq,
            });
          })
          .catch(() => undefined);
      }, DB_POLL_MS);

      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          closed = true;
        }
      }, 25000);

      cleanup = () => {
        closed = true;
        clearInterval(poll);
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          void 0;
        }
      };
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
