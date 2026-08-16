/**
 * Every streak a shield is allowed to rescue. Adding one here plus a cooldown
 * entry is the whole integration — the rescue accounting is system-agnostic.
 */
export const SHIELD_SYSTEMS = ['login', 'pact'] as const;
export type ShieldSystem = (typeof SHIELD_SYSTEMS)[number];

export type ShieldOfferState = {
  /** Day the popup last appeared on its own. Manual opens never write here. */
  lastShownDayKey: string;
  /** Consecutive auto-shows closed without buying, for the backoff. */
  dismissals: number;
  lastPurchaseDayKey: string;
};

export type ShieldState = {
  count: number;
  /** Last day each system spent a shield, for the per-system cooldown. */
  lastRescueDayKey: Partial<Record<ShieldSystem, string>>;
  /** Lifetime rescues, per system. Analytics and copy only. */
  rescues: Partial<Record<ShieldSystem, number>>;
  /** Month key of the last Plus grant, so it pays once per calendar month. */
  grantMonth: string;
  offer: ShieldOfferState;
  /** The one-time merge of loginStreak.freezes + pactStreak.shields. */
  merged: boolean;
};

export type ShieldConfigView = {
  isActive: boolean;
  priceFlies: number;
  twoPackPriceFlies: number;
  capFree: number;
  capPlus: number;
  plusMonthlyGrant: number;
  rescueCooldownDays: number;
  offerCooldownDays: number;
  offerMinStreak: number;
  earnEveryPactWeeks: number;
};

/** Why the sheet opened. Manual taps carry no reason. */
export type ShieldOfferReason = 'missed' | 'at_risk';

export type ShieldOffer = {
  reason: ShieldOfferReason;
  system: ShieldSystem;
  /** Days for the login streak, kept weeks for the pact. */
  atStake: number;
};

export type ShieldView = {
  isActive: boolean;
  count: number;
  cap: number;
  priceFlies: number;
  twoPackPriceFlies: number;
  isPremium: boolean;
  /** Systems currently inside their rescue cooldown, with the day it lifts. */
  cooldowns: Partial<Record<ShieldSystem, string>>;
  offer: ShieldOffer | null;
};
