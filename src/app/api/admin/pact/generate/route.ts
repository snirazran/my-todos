export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuid } from 'uuid';
import { requireAdminUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import PactConfigModel, { PACT_CONFIG_ID } from '@/lib/models/PactConfig';
import QuestCategoryModel from '@/lib/models/QuestCategory';
import { ensurePactConfig } from '@/lib/pact/engine';
import { suggestionSessions, type PactSuggestion } from '@/lib/pact/types';

const MODEL = 'claude-haiku-4-5';

const SUGGESTION_SCHEMA = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          // Structured outputs reject numeric bounds (minimum/maximum), so the
          // range is expressed as the enum of allowed session counts.
          sessions: { type: 'integer', enum: [1, 2, 3, 4, 5, 6, 7] },
        },
        required: ['text', 'sessions'],
        additionalProperties: false,
      },
    },
  },
  required: ['suggestions'],
  additionalProperties: false,
} as const;

export async function POST(req: NextRequest) {
  try {
    await requireAdminUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const categoryId = String(body.categoryId ?? '').trim();
    if (!categoryId) {
      return NextResponse.json({ error: 'Pick an area' }, { status: 400 });
    }

    await connectMongo();
    const [config, category] = await Promise.all([
      ensurePactConfig(),
      QuestCategoryModel.findOne({ categoryId }).lean(),
    ]);
    if (!category) {
      return NextResponse.json({ error: 'Unknown area' }, { status: 400 });
    }

    const existing = (config.suggestions ?? [])
      .filter((s) => s.categoryId === categoryId)
      .map((s) => s.text);

    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system:
        'You write weekly commitments for a habit app. Each one is a single concrete action a person can finish in one sitting, written as an instruction they would recognise in their own to-do list. No motivational language, no emoji, no numbering. Under 60 characters. Say what the action is and how often it should happen — never which days or what time, because the person choosing it sets their own schedule.',
      messages: [
        {
          role: 'user',
          content: [
            `Life area: ${category.name} — ${category.description || 'no description'}`,
            existing.length
              ? `Do not repeat these existing ideas: ${existing.join('; ')}`
              : '',
            'Write 6 commitments spread across the effort range: 2 small (under 15 minutes, 1-2 sessions a week), 2 moderate (3 sessions), 2 demanding (4-5 sessions).',
            'sessions is how many times that week the action happens, 1 to 7. If a duration is part of the action, put it in the text ("Take a 20-minute walk"), not in a separate field.',
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ],
      output_config: {
        format: { type: 'json_schema', schema: SUGGESTION_SCHEMA },
      },
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'No ideas came back' }, { status: 502 });
    }

    let parsed: { suggestions?: unknown[] };
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      return NextResponse.json(
        { error: 'Could not read the generated ideas' },
        { status: 502 },
      );
    }

    const generated: PactSuggestion[] = (parsed.suggestions ?? [])
      .map((entry: any): PactSuggestion | null => {
        const text = String(entry?.text ?? '').trim().slice(0, 80);
        if (!text) return null;
        return {
          id: uuid(),
          categoryId,
          text,
          sessions: suggestionSessions(entry ?? {}),
          isActive: false,
          generated: true,
          picked: 0,
          kept: 0,
        };
      })
      .filter((entry): entry is PactSuggestion => !!entry);

    if (generated.length === 0) {
      return NextResponse.json({ error: 'No usable ideas' }, { status: 502 });
    }

    await PactConfigModel.updateOne(
      { configId: PACT_CONFIG_ID },
      { $push: { suggestions: { $each: generated } } },
    );

    return NextResponse.json({ ok: true, suggestions: generated });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Could not generate ideas',
      },
      { status: 500 },
    );
  }
}
