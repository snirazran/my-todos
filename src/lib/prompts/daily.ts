import QuestModel from '@/lib/models/Quest';
import QuestRecipeModel, {
  type QuestRecipeDoc,
  type RecipePoolEntry,
} from '@/lib/models/QuestRecipe';
import PromptAnswerModel, { type PromptAnswerDoc } from '@/lib/models/PromptAnswer';
import PromptTallyModel from '@/lib/models/PromptTally';
import FriendshipModel from '@/lib/models/Friendship';
import UserModel from '@/lib/models/User';
import connectMongo from '@/lib/mongoose';
import { getZonedToday } from '@/lib/utils';
import {
  claimObjectiveReward,
  pickPromptForEntry,
  promptBlockFields,
} from '@/lib/quests/engine';
import type { QuestPromptKind, ResolvedQuestLogicBlock } from '@/lib/quests/types';
import {
  PROMPT_RECENT_WINDOW_DAYS,
  loadPromptLibrary,
  loadRecentPromptAnswers,
} from './library';

export const PROMPT_TEXT_MAX = 1000;

const OPTION_KINDS = new Set<QuestPromptKind>(['poll', 'this_or_that', 'checkin']);
const COMMUNITY_KINDS = new Set<QuestPromptKind>(['poll', 'this_or_that']);

export function isCommunityPrompt(kind?: QuestPromptKind) {
  return !!kind && COMMUNITY_KINDS.has(kind);
}

function shiftDayKey(dateKey: string, deltaDays: number) {
  const base = new Date(`${dateKey}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return base.toISOString().slice(0, 10);
}

function recomputeQuestProgress(logic: ResolvedQuestLogicBlock[]) {
  return logic.reduce(
    (sum, block) => sum + Math.min(block.progress ?? 0, block.target ?? 0),
    0,
  );
}

async function loadTodayDailyDoc(userId: string, todayKey: string) {
  return QuestModel.findOne({
    userId,
    placement: 'daily',
    windowKey: todayKey,
    templateId: `gend:${todayKey}`,
  });
}

export async function swapDailyPrompt(args: {
  userId: string;
  timezone: string;
  seed: string;
}) {
  await connectMongo();
  const todayKey = getZonedToday(args.timezone);
  const doc = await loadTodayDailyDoc(args.userId, todayKey);
  if (!doc) throw new Error('No quests to swap yet');
  const logic = (doc.logic ?? []) as ResolvedQuestLogicBlock[];
  const index = logic.findIndex((block) => block.type === 'prompt');
  if (index < 0) throw new Error('Nothing to swap today');
  const block = logic[index];
  const answered = await PromptAnswerModel.exists({
    userId: args.userId,
    promptId: block.promptId,
    dayKey: todayKey,
  });
  if (answered || (doc.claimedObjectiveIds ?? []).includes(block.id)) {
    throw new Error('You already answered today’s question');
  }

  const recipe = await QuestRecipeModel.findOne({
    placement: 'daily',
    isActive: true,
  }).lean<QuestRecipeDoc | null>();
  const slotIndex = Number(/^slot-(\d+)$/.exec(block.id)?.[1] ?? 0) - 1;
  const entry: RecipePoolEntry =
    recipe?.slots?.[slotIndex]?.pool?.find((item) => item.type === 'prompt') ?? {
      id: 'prompt',
      type: 'prompt',
      minTarget: 1,
      maxTarget: 1,
      weight: 1,
    };

  const [prompts, recent] = await Promise.all([
    loadPromptLibrary(),
    loadRecentPromptAnswers(
      args.userId,
      shiftDayKey(todayKey, -PROMPT_RECENT_WINDOW_DAYS),
    ),
  ]);
  const next = pickPromptForEntry({
    entry,
    prompts,
    recent,
    todayKey,
    seed: `${args.userId}:${todayKey}:${args.seed}`,
    excludeIds: block.promptId ? [block.promptId] : [],
  });
  if (!next) throw new Error('No other questions to swap to');

  const nextLogic = logic.map((item, i) =>
    i === index
      ? ({
          ...item,
          ...promptBlockFields(next),
          progress: 0,
          promptAnswered: false,
        } as ResolvedQuestLogicBlock)
      : item,
  );
  doc.logic = nextLogic as any;
  doc.progress = recomputeQuestProgress(nextLogic);
  doc.markModified('logic');
  await doc.save();
  return next;
}

export type PromptResults = {
  promptId: string;
  total: number;
  counts: Record<string, number>;
  mine: string | null;
  friends: Array<{ name: string; optionId: string }>;
};

export async function loadPromptResults(
  userId: string,
  promptId: string,
): Promise<PromptResults> {
  await connectMongo();
  const [tally, mine, friendships] = await Promise.all([
    PromptTallyModel.findOne({ promptId }).lean<{
      counts?: Record<string, number>;
      total?: number;
    } | null>(),
    PromptAnswerModel.findOne({ userId, promptId })
      .sort({ createdAt: -1 })
      .select('optionId')
      .lean<{ optionId?: string } | null>(),
    FriendshipModel.find({ $or: [{ userA: userId }, { userB: userId }] })
      .select('userA userB')
      .lean<Array<{ userA: string; userB: string }>>(),
  ]);
  const friendIds = friendships.map((f) => (f.userA === userId ? f.userB : f.userA));
  let friends: PromptResults['friends'] = [];
  if (friendIds.length > 0) {
    const answers = await PromptAnswerModel.find({
      promptId,
      userId: { $in: friendIds },
      kind: { $in: Array.from(COMMUNITY_KINDS) },
      optionId: { $exists: true },
    })
      .sort({ createdAt: -1 })
      .limit(24)
      .select('userId optionId')
      .lean<Array<{ userId: string; optionId: string }>>();
    if (answers.length > 0) {
      const people = await UserModel.find({
        _id: { $in: Array.from(new Set(answers.map((a) => a.userId))) },
      })
        .select('name frogName')
        .lean<Array<{ _id: unknown; name?: string; frogName?: string }>>();
      const nameById = new Map(
        people.map((person) => [
          String(person._id),
          (person.name || person.frogName || 'Friend').split(' ')[0],
        ]),
      );
      const seen = new Set<string>();
      friends = answers
        .filter((answer) => {
          if (seen.has(answer.userId)) return false;
          seen.add(answer.userId);
          return true;
        })
        .map((answer) => ({
          name: nameById.get(answer.userId) ?? 'Friend',
          optionId: answer.optionId,
        }));
    }
  }
  return {
    promptId,
    total: Math.max(0, tally?.total ?? 0),
    counts: tally?.counts ?? {},
    mine: mine?.optionId ?? null,
    friends,
  };
}

export async function answerDailyPrompt(args: {
  userId: string;
  timezone: string;
  questId: string;
  objectiveId: string;
  text?: unknown;
  optionId?: unknown;
}) {
  await connectMongo();
  const todayKey = getZonedToday(args.timezone);
  const doc = await QuestModel.findOne({ userId: args.userId, questId: args.questId });
  if (!doc) throw new Error('Quest not found');
  const logic = (doc.logic ?? []) as ResolvedQuestLogicBlock[];
  const block = logic.find((item) => item.id === args.objectiveId);
  if (!block || block.type !== 'prompt' || !block.promptId || !block.promptKind) {
    throw new Error('Question not found');
  }
  const kind = block.promptKind;

  let text: string | undefined;
  let optionId: string | undefined;
  if (kind === 'journal') {
    text = typeof args.text === 'string' ? args.text.trim().slice(0, PROMPT_TEXT_MAX) : '';
    if (!text) throw new Error('Write a few words first');
  } else if (OPTION_KINDS.has(kind)) {
    const picked = typeof args.optionId === 'string' ? args.optionId : '';
    if (!(block.promptOptions ?? []).some((option) => option.id === picked)) {
      throw new Error('Pick an answer first');
    }
    optionId = picked;
  }

  try {
    await PromptAnswerModel.create({
      userId: args.userId,
      promptId: block.promptId,
      dayKey: todayKey,
      kind,
      category: block.promptCategory ?? 'reflection',
      question: block.promptQuestion ?? '',
      text,
      optionId,
    });
  } catch (error: any) {
    if (error?.code !== 11000) throw error;
    throw new Error('You already answered this one');
  }

  if (optionId && isCommunityPrompt(kind) && /^[\w-]{1,32}$/.test(optionId)) {
    await PromptTallyModel.updateOne(
      { promptId: block.promptId },
      { $inc: { [`counts.${optionId}`]: 1, total: 1 } },
      { upsert: true },
    );
  }

  const nextLogic = logic.map((item) =>
    item.id === block.id
      ? { ...item, progress: Math.max(1, item.target ?? 1), promptAnswered: true }
      : item,
  );
  doc.logic = nextLogic as any;
  doc.progress = recomputeQuestProgress(nextLogic);
  doc.markModified('logic');
  await doc.save();

  let rewardSummary: Awaited<ReturnType<typeof claimObjectiveReward>> | null = null;
  if ((block.rewards?.length ?? 0) > 0 && !(doc.claimedObjectiveIds ?? []).includes(block.id)) {
    rewardSummary = await claimObjectiveReward({
      userId: args.userId,
      questId: args.questId,
      objectiveId: block.id,
      timezone: args.timezone,
    });
  }

  const results = isCommunityPrompt(kind)
    ? await loadPromptResults(args.userId, block.promptId)
    : null;
  return { rewardSummary, results, kind, promptId: block.promptId };
}

export type JournalEntry = Pick<
  PromptAnswerDoc,
  'promptId' | 'dayKey' | 'kind' | 'category' | 'question' | 'text' | 'optionId'
> & { id: string };

export async function loadJournal(userId: string, limit = 60): Promise<JournalEntry[]> {
  await connectMongo();
  const rows = await PromptAnswerModel.find({
    userId,
    kind: { $in: ['journal', 'checkin'] },
  })
    .sort({ dayKey: -1, createdAt: -1 })
    .limit(Math.min(200, Math.max(1, limit)))
    .lean<Array<PromptAnswerDoc & { _id: unknown }>>();
  return rows.map((row) => ({
    id: String(row._id),
    promptId: row.promptId,
    dayKey: row.dayKey,
    kind: row.kind,
    category: row.category,
    question: row.question,
    text: row.text,
    optionId: row.optionId,
  }));
}
