'use client';

import { useState } from 'react';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import CalendarConnectSheet from '@/components/ui/CalendarConnectSheet';
import { useCalendarConnections } from '@/hooks/useCalendarSync';
import { isPlannerTourLocked } from '@/lib/tour/plannerTour';
import { hapticSelect } from '@/lib/haptics';

function timeAgo(iso?: string | null) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 90_000) return 'just now';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * Lives at the foot of the planner's month calendar — the one place in the app
 * where the user is already thinking in dates. Offers the connection when there
 * isn't one, and otherwise stays a status line unless the sync needs a hand.
 */
export default function CalendarSyncRow() {
  const { connections, available, loaded } = useCalendarConnections();
  const [sheetOpen, setSheetOpen] = useState(false);
  // The tour opens this calendar for its own step, with a coach bar pinned over
  // the bottom of the screen. Read once at mount: the row is remounted every
  // time the calendar opens, so it never goes stale.
  const [duringTour] = useState(isPlannerTourLocked);

  const nothingAvailable = available && !available.google && !available.apple;
  const healthy = connections.find(
    (c) => c.status === 'active' || c.status === 'error',
  );
  const broken = connections.find(
    (c) =>
      c.status === 'paused' ||
      c.status === 'reauth_required' ||
      c.status === 'disconnected',
  );

  if (duringTour) return null;
  if (!loaded || (nothingAvailable && connections.length === 0)) return null;

  const open = () => {
    hapticSelect();
    setSheetOpen(true);
  };

  return (
    <>
      {healthy && !broken ? (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-[11.5px] font-bold text-muted-foreground">
          <Icon
            name={healthy.provider === 'google' ? 'googleCalendar' : 'appleCalendar'}
            className="h-3.5 w-3.5"
          />
          <span>
            {healthy.provider === 'google' ? 'Google Calendar' : 'Apple Calendar'} synced
            {timeAgo(healthy.lastSyncedAt) ? ` · ${timeAgo(healthy.lastSyncedAt)}` : ''}
          </span>
        </p>
      ) : broken ? (
        <button
          type="button"
          onClick={open}
          className="mt-3 flex w-full items-center gap-2.5 rounded-2xl bg-amber-100 px-3 py-2.5 text-left text-amber-800 transition-colors hover:bg-amber-200/70 active:scale-[0.99] dark:bg-amber-400/15 dark:text-amber-200"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-black leading-tight">
              Calendar sync needs a hand
            </span>
            <span className="mt-0.5 block text-[11px] font-bold leading-snug opacity-75">
              Sign in again to start it back up
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
        </button>
      ) : (
        <button
          type="button"
          data-hint="calendar-sync-row"
          onClick={open}
          className="mt-3 flex w-full items-center gap-3 rounded-2xl bg-muted/60 px-3 py-2.5 text-left transition-colors hover:bg-muted active:scale-[0.99]"
        >
          <span className="flex shrink-0 -space-x-2">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-black/5">
              <Icon name="googleCalendar" className="h-5 w-5" />
            </span>
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-black/5">
              <Icon name="appleCalendar" className="h-5 w-5" />
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-black leading-tight">
              Sync your calendar
            </span>
            <span className="mt-0.5 block text-[11px] font-bold leading-snug text-muted-foreground">
              Your events land on these days automatically
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      )}

      <CalendarConnectSheet open={sheetOpen} onOpenChange={setSheetOpen} source="planner_row" />
    </>
  );
}
