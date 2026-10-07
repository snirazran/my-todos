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

export type ParsedSpend = {
  level: SpendLevel;
  hasDate: boolean;
  rows: ParsedSpendRow[];
  columns: Record<string, string>;
  warnings: string[];
  totals: { spend: number; impressions: number; taps: number; installs: number };
  dateRange: { start: string; end: string } | null;
};

type Field =
  | 'date'
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
  date: ['day', 'date', 'dateutc', 'reportingstarts', 'reportdate', 'byday', 'startdate'],
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
  for (let index = 0; index < Math.min(lines.length, 30); index += 1) {
    const delimiter = detectDelimiter(lines[index]);
    const cells = splitLine(lines[index], delimiter).map(headerKey);
    const hasCampaign = cells.some((cell) => ALIASES.campaign.includes(cell));
    const hasMetric = cells.some(
      (cell) =>
        ALIASES.spend.includes(cell) ||
        ALIASES.installs.includes(cell) ||
        ALIASES.taps.includes(cell) ||
        ALIASES.avgCpa.includes(cell),
    );
    if (hasCampaign && hasMetric) return { index, delimiter, cells };
  }
  return null;
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
        'Could not find a header row with a campaign column and at least one of Spend, Installs, or Taps. Export the report as CSV, or copy the whole table including its header row.',
    };
  }

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

  const rows: ParsedSpendRow[] = [];
  let undated = 0;
  for (const line of lines.slice(header.index + 1)) {
    const cells = splitLine(line, header.delimiter);
    const campaign = cell(cells, 'campaign')?.trim();
    if (!campaign || /^totals?\b/i.test(campaign) || /^grand total/i.test(campaign)) continue;

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
    const date = parseDay(dateText);
    if (position.date !== undefined && !date) undated += 1;

    rows.push({
      date,
      campaign,
      adGroup: level !== 'campaign' ? cell(cells, 'adGroup')?.trim() || undefined : undefined,
      keyword: level === 'keyword' ? cell(cells, 'keyword')?.trim() || undefined : undefined,
      spend: Math.round(spend * 100) / 100,
      impressions: parseNumber(cell(cells, 'impressions')),
      taps,
      installs,
    });
  }

  if (!rows.length) return { error: 'The header was found but no data rows followed it.' };
  if (undated) warnings.push(`${undated} row${undated === 1 ? '' : 's'} had a date that could not be read.`);

  const dates = rows.map((row) => row.date).filter((value): value is string => !!value).sort();
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
    hasDate: dates.length === rows.length,
    rows,
    columns,
    warnings,
    totals,
    dateRange: dates.length ? { start: dates[0], end: dates[dates.length - 1] } : null,
  };
}
