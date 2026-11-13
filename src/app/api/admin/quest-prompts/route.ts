import { v4 as uuid } from 'uuid';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import QuestPromptModel, { type QuestPromptDoc } from '@/lib/models/QuestPrompt';
import PromptAnswerModel from '@/lib/models/PromptAnswer';
import PromptExposureModel from '@/lib/models/PromptExposure';
import PromptTallyModel from '@/lib/models/PromptTally';
import { CHECKIN_OPTIONS, ensureSeedPrompts } from '@/lib/prompts/library';
import type { QuestPromptKind, QuestPromptOption } from '@/lib/quests/types';

const KINDS = new Set<QuestPromptKind>(['journal', 'poll', 'this_or_that', 'checkin']);

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function sanitizeOptions(kind: QuestPromptKind, input: unknown): QuestPromptOption[] {
  if (kind === 'journal') return [];
  if (kind === 'checkin' && (!Array.isArray(input) || input.length === 0)) {
    return CHECKIN_OPTIONS;
  }
  const raw = Array.isArray(input) ? input : [];
  const seen = new Set<string>();
  const options: QuestPromptOption[] = [];
  raw.forEach((entry: any, index) => {
    const label = clean(entry?.label, 40);
    if (!label) return;
    let id = clean(entry?.id, 24).replace(/[^\w-]/g, '') || String.fromCharCode(97 + index);
    while (seen.has(id)) id = `${id}x`;
    seen.add(id);
    const emoji = clean(entry?.emoji, 8);
    options.push({ id, label, ...(emoji ? { emoji } : {}) });
  });
  const max = kind === 'this_or_that' ? 2 : kind === 'checkin' ? 5 : 4;
  return options.slice(0, max);
}

function sanitizeAudience(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : typeof input === 'string' ? input.split(',') : [];
  const tags = raw
    .map((value) => clean(value, 48).toLowerCase())
    .filter((value) => /^[a-z]+:[a-z0-9-]+$/.test(value));
  return Array.from(new Set(tags)).slice(0, 16);
}

function sanitizeWeekdays(input: unknown): number[] {
  const raw = Array.isArray(input) ? input : [];
  const days = raw.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);
  return Array.from(new Set(days)).sort((a, b) => a - b);
}

function sanitizePrompt(input: any): { value?: Omit<QuestPromptDoc, 'createdAt' | 'updatedAt' | '_id'>; error?: string } {
  const kind = KINDS.has(input?.kind) ? (input.kind as QuestPromptKind) : null;
  if (!kind) return { error: 'Pick a kind' };
  const question = clean(input?.question, 160);
  if (!question) return { error: 'Write a question' };
  const options = sanitizeOptions(kind, input?.options);
  if (kind !== 'journal' && options.length < 2) {
    return { error: 'Add at least two answers' };
  }
  const dateKey = clean(input?.dateKey, 10);
  const weight = Math.floor(Number(input?.weight));
  const cooldownDays = Math.floor(Number(input?.cooldownDays));
  return {
    value: {
      promptId: clean(input?.promptId, 64) || uuid(),
      kind,
      question,
      placeholder: clean(input?.placeholder, 80) || undefined,
      options,
      category: clean(input?.category, 40) || 'reflection',
      weight: Number.isFinite(weight) && weight > 0 ? Math.min(100, weight) : 1,
      cooldownDays:
        Number.isFinite(cooldownDays) && cooldownDays >= 0 ? Math.min(365, cooldownDays) : 30,
      dateKey: /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : null,
      audience: sanitizeAudience(input?.audience),
      weekdays: sanitizeWeekdays(input?.weekdays),
      isActive: input?.isActive !== false,
    },
  };
}

export async function GET() {
  try {
    await requireAdminUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await connectMongo();
  await ensureSeedPrompts();
  const [prompts, answerCounts, tallies, shownCounts] = await Promise.all([
    QuestPromptModel.find({}).sort({ createdAt: -1 }).lean<QuestPromptDoc[]>(),
    PromptAnswerModel.aggregate<{ _id: string; count: number; last: string }>([
      { $group: { _id: '$promptId', count: { $sum: 1 }, last: { $max: '$dayKey' } } },
    ]),
    PromptTallyModel.find({}).lean<Array<{ promptId: string; counts: Record<string, number>; total: number }>>(),
    PromptExposureModel.aggregate<{ _id: string; count: number }>([
      { $group: { _id: '$promptId', count: { $sum: 1 } } },
    ]),
  ]);
  const shownById = new Map(shownCounts.map((row) => [row._id, row.count]));
  const statsById = new Map(answerCounts.map((row) => [row._id, row]));
  const tallyById = new Map(tallies.map((row) => [row.promptId, row]));
  return NextResponse.json({
    prompts: prompts.map((prompt) => ({
      promptId: prompt.promptId,
      kind: prompt.kind,
      question: prompt.question,
      placeholder: prompt.placeholder ?? '',
      options: prompt.options ?? [],
      category: prompt.category,
      weight: prompt.weight,
      cooldownDays: prompt.cooldownDays,
      dateKey: prompt.dateKey ?? null,
      audience: prompt.audience ?? [],
      weekdays: prompt.weekdays ?? [],
      shown: shownById.get(prompt.promptId) ?? 0,
      isActive: prompt.isActive,
      answers: statsById.get(prompt.promptId)?.count ?? 0,
      lastAnswered: statsById.get(prompt.promptId)?.last ?? null,
      tally: tallyById.get(prompt.promptId)?.counts ?? {},
    })),
  });
}

export async function PUT(req: NextRequest) {
  try {
    await requireAdminUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await connectMongo();
  const body = await req.json().catch(() => ({}));
  const list = Array.isArray(body?.prompts) ? body.prompts : [body];
  const saved: string[] = [];
  const errors: string[] = [];
  for (const [index, input] of list.slice(0, 500).entries()) {
    const parsed = sanitizePrompt(input);
    if (!parsed.value) {
      errors.push(`#${index + 1}: ${parsed.error}`);
      continue;
    }
    await QuestPromptModel.updateOne(
      { promptId: parsed.value.promptId },
      { $set: parsed.value },
      { upsert: true },
    );
    saved.push(parsed.value.promptId);
  }
  if (saved.length === 0) {
    return NextResponse.json({ error: errors[0] ?? 'Nothing to save', errors }, { status: 400 });
  }
  return NextResponse.json({ ok: true, saved, errors });
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAdminUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await connectMongo();
  const promptId = req.nextUrl.searchParams.get('promptId') ?? '';
  if (!promptId) return NextResponse.json({ error: 'promptId required' }, { status: 400 });
  await QuestPromptModel.deleteOne({ promptId });
  return NextResponse.json({ ok: true });
}
