'use client';

import { create } from 'zustand';
import type { FrogEmote } from '@/lib/frogEmotes';

const MOOD_EMOTE: Record<string, FrogEmote> = {
  happy: 'hop',
  nervous: 'sweat',
  hungry: 'question',
  proud: 'celebrate',
  party: 'tada',
  relief: 'sweat',
  flies: 'love',
  strong: 'hop',
  finish: 'hop',
  sleepy: 'loveShy',
};

const FRESH_MS = 60_000;

export type PushGreeting = { text: string; emote: FrogEmote; at: number };

export const usePushGreeting = create<{ greeting: PushGreeting | null }>(
  () => ({ greeting: null }),
);

export function setPushGreeting(text: string | undefined, mood: unknown) {
  const line = text?.trim();
  if (!line || typeof mood !== 'string') return;
  usePushGreeting.setState({
    greeting: { text: line, emote: MOOD_EMOTE[mood] ?? 'hop', at: Date.now() },
  });
}

export function takePushGreeting(): PushGreeting | null {
  const { greeting } = usePushGreeting.getState();
  if (!greeting) return null;
  usePushGreeting.setState({ greeting: null });
  return Date.now() - greeting.at > FRESH_MS ? null : greeting;
}
