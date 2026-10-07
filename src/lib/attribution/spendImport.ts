export type SpendLevel = 'campaign' | 'adGroup' | 'keyword';

export type ParsedSpendRow = {
  date?: string;
  campaign: string;
  adGroup?: string;
  keyword?: string;
  spend: number;
  impressions: number;
  taps: number;
  installs: number;
};

export type ReportMeta = {
  campaign?: string;
  adGroup?: string;
  start?: string;
  end?: string;
};

export type ParsedSpend = {
  level: SpendLevel;
  hasDate: boolean;
  meta: ReportMeta;
  campaigns: string[];
  rows: ParsedSpendRow[];
  columns: Record<string, string>;
  warnings: string[];
  totals: { spend: number; impressions: number; taps: number; installs: number };
  dateRange: { start: string; end: string } | null;
};

type Field =
  | 'date'
  | 'dateEnd'
  | 'campaign'
  | 'adGroup'
  | 'keyword'
  | 'spend'
  | 'impressions'
  | 'taps'
  | 'installs'
  | 'installsTap'
  | 'avgCpt'
  | 'avgCpa';

const ALIASES: Record<Field, string[]> = {
  date: ['day', 'date', 'dateutc', 'reportingstarts', 'reportdate', 'byday'],
  dateEnd: ['reportingends'],
  campaign: ['campaignname', 'campaign'],
  adGroup: ['adgroupname', 'adgroup', 'adsetname', 'adset'],
  keyword: ['keyword', 'keywordtext', 'keywords'],
  spend: ['spend', 'localspend', 'spendusd', 'amountspent', 'amountspentusd', 'cost', 'totalcost', 'costusd'],
  impressions: ['impressions', 'impr'],
  taps: ['taps', 'clicks', 'linkclicks', 'clicksall', 'tapsclicks'],
  installs: ['installstotal', 'totalinstalls', 'installs', 'appinstalls', 'mobileappinstalls', 'conversions', 'downloads', 'newdownloads'],
  installsTap: ['installstapthrough', 'tapthroughinstalls', 'tapinstalls'],
  avgCpt: ['avgcpt', 'averagecpt', 'avgcpttapthrough', 'cpc', 'costperclick'],
  avgCpa: ['avgcpatapthrough', 'avgcpa', 'averagecpa', 'avgcpatotal', 'cpi', 'costperinstall'],
};

function headerKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function detectDelimiter(line: string) {
  const counts = [
    { delimiter: '\t', count: line.split('\t').length },
    { delimiter: ';', count: line.split(';').length },
    { delimiter: ',', count: line.split(',').length },
  ].sort((a, b) => b.count - a.count);
  return counts[0].count > 1 ? counts[0].delimiter : ',';
}

function splitLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseNumber(value: string | undefined) {
  if (!value) return 0;
  const cleaned = value.replace(/[^0-9.,-]/g, '');
  if (!cleaned) return 0;
  const normalized = /,\d{1,2}$/.test(cleaned) && !cleaned.includes('.')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned.replace(/,/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function parseDay(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const text = value.trim();
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(text);
  if (match) return `${match[1]}-${pad(Number(match[2]))}-${pad(Number(match[3]))}`;
  match = /^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/.exec(text);
  if (match) {
    const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
    return `${year}-${pad(Number(match[1]))}-${pad(Number(match[2]))}`;
  }
  match = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(text);
  if (match && MONTHS[match[1].toLowerCase()]) {
    return `${match[3]}-${pad(MONTHS[match[1].toLowerCase()])}-${pad(Number(match[2]))}`;
  }
  return undefined;
}

function findHeader(lines: string[]) {
  for (let index = 0; index < Math.min(lines.length, 40); index += 1) {
    const delimiter = detectDelimiter(lines[index]);
    const cells = splitLine(lines[index], delimiter).map(headerKey);
    const hasName = cells.some(
      (cell) =>
        ALIASES.campaign.includes(cell) ||
        ALIASES.adGroup.includes(cell) ||
        ALIASES.keyword.includes(cell),
    );
    const hasMetric = cells.some(
      (cell) =>
        ALIASES.spend.includes(cell) ||
        ALIASES.installs.includes(cell) ||
        ALIASES.taps.includes(cell) ||
        ALIASES.avgCpa.includes(cell),
    );
    if (hasName && hasMetric) return { index, delimiter, cells };
  }
  return null;
}

function stripId(value: string) {
  return value.replace(/\s*\(\s*ID\s*:?\s*\d+\s*\)\s*$/i, '').trim();
}

export function readPreamble(lines: string[]): ReportMeta {
  const meta: ReportMeta = {};
  for (const line of lines) {
    const text = splitLine(line, detectDelimiter(line))
      .filter(Boolean)
      .join(' ')
      .trim();
    const match = /^(campaign(?: name)?|ad group(?: name)?|start date|end date|date range|report date range)\s*[:,]?\s+(.+)$/i.exec(text);
    if (!match) continue;
    const key = match[1].toLowerCase();
    const value = match[2].trim();
    if (key.startsWith('campaign')) meta.campaign ??= stripId(value);
    else if (key.startsWith('ad group')) meta.adGroup ??= stripId(value);
    else if (key === 'start date') meta.start ??= parseDay(value);
    else if (key === 'end date') meta.end ??= parseDay(value);
    else {
      const parts = value.split(/\s+(?:-|–|to)\s+/);
      if (parts.length === 2) {
        meta.start ??= parseDay(parts[0]);
        meta.end ??= parseDay(parts[1]);
      }
    }
  }
  return meta;
}

export function parseSpendReport(text: string): ParsedSpend | { error: string } {
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (!lines.length) return { error: 'The report is empty.' };

  const header = findHeader(lines);
  if (!header) {
    return {
      error:
        'Could not find a header row with a campaign, ad group, or keyword column and at least one of Spend, Installs, or Taps. Export the report as CSV, or copy the whole table including its header row.',
    };
  }
  const meta = readPreamble(lines.slice(0, header.index));

  const position: Partial<Record<Field, number>> = {};
  const columns: Record<string, string> = {};
  const rawHeader = splitLine(lines[header.index], header.delimiter);
  (Object.keys(ALIASES) as Field[]).forEach((field) => {
    for (const alias of ALIASES[field]) {
      const found = header.cells.indexOf(alias);
      if (found >= 0) {
        position[field] = found;
        columns[field] = rawHeader[found];
        break;
      }
    }
  });

  if (position.campaign === undefined && !meta.campaign) {
    return {
      error:
        'This report has no campaign column and its first lines do not name a campaign (Apple writes "Campaign: NAME (ID: …)" there). Export it from inside the campaign, or add a Campaign Name column.',
    };
  }

  const warnings: string[] = [];
  const level: SpendLevel =
    position.keyword !== undefined ? 'keyword' : position.adGroup !== undefined ? 'adGroup' : 'campaign';
  if (position.spend === undefined) {
    if (position.avgCpt !== undefined && position.taps !== undefined) {
      warnings.push('No Spend column — spend estimated as average CPT × taps. Add the Spend column for exact numbers.');
    } else if (position.avgCpa !== undefined) {
      warnings.push('No Spend column — spend estimated as average CPA × installs. Add the Spend column for exact numbers.');
    } else {
      warnings.push('No Spend column — cost metrics will read as zero.');
    }
  }
  if (position.installs === undefined && position.installsTap !== undefined) {
    warnings.push('Using tap-through installs, which exclude view-through installs.');
  }

  const cell = (cells: string[], field: Field) =>
    position[field] === undefined ? undefined : cells[position[field] as number];

  const isTotal = (value: string | undefined) => !!value && /^(grand )?totals?:?$/i.test(value.trim());
  const levelField: Field = level === 'keyword' ? 'keyword' : level === 'adGroup' ? 'adGroup' : 'campaign';

  const rows: ParsedSpendRow[] = [];
  let undated = 0;
  let skippedTotals = 0;
  for (const line of lines.slice(header.index + 1)) {
    const cells = splitLine(line, header.delimiter);
    if (cells.some((value) => isTotal(value))) {
      skippedTotals += 1;
      continue;
    }
    const levelName = cell(cells, levelField)?.trim();
    if (!levelName) {
      if (cells.some((value) => value.trim())) skippedTotals += 1;
      continue;
    }
    const campaign = cell(cells, 'campaign')?.trim() || meta.campaign;
    if (!campaign) continue;

    const taps = parseNumber(cell(cells, 'taps'));
    const installs = parseNumber(cell(cells, 'installs') ?? cell(cells, 'installsTap'));
    const installsForCpa = parseNumber(cell(cells, 'installsTap') ?? cell(cells, 'installs'));
    let spend = parseNumber(cell(cells, 'spend'));
    if (position.spend === undefined) {
      if (position.avgCpt !== undefined && position.taps !== undefined) {
        spend = parseNumber(cell(cells, 'avgCpt')) * taps;
      } else if (position.avgCpa !== undefined) {
        spend = parseNumber(cell(cells, 'avgCpa')) * installsForCpa;
      }
    }

    const dateText = cell(cells, 'date');
    const endText = cell(cells, 'dateEnd');
    const date = parseDay(dateText);
    const sameDay = position.dateEnd === undefined || parseDay(endText) === date;
    if (position.date !== undefined && !date) undated += 1;

    rows.push({
      date: sameDay ? date : undefined,
      campaign,
      adGroup: level !== 'campaign' ? cell(cells, 'adGroup')?.trim() || meta.adGroup || undefined : undefined,
      keyword: level === 'keyword' ? cell(cells, 'keyword')?.trim() || undefined : undefined,
      spend: Math.round(spend * 100) / 100,
      impressions: parseNumber(cell(cells, 'impressions')),
      taps,
      installs,
    });
  }

  if (!rows.length) return { error: 'The header was found but no data rows followed it.' };
  if (undated) warnings.push(`${undated} row${undated === 1 ? '' : 's'} had a date that could not be read.`);
  if (skippedTotals) warnings.push(`Skipped ${skippedTotals} summary row${skippedTotals === 1 ? '' : 's'} (totals, or rows with no ${levelField === 'adGroup' ? 'ad group' : levelField} name).`);
  if (level === 'keyword' && rows.some((row) => !row.adGroup)) {
    warnings.push('Some keyword rows have no ad group. They will be matched to the ad group your users came from when that keyword exists in only one ad group.');
  }

  const dates = rows.map((row) => row.date).filter((value): value is string => !!value).sort();
  const hasDate = dates.length === rows.length;
  if (!hasDate && meta.start && meta.end) {
    warnings.push(`No day-by-day breakdown — totals will be spread evenly over ${meta.start} → ${meta.end}, the range written at the top of the report.`);
  }
  const totals = rows.reduce(
    (sum, row) => ({
      spend: sum.spend + row.spend,
      impressions: sum.impressions + row.impressions,
      taps: sum.taps + row.taps,
      installs: sum.installs + row.installs,
    }),
    { spend: 0, impressions: 0, taps: 0, installs: 0 },
  );
  totals.spend = Math.round(totals.spend * 100) / 100;

  return {
    level,
    hasDate,
    meta,
    campaigns: Array.from(new Set(rows.map((row) => row.campaign))),
    rows,
    columns,
    warnings,
    totals,
    dateRange: hasDate
      ? { start: dates[0], end: dates[dates.length - 1] }
      : meta.start && meta.end
        ? { start: meta.start, end: meta.end }
        : null,
  };
}
