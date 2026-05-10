export const pad = (n: number) => String(n).padStart(2, '0');

export function ymdLocal(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseYmdLocal(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatTimeDisplay(t: string) {
  if (!t) return '--:--';
  const [hh, mm] = t.split(':').map(Number);
  const suffix = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 || 12;
  return `${h12}:${pad(mm)} ${suffix}`;
}

export const fetcher = (url: string) => fetch(url).then((r) => r.json());

import { apiDayFromDisplay, type ApiDay, type DisplayDay } from '@/components/board/helpers';

export type RepeatMode = 'none' | 'daily' | 'weekdays' | 'weekly';

const ALL_DISPLAY_DAYS: DisplayDay[] = [0, 1, 2, 3, 4, 5, 6];

export function allDisplayDays(): DisplayDay[] {
  return [...ALL_DISPLAY_DAYS];
}

export function weekdayDisplayDays(
  daysOrder?: ReadonlyArray<Exclude<ApiDay, -1>>,
): DisplayDay[] {
  return ALL_DISPLAY_DAYS.filter((d) => {
    const api = apiDayFromDisplay(d, daysOrder);
    return api >= 1 && api <= 5;
  });
}

export function repeatModeFor(
  pickedDays: ReadonlyArray<DisplayDay>,
  repeat: 'this-week' | 'weekly',
  daysOrder?: ReadonlyArray<Exclude<ApiDay, -1>>,
): RepeatMode {
  if (repeat !== 'weekly') return 'none';
  const real = pickedDays.filter((d) => d !== 7);
  if (real.length >= 7) return 'daily';
  const apiDays = real.map((d) => apiDayFromDisplay(d, daysOrder));
  const set = new Set(apiDays);
  const isWeekdays =
    apiDays.length === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d as ApiDay));
  return isWeekdays ? 'weekdays' : 'weekly';
}
