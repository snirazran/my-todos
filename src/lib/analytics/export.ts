import {
  METRIC_BY_KEY,
  SYSTEM_BY_ID,
  type StatTable,
  type StatisticsSnapshot,
} from '@/lib/analytics/catalog';

function csvCell(value: string | number | null | undefined) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: Array<Array<string | number | null>>) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function tableToCsv(table: StatTable) {
  const header = table.columns.map((column) => column.label);
  const body = table.rows.map((row) => table.columns.map((column) => row[column.key] ?? null));
  return toCsv([header, ...body]);
}

export function snapshotToTidyCsv(snapshot: StatisticsSnapshot) {
  const rows: Array<Array<string | number | null>> = [
    [
      'section',
      'dataset',
      'dataset_title',
      'date',
      'row',
      'column',
      'column_label',
      'value',
      'unit',
      'range_start',
      'range_end',
    ],
  ];

  const start = snapshot.meta.range.start;
  const end = snapshot.meta.range.end;

  for (const section of snapshot.sections) {
    for (const entry of section.kpis) {
      const definition = METRIC_BY_KEY.get(entry.metric);
      rows.push([
        section.id,
        'kpi',
        'Headline metrics',
        '',
        entry.metric,
        'value',
        definition?.label ?? entry.metric,
        entry.value,
        definition?.unit ?? '',
        start,
        end,
      ]);
      if (entry.previous !== null && entry.previous !== undefined) {
        rows.push([
          section.id,
          'kpi',
          'Headline metrics',
          '',
          entry.metric,
          'previous',
          definition?.label ?? entry.metric,
          entry.previous,
          definition?.unit ?? '',
          start,
          end,
        ]);
      }
    }

    for (const series of section.series) {
      for (const point of series.points) {
        for (const line of series.lines) {
          rows.push([
            section.id,
            series.key,
            series.title,
            point.date,
            '',
            line.key,
            line.label,
            point[line.key] ?? 0,
            line.format ?? '',
            start,
            end,
          ]);
        }
      }
    }

    for (const table of section.tables) {
      const labelColumn = table.columns[0];
      for (const row of table.rows) {
        for (const column of table.columns.slice(1)) {
          rows.push([
            section.id,
            table.key,
            table.title,
            '',
            String(row[labelColumn.key] ?? ''),
            column.key,
            column.label,
            row[column.key] ?? null,
            column.format ?? '',
            start,
            end,
          ]);
        }
      }
    }
  }

  return toCsv(rows);
}

function markdownTable(table: StatTable, limit: number) {
  const header = `| ${table.columns.map((column) => column.label).join(' | ')} |`;
  const divider = `| ${table.columns.map(() => '---').join(' | ')} |`;
  const body = table.rows
    .slice(0, limit)
    .map(
      (row) =>
        `| ${table.columns.map((column) => (row[column.key] ?? '')).join(' | ')} |`,
    );
  const truncated =
    table.rows.length > limit ? `\n_${table.rows.length - limit} more rows not shown._` : '';
  return [header, divider, ...body].join('\n') + truncated;
}

export function snapshotToBrief(
  snapshot: StatisticsSnapshot,
  options: { rowLimit?: number } = {},
) {
  const rowLimit = options.rowLimit ?? 20;
  const lines: string[] = [];

  lines.push('# Frogress product analytics brief');
  lines.push('');
  lines.push(
    `Range: **${snapshot.meta.range.start} → ${snapshot.meta.range.end}** (${snapshot.meta.range.days} days, ${snapshot.meta.timezone}).`,
  );
  if (snapshot.meta.compare) {
    lines.push(
      `Compared against **${snapshot.meta.compare.start} → ${snapshot.meta.compare.end}**.`,
    );
  }
  lines.push(`Generated ${snapshot.meta.generatedAt}.`);
  lines.push('');
  lines.push('## How to read this file');
  lines.push('');
  lines.push(
    'Frogress is a gamified task app: users complete tasks, earn a soft currency called flies, feed a pet frog, and spend flies on cosmetics. Every section below answers one product question. Each metric has a definition, the direction that counts as good, and a healthy band where one exists. Signals are pre-computed judgements against those bands, worst first. Tables carry the breakdowns behind the metrics.',
  );
  lines.push('');
  lines.push(
    'Sample sizes matter here. A metric annotated `[provisional, n=…]` rests on fewer than 20 observations and is not yet worth a conclusion — say so rather than reading a trend into it. Metrics under that floor are deliberately excluded from the signals list for the same reason.',
  );
  lines.push('');

  lines.push('## Metric definitions');
  lines.push('');
  lines.push('| Key | Metric | Area | Unit | Good direction | Healthy band | Definition |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const definition of snapshot.glossary) {
    const band =
      definition.band?.min !== undefined && definition.band?.max !== undefined
        ? `${definition.band.min} – ${definition.band.max}`
        : definition.band?.min !== undefined
          ? `≥ ${definition.band.min}`
          : definition.band?.max !== undefined
            ? `≤ ${definition.band.max}`
            : '—';
    lines.push(
      `| ${definition.key} | ${definition.label} | ${definition.system} | ${definition.unit} | ${definition.direction} | ${band} | ${definition.definition} |`,
    );
  }
  lines.push('');

  lines.push('## Headline');
  lines.push('');
  for (const entry of snapshot.headline) {
    const definition = METRIC_BY_KEY.get(entry.metric);
    const previous =
      entry.previous !== null && entry.previous !== undefined
        ? ` (previous period: ${entry.previous})`
        : '';
    lines.push(`- **${definition?.label ?? entry.metric}**: ${entry.value ?? 'no data'}${previous}`);
  }
  lines.push('');

  lines.push('## Signals');
  lines.push('');
  if (!snapshot.signals.length) {
    lines.push('No metric is outside its healthy band.');
  } else {
    for (const signal of snapshot.signals) {
      lines.push(`### [${signal.level.toUpperCase()}] ${signal.title}`);
      lines.push(`- Area: ${SYSTEM_BY_ID.get(signal.system)?.title ?? signal.system}`);
      lines.push(`- Why it matters: ${signal.detail}`);
      lines.push(`- Suggested action: ${signal.action}`);
      lines.push('');
    }
  }

  for (const section of snapshot.sections) {
    lines.push(`## ${section.title}`);
    lines.push('');
    lines.push(`_${section.question}_`);
    lines.push('');
    for (const entry of section.kpis) {
      const definition = METRIC_BY_KEY.get(entry.metric);
      const previous =
        entry.previous !== null && entry.previous !== undefined ? ` | previous ${entry.previous}` : '';
      const provisional =
        entry.sample !== undefined && entry.sample < 20 ? ` [provisional, n=${entry.sample}]` : '';
      lines.push(
        `- ${definition?.label ?? entry.metric} (\`${entry.metric}\`): ${entry.value ?? 'no data'}${previous}${provisional}${entry.detail ? ` — ${entry.detail}` : ''}`,
      );
    }
    lines.push('');
    for (const table of section.tables) {
      if (!table.rows.length) continue;
      lines.push(`### ${table.title}`);
      lines.push(`_${table.question}_`);
      lines.push('');
      lines.push(markdownTable(table, rowLimit));
      if (table.note) lines.push(`\n_${table.note}_`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

export function exportFilename(
  snapshot: StatisticsSnapshot,
  kind: string,
  extension: string,
) {
  return `frogress-${kind}_${snapshot.meta.range.start}_${snapshot.meta.range.end}.${extension}`;
}
