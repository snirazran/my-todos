export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import type { NextRequest } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import {
  getTaskEventsAfter,
  subscribeTaskEvents,
  type TaskEventMessage,
} from '@/lib/taskEvents';

function encodeEvent(event: TaskEventMessage) {
  return [
    `id: ${event.eventId}`,
    'event: task-sync',
    `data: ${JSON.stringify(event)}`,
    '',
    '',
  ].join('\n');
}

export async function GET(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return new Response('Unauthorized', { status: 401 });
  }

  await connectMongo();

  const url = new URL(req.url);
  const after =
    req.headers.get('last-event-id') || url.searchParams.get('since') || null;
  const missed = await getTaskEventsAfter(userId, after);
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: TaskEventMessage) => {
        try {
          controller.enqueue(encoder.encode(encodeEvent(event)));
        } catch {
          void 0;
        }
      };

      missed.forEach(send);

      const unsubscribe = subscribeTaskEvents(userId, send);
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
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
