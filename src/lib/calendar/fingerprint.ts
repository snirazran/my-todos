import { createHash } from 'crypto';
import type { NeutralEvent } from './types';

export function fingerprint(event: NeutralEvent): string {
  const rec = event.recurrence;
  const canonical = {
    title: event.title,
    notes: event.notes || '',
    allDay: event.allDay,
    startDate: event.startDate,
    startTime: event.startTime || '',
    endTime: event.endTime || '',
    timezone: event.timezone,
    recurrence: rec
      ? {
          freq: rec.freq,
          interval: rec.interval,
          byWeekday: [...(rec.byWeekday ?? [])].sort((a, b) => a - b),
          byMonthday: [...(rec.byMonthday ?? [])].sort((a, b) => a - b),
          until: rec.until || '',
        }
      : null,
    exdates: [...(event.exdates ?? [])].sort(),
    reminderMinutes: event.reminderMinutes ?? -1,
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
