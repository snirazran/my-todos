import type { Metadata } from 'next';
import Link from 'next/link';
import { Check } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Pricing | Frogress',
  description:
    'Frogress is free to use. Frogress Plus unlocks unlimited quests and tags, double rewards, season plus rewards, and exclusive skins and backgrounds.',
};

const COMPARISON_ROWS: { label: string; free: boolean }[] = [
  { label: 'Tasks, planner, and focus timer', free: true },
  { label: 'Quests, streaks, and rewards', free: true },
  { label: 'Friends and buddy tasks', free: true },
  { label: 'Unlimited quests', free: false },
  { label: 'Unlimited tags', free: false },
  { label: 'Double rewards on quests and tasks', free: false },
  { label: 'Season plus rewards', free: false },
  { label: 'Plus-only skins', free: false },
  { label: 'Plus-only backgrounds', free: false },
];

export default function PricingPage() {
  return (
    <div className="min-h-full bg-background">
      <section className="mx-auto flex w-full max-w-4xl flex-col px-5 py-10 sm:px-8 md:py-14">
        <div className="mb-10 text-center">
          <Link
            href="/welcome"
            className="text-sm font-bold text-primary underline-offset-4 hover:underline"
          >
            Back to Frogress
          </Link>
          <h1 className="mt-5 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
            Pricing
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm font-medium leading-6 text-muted-foreground sm:text-base">
            Frogress is free to use. Frogress Plus is an optional subscription
            that unlocks more quests, double rewards, and exclusive cosmetics
            for your frog.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="relative flex flex-col rounded-[28px] border-2 border-primary bg-card p-6 shadow-sm">
            <span className="absolute right-5 top-5 rounded-lg bg-primary px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-primary-foreground">
              Best deal
            </span>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-muted-foreground">
              Frogress Plus — Yearly
            </p>
            <p className="mt-3 text-4xl font-black tracking-tight text-foreground">
              $69.99
              <span className="text-base font-bold text-muted-foreground">
                &nbsp;/ year
              </span>
            </p>
            <p className="mt-1 text-sm font-bold text-muted-foreground">
              About $5.83 per month
            </p>
            <p className="mt-4 text-sm font-black text-primary">
              7-day free trial, then $69.99 per year until cancelled
            </p>
          </div>

          <div className="flex flex-col rounded-[28px] border border-border bg-card p-6 shadow-sm">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-muted-foreground">
              Frogress Plus — Monthly
            </p>
            <p className="mt-3 text-4xl font-black tracking-tight text-foreground">
              $9.99
              <span className="text-base font-bold text-muted-foreground">
                &nbsp;/ month
              </span>
            </p>
            <p className="mt-1 text-sm font-bold text-muted-foreground">
              Billed every month
            </p>
            <p className="mt-4 text-sm font-black text-primary">
              3-day free trial, then $9.99 per month until cancelled
            </p>
          </div>
        </div>

        <div className="mt-10 rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm backdrop-blur sm:p-8">
          <h2 className="text-lg font-black tracking-tight text-foreground">
            What you get
          </h2>
          <div className="mt-4">
            <div className="grid grid-cols-[1fr_4rem_4rem] items-center border-b border-border pb-3 text-sm font-black text-foreground sm:grid-cols-[1fr_6rem_6rem]">
              <span />
              <span className="text-center">Free</span>
              <span className="text-center text-primary">Plus</span>
            </div>
            {COMPARISON_ROWS.map((row) => (
              <div
                key={row.label}
                className="grid grid-cols-[1fr_4rem_4rem] items-center border-b border-border/60 py-3.5 text-sm font-bold text-muted-foreground last:border-b-0 sm:grid-cols-[1fr_6rem_6rem]"
              >
                <span>{row.label}</span>
                <span className="flex justify-center">
                  {row.free && (
                    <Check className="h-5 w-5 stroke-[3] text-foreground" />
                  )}
                </span>
                <span className="flex justify-center">
                  <Check className="h-5 w-5 stroke-[3] text-primary" />
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 space-y-3 rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm backdrop-blur sm:p-8">
          <h2 className="text-lg font-black tracking-tight text-foreground">
            Billing details
          </h2>
          <p className="text-sm font-medium leading-7 text-muted-foreground">
            You can subscribe to Frogress Plus inside the app on the web, iOS,
            or Android. Web purchases are processed securely by Paddle.com, our
            merchant of record. Purchases inside the mobile apps are processed
            by the Apple App Store or Google Play.
          </p>
          <p className="text-sm font-medium leading-7 text-muted-foreground">
            Subscriptions renew automatically at the end of each billing period
            until cancelled. You can cancel anytime, and your Plus access keeps
            running until the end of the period you paid for. Free trials
            convert to a paid subscription unless cancelled before the trial
            ends.
          </p>
          <p className="text-sm font-medium leading-7 text-muted-foreground">
            Prices are shown in US dollars (USD) and match the price at
            checkout; if you pay in another currency, the equivalent amount is
            shown before you confirm. Taxes may apply and will be calculated
            at checkout. See our Refund Policy for how refunds and
            cancellations work.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-3 text-sm font-bold">
          <Link
            href="/welcome"
            className="rounded-xl bg-primary px-5 py-2.5 text-primary-foreground hover:bg-primary/90"
          >
            Try Frogress free
          </Link>
          <Link
            href="/refund-policy"
            className="rounded-xl border border-border bg-card px-4 py-2.5 text-foreground hover:bg-muted/50"
          >
            Refund Policy
          </Link>
          <Link
            href="/terms"
            className="rounded-xl border border-border bg-card px-4 py-2.5 text-foreground hover:bg-muted/50"
          >
            Terms of Service
          </Link>
          <Link
            href="/privacy"
            className="rounded-xl border border-border bg-card px-4 py-2.5 text-foreground hover:bg-muted/50"
          >
            Privacy Policy
          </Link>
        </div>
      </section>
    </div>
  );
}
