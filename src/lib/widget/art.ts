'use client';

import { dayIndex } from './words';

/**
 * Which frog illustration the medium and large widgets draw.
 *
 * The webview picks it rather than the native side, for the same reason it
 * picks the frog's line: the extension has no clock it can trust to match the
 * user's timezone, and a native random would reshuffle on every timeline
 * refresh — the frog would appear to teleport between outfits mid-day.
 */

export const WIDGET_ART = ['skater', 'astronaut', 'laptop'] as const;

export type WidgetArt = (typeof WIDGET_ART)[number];

/**
 * One illustration per day, in order. Random-with-replacement would repeat the
 * same frog two days running often enough to look stuck; a straight walk keeps
 * every one of the three in rotation.
 */
export function artForDay(day: string): WidgetArt {
  const index = dayIndex(day) % WIDGET_ART.length;
  return WIDGET_ART[(index + WIDGET_ART.length) % WIDGET_ART.length];
}
