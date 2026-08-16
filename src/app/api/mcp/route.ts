import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import type { AuthInfo } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import type { AuthContext } from '@/lib/auth';
import { verifyBearerToken } from '@/lib/apiTokens';
import { callRoute } from '@/lib/mcp/callRoute';
import { readLoginStreakState } from '@/lib/streak/loginStreak';
import { readShieldState } from '@/lib/shields/engine';
import { getZonedToday } from '@/lib/utils';
import {
  GET as tasksGet,
  POST as tasksPost,
  PUT as tasksPut,
} from '@/app/api/tasks/route';
import { GET as sectionsGet } from '@/app/api/sections/route';
import { GET as tagsGet } from '@/app/api/tags/route';
import { oauthIssuer } from '@/lib/oauth/keys';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

type ToolContext = { auth: AuthContext; timezone: string };

function textResult(payload: unknown) {
  return {
    content: [
      { type: 'text' as const, text: JSON.stringify(payload, null, 2) },
    ],
  };
}

function errorResult(message: string) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: message }],
  };
}

function dowFromYMD(ymd: string) {
  return new Date(`${ymd}T12:00:00Z`).getUTCDay();
}

async function resolveContext(authInfo?: AuthInfo): Promise<ToolContext> {
  const userId = authInfo?.extra?.userId;
  if (typeof userId !== 'string' || !userId) {
    throw new Error('Unauthorized');
  }
  await connectMongo();
  const user = await UserModel.findById(userId).select('timezone').lean();
  return {
    auth: {
      uid: userId,
      authMethod: 'bearer',
      scopes: authInfo?.scopes ?? [],
      clientId: authInfo?.clientId,
    },
    timezone: (user as { timezone?: string } | null)?.timezone || 'UTC',
  };
}

function assertScope(ctx: ToolContext, scope: string) {
  if (!(ctx.auth.scopes ?? []).includes(scope)) {
    throw new Error(`This token is missing the required "${scope}" scope.`);
  }
}

const checklistItem = z.string().min(1).max(200);

const taskInput = z.object({
  text: z.string().min(1).max(500).describe('The task title.'),
  notes: z.string().max(5000).optional().describe('Longer free-text detail.'),
  checklist: z
    .array(checklistItem)
    .max(50)
    .optional()
    .describe('Sub-steps shown as a checklist inside the task.'),
  date: z
    .string()
    .regex(YMD)
    .optional()
    .describe(
      'Day the task belongs on (YYYY-MM-DD). Omit to save it to the backlog instead of a specific day.',
    ),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .describe('24h start time, e.g. "09:30".'),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  reminder: z
    .enum(['at_time', '5m', '10m', '15m', '30m', '1h'])
    .optional()
    .describe('Notify the user ahead of startTime. Requires startTime.'),
  tags: z
    .array(z.string())
    .max(6)
    .optional()
    .describe('Tag ids from list_tags. Never invent ids.'),
  sectionId: z
    .string()
    .optional()
    .describe('Section id from list_sections to group this task under.'),
  repeat: z
    .enum(['none', 'daily', 'weekdays', 'weekend', 'weekly', 'monthly'])
    .optional()
    .describe('Recurrence. Anything other than "none" requires date.'),
  repeatEndDate: z.string().regex(YMD).optional(),
});

function buildCreateBody(
  task: z.infer<typeof taskInput>,
  timezone: string,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    text: task.text,
    notes: task.notes,
    tags: task.tags ?? [],
    startTime: task.startTime,
    endTime: task.endTime,
    reminder: task.reminder,
    sectionId: task.sectionId,
    timezone,
    ...(task.checklist?.length
      ? {
          checklist: task.checklist.map((text) => ({
            id: uuid(),
            text,
            done: false,
          })),
        }
      : {}),
  };

  const repeat = task.repeat ?? 'none';

  if (repeat === 'none') {
    return task.date
      ? { ...base, repeat: 'this-week', dates: [task.date] }
      : { ...base, repeat: 'backlog' };
  }

  if (!task.date) {
    throw new Error(`"${task.text}" uses repeat "${repeat}" but has no date.`);
  }

  if (repeat === 'monthly') {
    return {
      ...base,
      repeat: 'monthly',
      dates: [task.date],
      repeatEndDate: task.repeatEndDate,
    };
  }

  const days =
    repeat === 'daily'
      ? [0, 1, 2, 3, 4, 5, 6]
      : repeat === 'weekdays'
        ? [1, 2, 3, 4, 5]
        : repeat === 'weekend'
          ? [0, 6]
          : [dowFromYMD(task.date)];

  return {
    ...base,
    repeat: 'weekly',
    days,
    dates: [task.date],
    repeatEndDate: task.repeatEndDate,
  };
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      'list_sections',
      {
        title: 'List sections',
        description:
          'Lists the headings the user groups their Today list under. Call this before create_tasks if you intend to file tasks under a section.',
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async (_args, ctx) => {
        try {
          const toolCtx = await resolveContext(ctx.http?.authInfo);
          assertScope(toolCtx, 'tasks:read');
          const data = await callRoute(sectionsGet, toolCtx.auth, {
            path: '/api/sections',
            method: 'GET',
            query: { timezone: toolCtx.timezone },
          });
          return textResult(data);
        } catch (error) {
          return errorResult((error as Error).message);
        }
      },
    );

    server.registerTool(
      'list_tags',
      {
        title: 'List tags',
        description:
          'Lists the user\'s tags with their ids. Tags connect tasks to the focus areas that drive quest progress, so prefer an existing tag over none. Only ever pass ids returned here.',
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async (_args, ctx) => {
        try {
          const toolCtx = await resolveContext(ctx.http?.authInfo);
          assertScope(toolCtx, 'tasks:read');
          const data = await callRoute(tagsGet, toolCtx.auth, {
            path: '/api/tags',
            method: 'GET',
            query: { timezone: toolCtx.timezone },
          });
          return textResult(data);
        } catch (error) {
          return errorResult((error as Error).message);
        }
      },
    );

    server.registerTool(
      'list_tasks',
      {
        title: 'List tasks',
        description:
          'Returns the user\'s tasks for a date range, grouped by day, plus the backlog. Repeating tasks appear once per occurrence with a per-date completed flag. Use this before rescheduling or completing anything so you act on real task ids.',
        inputSchema: z.object({
          from: z
            .string()
            .regex(YMD)
            .describe('First day of the range, YYYY-MM-DD.'),
          to: z
            .string()
            .regex(YMD)
            .describe('Last day of the range, inclusive. Keep ranges short.'),
        }),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ from, to }, ctx) => {
        try {
          const toolCtx = await resolveContext(ctx.http?.authInfo);
          assertScope(toolCtx, 'tasks:read');
          const data = await callRoute(tasksGet, toolCtx.auth, {
            path: '/api/tasks',
            method: 'GET',
            query: {
              view: 'dateRange',
              from,
              to,
              timezone: toolCtx.timezone,
            },
          });
          return textResult(data);
        } catch (error) {
          return errorResult((error as Error).message);
        }
      },
    );

    server.registerTool(
      'create_tasks',
      {
        title: 'Create tasks',
        description:
          'Creates one or more tasks. Prefer a single call with the full batch over many calls. Break a document or message into one task per real deliverable, and use the checklist field for sub-steps rather than creating a task per bullet. Dates must be absolute YYYY-MM-DD — resolve "tomorrow" yourself using get_progress.today.',
        inputSchema: z.object({
          tasks: z.array(taskInput).min(1).max(25),
        }),
        annotations: { readOnlyHint: false, destructiveHint: false },
      },
      async ({ tasks }, ctx) => {
        try {
          const toolCtx = await resolveContext(ctx.http?.authInfo);
          assertScope(toolCtx, 'tasks:write');

          const created: unknown[] = [];
          const failed: { text: string; error: string }[] = [];

          for (const task of tasks) {
            try {
              const body = buildCreateBody(task, toolCtx.timezone);
              const data = await callRoute(tasksPost, toolCtx.auth, {
                path: '/api/tasks',
                method: 'POST',
                body,
              });
              created.push(...(data?.tasks ?? []));
            } catch (error) {
              failed.push({ text: task.text, error: (error as Error).message });
            }
          }

          return textResult({
            createdCount: created.length,
            created,
            ...(failed.length ? { failed } : {}),
          });
        } catch (error) {
          return errorResult((error as Error).message);
        }
      },
    );

    server.registerTool(
      'complete_task',
      {
        title: 'Complete task',
        description:
          'Marks a task done (or reopens it) for a specific date. This awards the user their fly and advances streaks and quests, so only call it when the user says the work is actually finished. Get taskId from list_tasks.',
        annotations: { readOnlyHint: false, destructiveHint: true },
        inputSchema: z.object({
          taskId: z.string().min(1).describe('Task id from list_tasks.'),
          date: z
            .string()
            .regex(YMD)
            .describe(
              'The occurrence date being completed. For repeating tasks this picks which day.',
            ),
          completed: z
            .boolean()
            .default(true)
            .describe('False reopens a completed task and refunds the fly.'),
        }),
      },
      async ({ taskId, date, completed }, ctx) => {
        try {
          const toolCtx = await resolveContext(ctx.http?.authInfo);
          assertScope(toolCtx, 'tasks:write');
          const data = await callRoute(tasksPut, toolCtx.auth, {
            path: '/api/tasks',
            method: 'PUT',
            body: {
              taskId,
              date,
              completed,
              timezone: toolCtx.timezone,
            },
          });
          return textResult(data);
        } catch (error) {
          return errorResult((error as Error).message);
        }
      },
    );

    server.registerTool(
      'get_progress',
      {
        title: 'Get progress',
        description:
          "Returns the user's current date in their own timezone plus their streak, flies and longest streak. Call this first when you need to resolve relative dates like today or next Monday.",
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async (_args, ctx) => {
        try {
          const toolCtx = await resolveContext(ctx.http?.authInfo);
          assertScope(toolCtx, 'progress:read');
          await connectMongo();
          const user = await UserModel.findById(toolCtx.auth.uid)
            .select('wardrobe.flies quests timezone')
            .lean();
          const streak = readLoginStreakState(user);
          return textResult({
            today: getZonedToday(toolCtx.timezone),
            timezone: toolCtx.timezone,
            flies: (user as any)?.wardrobe?.flies ?? 0,
            loginStreak: streak.count,
            longestStreak: streak.longestStreak,
            lilyPads: readShieldState(user).count,
          });
        } catch (error) {
          return errorResult((error as Error).message);
        }
      },
    );
  },
  {
    serverInfo: { name: 'frogress', version: '1.0.0' },
    instructions:
      'Frogress is a gamified task app where completing tasks feeds the user\'s pet frog. Resolve relative dates with get_progress before creating anything, and read list_tags / list_sections before assigning tags or sections.',
  },
);

const verifyToken = async (
  _req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> => {
  if (!bearerToken) return undefined;
  const identity = await verifyBearerToken(bearerToken);
  if (!identity) return undefined;
  return {
    token: bearerToken,
    scopes: identity.scopes,
    clientId: identity.clientId,
    extra: { userId: identity.userId },
  };
};

// `resourceUrl` is treated as an origin by mcp-handler, not as the resource
// identifier. Left unset it is derived from X-Forwarded-Host / X-Forwarded-Proto,
// which Traefik sets correctly; the issuer pins it when running elsewhere.
const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  resourceMetadataPath: '/.well-known/oauth-protected-resource',
  ...(oauthIssuer() ? { resourceUrl: oauthIssuer() } : {}),
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
