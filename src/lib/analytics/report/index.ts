import connectMongo from '@/lib/mongoose';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { METRIC_BY_KEY, type StatisticsSnapshot, type StatSection } from '@/lib/analytics/catalog';
import { buildSignals } from '@/lib/analytics/signals';
import { buildContext, previousRange, resolveRange, ymd, type DateRange } from './context';
import { buildGrowth } from './growth';
import { buildTasks } from './tasks';
import { buildQuests } from './quests';
import { buildFrog } from './frog';
import { buildWardrobe } from './wardrobe';
import { buildSocial } from './social';
import { buildEconomy } from './economy';
import { buildMoney } from './money';
import { buildTracking } from './tracking';
import { buildAcquisition } from './acquisition';
import { buildSummary } from '@/lib/analytics/narrative';

const HEADLINE_METRICS = [
  'new_users',
  'activation_rate',
  'retention_d1',
  'retention_d7',
  'stickiness',
  'gross_revenue',
];

async function buildSections(range: DateRange): Promise<StatSection[]> {
  const context = await buildContext(range);
  const [acquisition, growth, tasks, quests, frog, wardrobe, social, economy, money, tracking] =
    await Promise.all([
      buildAcquisition(context),
      buildGrowth(context),
      buildTasks(context),
      buildQuests(context),
      buildFrog(context),
      buildWardrobe(context),
      buildSocial(context),
      buildEconomy(context),
      buildMoney(context),
      buildTracking(context),
    ]);
  return [acquisition.section, growth, tasks, quests, frog, wardrobe, social, economy, money, tracking];
}

export async function buildSnapshot(params: {
  start?: string | null;
  end?: string | null;
  days?: number | null;
  compare?: boolean;
}): Promise<StatisticsSnapshot> {
  await connectMongo();

  const range = resolveRange(params);
  const context = await buildContext(range);

  const [acquisition, growth, tasks, quests, frog, wardrobe, social, economy, money, tracking] =
    await Promise.all([
      buildAcquisition(context),
      buildGrowth(context),
      buildTasks(context),
      buildQuests(context),
      buildFrog(context),
      buildWardrobe(context),
      buildSocial(context),
      buildEconomy(context),
      buildMoney(context),
      buildTracking(context),
    ]);

  const sections = [
    acquisition.section,
    growth,
    tasks,
    quests,
    frog,
    wardrobe,
    social,
    economy,
    money,
    tracking,
  ];

  let compareRange: DateRange | null = null;
  if (params.compare) {
    compareRange = previousRange(range);
    const previousSections = await buildSections(compareRange);
    const previousByMetric = new Map<string, number | null>();
    for (const section of previousSections) {
      for (const entry of section.kpis) previousByMetric.set(entry.metric, entry.value);
    }
    for (const section of sections) {
      for (const entry of section.kpis) {
        entry.previous = previousByMetric.get(entry.metric) ?? null;
      }
    }
  }

  const kpiByMetric = new Map(
    sections.flatMap((section) => section.kpis.map((entry) => [entry.metric, entry])),
  );
  const headline = HEADLINE_METRICS.map((key) => kpiByMetric.get(key)).filter(
    (entry): entry is NonNullable<typeof entry> => !!entry,
  );

  const referenced = new Set(sections.flatMap((section) => section.kpis.map((k) => k.metric)));
  const glossary = Array.from(referenced)
    .map((key) => METRIC_BY_KEY.get(key))
    .filter((definition): definition is NonNullable<typeof definition> => !!definition)
    .sort((a, b) => a.system.localeCompare(b.system) || a.label.localeCompare(b.label));

  const signals = buildSignals(sections);

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      timezone: 'UTC',
      range: { start: ymd(range.start), end: ymd(range.endDay), days: range.days },
      compare: compareRange
        ? {
            start: ymd(compareRange.start),
            end: ymd(compareRange.endDay),
            days: compareRange.days,
          }
        : null,
      coverage: {
        firstEventAt: context.firstEventAt ? context.firstEventAt.toISOString() : null,
        retentionDays: 400,
        declaredEvents: ANALYTICS_EVENTS.length,
        eventsInRange: context.eventsInRange,
      },
    },
    summary: buildSummary({
      sections,
      acquisition: acquisition.report,
      signals,
      days: range.days,
    }),
    headline,
    signals,
    acquisition: acquisition.report,
    sections,
    glossary,
  };
}

export { resolveRange };
