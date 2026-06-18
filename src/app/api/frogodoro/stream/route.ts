export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { subscribeTimer, type TimerEvent } from '@/lib/frogodoroEvents';
import type { ActiveFrogodoroTimer } from '@/lib/types/UserDoc';

export async function GET() {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return new Response('Unauthorized', { status: 401 });
  }

  await connectMongo();
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
      const send = (event: TimerEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        } catch {
          void 0;
        }
      };

      send({ timer: initial, serverNow: Date.now(), seq: initialSeq });

      const unsubscribe = subscribeTimer(userId, send);

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          void 0;
        }
      }, 25000);

      cleanup = () => {
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
