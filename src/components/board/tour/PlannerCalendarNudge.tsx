'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import { useIntros } from '@/hooks/useIntros';
import { useNudge } from '@/hooks/useNudge';
import { useCalendarConnections } from '@/hooks/useCalendarSync';
import CalendarConnectSheet from '@/components/ui/CalendarConnectSheet';
import { TOUR_ENDED_EVENT } from '@/lib/tour/plannerTour';

/** Long enough for the gift overlay to clear the screen first. */
const AFTER_TOUR_DELAY_MS = 1200;
/** A skip has no gift to wait out, but still deserves a beat of quiet. */
const AFTER_SKIP_DELAY_MS = 700;
/** An unprompted ask waits until the board has settled. */
const PACED_DELAY_MS = 1500;

/**
 * The one moment the app asks for a calendar: straight after the planner tour,
 * where the user has just learned to move work between days and the offer is
 * "now let the days fill themselves". A skip lands here too — the tour is off
 * the screen either way, and this is the ask the first run was building to.
 */
export default function PlannerCalendarNudge() {
  const { user } = useAuth();
  const { seenIntros } = useIntros(!!user);
  const { connections, available, loaded } = useCalendarConnections();
  const [open, setOpen] = useState(false);

  const anyProvider = !available || available.google || available.apple;
  const eligible =
    !!user && loaded && anyProvider && connections.length === 0;

  // Whether the tour was already behind the user when this page mounted, frozen
  // at first load. Ending the tour flips the live flag straight away, and gating
  // on that would arm the paced ask on top of the one the tour's own end is
  // about to present.
  const [tourWasSeen, setTourWasSeen] = useState<boolean | null>(null);
  useEffect(() => {
    if (seenIntros && tourWasSeen === null) {
      setTourWasSeen(!!seenIntros.plannerTour);
    }
  }, [seenIntros, tourWasSeen]);

  const { show, dismiss, engage, present } = useNudge('planner_calendar', {
    enabled: eligible && tourWasSeen === true,
    delayMs: PACED_DELAY_MS,
  });

  const presentRef = useRef(present);
  presentRef.current = present;
  const eligibleRef = useRef(eligible);
  eligibleRef.current = eligible;

  useEffect(() => {
    let timer = 0;
    const onEnded = (event: Event) => {
      const completed = !!(event as CustomEvent<{ completed?: boolean }>).detail
        ?.completed;
      timer = window.setTimeout(
        () => {
          if (eligibleRef.current) presentRef.current();
        },
        completed ? AFTER_TOUR_DELAY_MS : AFTER_SKIP_DELAY_MS,
      );
    };
    window.addEventListener(TOUR_ENDED_EVENT, onEnded);
    return () => {
      window.removeEventListener(TOUR_ENDED_EVENT, onEnded);
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (show) setOpen(true);
  }, [show]);

  // The sheet holds a success beat open for a moment after connecting and then
  // closes itself, so the close handler has to know which outcome it is closing
  // on — otherwise a connection would be recorded as a dismissal.
  const connectedRef = useRef(false);

  const close = useCallback(
    (next: boolean) => {
      if (next) return;
      setOpen(false);
      if (connectedRef.current) engage();
      else dismiss();
      connectedRef.current = false;
    },
    [dismiss, engage],
  );

  return (
    <CalendarConnectSheet
      open={open}
      onOpenChange={close}
      onConnected={() => {
        connectedRef.current = true;
      }}
      eyebrow="One last thing"
      dismissLabel="Not now"
    />
  );
}
