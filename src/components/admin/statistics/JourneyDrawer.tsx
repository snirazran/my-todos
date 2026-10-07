'use client';

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';

type Journey = {
  profile: {
    id: string;
    name: string;
    email: string;
    createdAt: string | null;
    tier: string;
    onboarded: boolean;
    flies: number;
    streak: number;
    friends: number;
  };
  source: {
    channel: string;
    channelLabel: string;
    path: string[];
    paid: boolean;
    resolvedBy: string | null;
    status: string | null;
    platform: string | null;
    network: string | null;
    touch: Record<string, string> | null;
  };
  totals: Array<{ event: string; count: number; last: string }>;
  timeline: Array<{
    at: string;
    event: string;
    category: string;
    platform: string;
    beforeSignup: boolean;
    properties: Record<string, string | number | boolean>;
  }>;
  truncated: boolean;
  totalEvents: number;
};

const EVENT_LABELS: Record<string, string> = {
  app_opened: 'Opened the app',
  page_viewed: 'Viewed',
  account_created: 'Created an account',
  onboarding_completed: 'Finished onboarding',
  starter_plan_shown: 'Saw the starter plan',
  starter_plan_accepted: 'Accepted the starter plan',
  starter_plan_skipped: 'Skipped the starter plan',
  task_created: 'Created a task',
  task_completed: 'Completed a task',
  task_reopened: 'Un-completed a task',
  timer_started: 'Started a focus timer',
  timer_completed: 'Finished a focus session',
  quest_objective_claimed: 'Claimed a quest reward',
  fly_earned: 'Earned flies',
  fly_spent: 'Spent flies',
  skin_purchased: 'Bought an outfit item',
  item_equipped: 'Equipped an item',
  paywall_viewed: 'Saw the Plus paywall',
  paywall_step_viewed: 'Paywall step',
  purchase_started: 'Started a purchase',
  purchase_completed: 'Completed a purchase',
  purchase_cancelled: 'Cancelled a purchase',
  purchase_failed: 'Purchase failed',
  subscription_started: 'Subscription started',
  subscription_renewed: 'Subscription renewed',
  subscription_cancelled: 'Subscription cancelled',
  subscription_expired: 'Subscription expired',
  fly_pack_purchase_completed: 'Bought a fly pack',
  fly_shop_viewed: 'Opened the fly shop',
  ad_requested: 'Asked for a rewarded ad',
  ad_completed: 'Watched a rewarded ad',
  notification_opened: 'Opened a notification',
  referral_invite_shared: 'Shared an invite',
  referral_invite_opened: 'Opened an invite link',
  friend_link_opened: 'Opened a friend link',
};

const PROPERTY_KEYS = [
  'page',
  'task_type',
  'quest_category',
  'objective_type',
  'reward_amount',
  'fly_amount',
  'source',
  'placement',
  'plan',
  'product_id',
  'period_type',
  'revenue_usd',
  'pack_id',
  'method',
  'utm_source',
  'utm_campaign',
  'referrer_host',
  'notification_type',
  'duration_minutes',
  'streak_length',
];

function labelFor(event: string) {
  if (EVENT_LABELS[event]) return EVENT_LABELS[event];
  const text = event.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function propertyChips(properties: Record<string, string | number | boolean>) {
  return PROPERTY_KEYS.filter((key) => properties[key] !== undefined && properties[key] !== '')
    .slice(0, 4)
    .map((key) => (key === 'page' ? String(properties[key]) : `${key.replace(/_/g, ' ')}: ${String(properties[key])}`));
}

type Row = {
  key: string;
  time: string;
  label: string;
  chips: string[];
  count: number;
  beforeSignup: boolean;
  important: boolean;
};

const IMPORTANT = new Set([
  'account_created',
  'onboarding_completed',
  'task_completed',
  'subscription_started',
  'fly_pack_purchase_completed',
  'purchase_completed',
  'quest_objective_claimed',
]);

function groupTimeline(timeline: Journey['timeline']) {
  const days = new Map<string, Row[]>();
  for (const event of timeline) {
    const date = new Date(event.at);
    const day = date.toISOString().slice(0, 10);
    const chips = propertyChips(event.properties);
    const signature = `${event.event}|${chips.join('|')}`;
    const rows = days.get(day) ?? [];
    const last = rows[rows.length - 1];
    if (last && last.key === signature && last.beforeSignup === event.beforeSignup) {
      last.count += 1;
    } else {
      rows.push({
        key: signature,
        time: date.toISOString().slice(11, 16),
        label: labelFor(event.event),
        chips,
        count: 1,
        beforeSignup: event.beforeSignup,
        important: IMPORTANT.has(event.event),
      });
    }
    days.set(day, rows);
  }
  return Array.from(days.entries());
}

export function JourneyDrawer({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const [data, setData] = useState<Journey | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    setData(null);
    setError(null);
    fetch(`/api/admin/statistics/journey?id=${encodeURIComponent(userId)}`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error('This user could not be loaded');
        return response.json() as Promise<Journey>;
      })
      .then(setData)
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : 'This user could not be loaded');
      });
    return () => controller.abort();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [userId, onClose]);

  const grouped = useMemo(() => (data ? groupTimeline(data.timeline) : []), [data]);

  if (!userId) return null;

  const touch = data?.source.touch;
  const signupDay = data?.profile.createdAt?.slice(0, 10);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/30" />
      <aside className="relative flex h-full w-full max-w-[520px] flex-col border-l border-border bg-card shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold">{data?.profile.name || 'User journey'}</h2>
            <p className="truncate text-[13px] text-muted-foreground">
              {data ? `${data.profile.email || 'no email'} · ${data.profile.tier}` : 'Loading…'}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground/80">{userId}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}
          {!data && !error ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-12 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          ) : null}

          {data ? (
            <div className="space-y-5">
              <section className="rounded-lg border border-border p-3.5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Came from</p>
                <p className="mt-1 text-sm font-bold">
                  {data.source.path.filter((label) => label !== '(not set)').join(' › ')}
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
                  <dt className="text-muted-foreground">Matched by</dt>
                  <dd className="font-semibold">
                    {data.source.resolvedBy === 'revenuecat'
                      ? 'RevenueCat (ad network)'
                      : data.source.resolvedBy === 'utm'
                        ? 'UTM tags'
                        : data.source.resolvedBy === 'click_id'
                          ? 'Ad click id'
                          : data.source.resolvedBy === 'referral'
                            ? 'Invite link'
                            : data.source.resolvedBy === 'referrer'
                              ? 'Referring site'
                              : data.source.status === 'pending'
                                ? 'Waiting for ad match'
                                : 'Nothing to match'}
                  </dd>
                  <dt className="text-muted-foreground">Platform</dt>
                  <dd className="font-semibold">{data.source.platform ?? 'unknown'}</dd>
                  {touch?.landing ? (
                    <>
                      <dt className="text-muted-foreground">Landing page</dt>
                      <dd className="truncate font-semibold">{touch.landing}</dd>
                    </>
                  ) : null}
                  {touch?.referrer ? (
                    <>
                      <dt className="text-muted-foreground">Referrer</dt>
                      <dd className="truncate font-semibold">{touch.referrer}</dd>
                    </>
                  ) : null}
                  {touch?.at ? (
                    <>
                      <dt className="text-muted-foreground">First visit</dt>
                      <dd className="font-semibold">{touch.at.slice(0, 16).replace('T', ' ')}</dd>
                    </>
                  ) : null}
                  {['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].map((key) =>
                    touch?.[key] ? (
                      <div key={key} className="contents">
                        <dt className="text-muted-foreground">{key}</dt>
                        <dd className="truncate font-semibold">{touch[key]}</dd>
                      </div>
                    ) : null,
                  )}
                </dl>
              </section>

              <section className="grid grid-cols-4 gap-2 text-center">
                {[
                  { label: 'Signed up', value: signupDay ?? '—' },
                  { label: 'Flies', value: data.profile.flies },
                  { label: 'Streak', value: data.profile.streak },
                  { label: 'Friends', value: data.profile.friends },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-border px-2 py-2">
                    <p className="text-[11px] font-semibold text-muted-foreground">{item.label}</p>
                    <p className="mt-0.5 text-[13px] font-bold tabular-nums">{item.value}</p>
                  </div>
                ))}
              </section>

              <section>
                <h3 className="text-[13px] font-bold">Most frequent actions</h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {data.totals.slice(0, 12).map((row) => (
                    <span key={row.event} className="rounded-md border border-border bg-muted/40 px-2 py-1 text-[12px]">
                      {labelFor(row.event)} <span className="font-bold tabular-nums">{row.count}</span>
                    </span>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-[13px] font-bold">Timeline</h3>
                <p className="text-[12px] text-muted-foreground">
                  Oldest first, UTC. Repeats are folded into one line.
                  {data.truncated ? ` Showing the first 600 of ${data.totalEvents} events.` : ''}
                </p>
                <div className="mt-3 space-y-4">
                  {grouped.map(([day, rows]) => (
                    <div key={day}>
                      <p className="sticky top-0 bg-card py-1 text-[12px] font-bold text-muted-foreground">
                        {day}
                        {day === signupDay ? ' · signup day' : ''}
                      </p>
                      <ol className="mt-1 space-y-1 border-l border-border pl-3">
                        {rows.map((row, index) => (
                          <li key={`${row.key}-${index}`} className="text-[13px]">
                            <span className="mr-2 font-mono text-[11px] text-muted-foreground">{row.time}</span>
                            <span className={row.important ? 'font-bold' : ''}>{row.label}</span>
                            {row.count > 1 ? <span className="ml-1 text-muted-foreground">×{row.count}</span> : null}
                            {row.beforeSignup ? (
                              <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                before signup
                              </span>
                            ) : null}
                            {row.chips.length ? (
                              <span className="ml-1.5 text-[12px] text-muted-foreground">{row.chips.join(' · ')}</span>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
