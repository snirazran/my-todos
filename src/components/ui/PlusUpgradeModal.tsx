'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Check, Heart, Sparkles, Tag, Unlock, X } from 'lucide-react';
import dynamic from 'next/dynamic';

const Frog = dynamic(() => import('@/components/ui/frog'), { ssr: false });

type Step = 0 | 1 | 2 | 3;

type PlanId = 'yearly' | 'monthly';

const PLAN_DETAILS: Record<
  PlanId,
  { title: string; price: string; subtitle: string; badge?: string }
> = {
  yearly: {
    title: '12 Months',
    price: '249.90₪',
    subtitle: 'Try 7 days free',
    badge: 'BEST DEAL',
  },
  monthly: {
    title: 'Monthly',
    price: '34.90₪ every month',
    subtitle: 'Try 3 days free',
  },
};

export function PlusUpgradeModal({
  open,
  onClose,
  onStartTrial,
}: {
  open: boolean;
  onClose: () => void;
  onStartTrial?: (plan: PlanId) => void | Promise<void>;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [step, setStep] = useState<Step>(0);
  const [plan, setPlan] = useState<PlanId>('yearly');

  useEffect(() => {
    if (open) {
      setStep(0);
      setPlan('yearly');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [onClose, open]);

  if (!mounted) return null;

  const next = () => setStep((s) => (Math.min(3, s + 1) as Step));

  const trialReminderDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  })();

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <div
            onClick={onClose}
            className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 280 }}
            className="pointer-events-none fixed inset-0 z-[301] flex md:items-center md:justify-center md:p-6"
          >
            <div className="pointer-events-auto relative mx-auto flex h-full w-full flex-col overflow-hidden bg-[#6c6fce] text-white md:h-auto md:max-h-[calc(100dvh-3rem)] md:w-[min(100vw-3rem,28rem)] md:rounded-[32px] md:shadow-2xl">
              <button
                type="button"
                onClick={onClose}
                className="absolute left-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white transition-colors hover:bg-white/30"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>

              <AnimatePresence mode="wait">
                {step === 0 && (
                  <StepShell key="step-0">
                    <Step0
                      onContinue={next}
                      onMaybeLater={onClose}
                    />
                  </StepShell>
                )}
                {step === 1 && (
                  <StepShell key="step-1">
                    <Step1 onContinue={next} />
                  </StepShell>
                )}
                {step === 2 && (
                  <StepShell key="step-2">
                    <Step2 reminderDate={trialReminderDate} onContinue={next} />
                  </StepShell>
                )}
                {step === 3 && (
                  <StepShell key="step-3">
                    <Step3
                      plan={plan}
                      onSelect={setPlan}
                      onStart={async () => {
                        await onStartTrial?.(plan);
                        onClose();
                      }}
                    />
                  </StepShell>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function StepShell({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="relative flex h-full min-h-0 flex-1 flex-col"
    >
      {children}
    </motion.div>
  );
}

function PrimaryButton({
  onClick,
  children,
  disabled,
}: {
  onClick: () => void | Promise<void>;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-14 w-full rounded-2xl bg-white text-base font-black tracking-tight text-foreground shadow-sm transition-transform active:scale-[0.99] disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function Step0({
  onContinue,
  onMaybeLater,
}: {
  onContinue: () => void;
  onMaybeLater: () => void;
}) {
  return (
    <div className="flex h-full flex-col px-6 pb-8 pt-16">
      <div className="mx-auto mt-2 flex w-full max-w-md justify-center">
        <Frog width={170} height={170} indices={{ skin: 0, hat: 0, body: 0, hand_item: 0 }} />
      </div>
      <h2 className="mt-6 text-center text-2xl font-black tracking-tight">
        People with Plus are <span className="text-amber-300">2x better</span> at sticking
        with their goals!
      </h2>
      <div className="mt-7 space-y-4 rounded-2xl bg-white/10 p-5">
        <FeatureRow
          icon={<Unlock className="h-5 w-5 text-amber-300" />}
          title="Unlock your potential"
          subtitle="Turbo-charge your self-care with over 150 more exercises"
        />
        <FeatureRow
          icon={<Tag className="h-5 w-5 text-amber-300" />}
          title="Daily deals"
          subtitle="Discounts and customizations, just for you"
        />
        <FeatureRow
          icon={<Heart className="h-5 w-5 text-rose-300" fill="currentColor" />}
          title="Support our mission"
          subtitle="Help us keep making FrogTask the best app we can!"
        />
      </div>

      <div className="mt-auto space-y-3 pt-8">
        <PrimaryButton onClick={onContinue}>Try for $0.00</PrimaryButton>
        <button
          type="button"
          onClick={onMaybeLater}
          className="h-10 w-full text-center text-sm font-bold text-white/80 transition-colors hover:text-white"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}

function FeatureRow({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black leading-tight">{title}</p>
        <p className="mt-0.5 text-xs font-medium text-white/85">{subtitle}</p>
      </div>
    </div>
  );
}

const COMPARISON_ROWS: { label: string; free: boolean }[] = [
  { label: 'No ads', free: true },
  { label: 'Unlimited exercises', free: false },
  { label: 'Custom emojis', free: false },
  { label: 'Double rewards', free: false },
  { label: 'Daily shop deals', free: false },
];

function Step1({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="flex h-full flex-col px-6 pb-8 pt-16">
      <h2 className="text-2xl font-black tracking-tight">Have more fun with Plus!</h2>

      <div className="relative mt-8">
        <div className="absolute right-0 top-0 h-full w-[42%] rounded-2xl bg-white/15" />
        <div className="relative">
          <div className="grid grid-cols-[1fr_auto_auto] items-end gap-x-4 pb-3 text-sm font-black">
            <div />
            <div className="w-16 text-center text-white/85">Free</div>
            <div className="flex w-16 justify-center">
              <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-black text-foreground">
                PLUS
              </span>
            </div>
          </div>
          {COMPARISON_ROWS.map((row, i) => (
            <div
              key={row.label}
              className={`grid grid-cols-[1fr_auto_auto] items-center gap-x-4 py-4 text-sm font-bold ${
                i < COMPARISON_ROWS.length - 1 ? 'border-b border-white/15' : ''
              }`}
            >
              <span>{row.label}</span>
              <div className="flex w-16 justify-center">
                {row.free && <Check className="h-5 w-5 stroke-[3]" />}
              </div>
              <div className="flex w-16 justify-center">
                <Check className="h-5 w-5 stroke-[3]" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-auto pt-8">
        <PrimaryButton onClick={onContinue}>Try 7 days for free!</PrimaryButton>
      </div>
    </div>
  );
}

function Step2({
  reminderDate,
  onContinue,
}: {
  reminderDate: string;
  onContinue: () => void;
}) {
  return (
    <div className="flex h-full flex-col px-6 pb-8 pt-16">
      <h2 className="text-2xl font-black tracking-tight">
        We&apos;ll remind you <span className="text-amber-300">2 days</span> before your
        trial ends
      </h2>
      <p className="mt-3 text-sm font-medium text-white/90">
        You&apos;ll get a push notification on {reminderDate}.
      </p>

      <div className="mt-12 flex justify-center">
        <div className="relative">
          <Bell className="h-10 w-10 text-amber-300 absolute -right-6 -top-2 animate-pulse" />
          <Frog
            width={160}
            height={160}
            indices={{ skin: 0, hat: 0, body: 0, hand_item: 0 }}
          />
        </div>
      </div>

      <div className="mt-auto pt-8">
        <PrimaryButton onClick={onContinue}>Try it for free</PrimaryButton>
      </div>
    </div>
  );
}

function Step3({
  plan,
  onSelect,
  onStart,
}: {
  plan: PlanId;
  onSelect: (p: PlanId) => void;
  onStart: () => void | Promise<void>;
}) {
  return (
    <div className="flex h-full flex-col px-6 pb-8 pt-16">
      <h2 className="text-2xl font-black tracking-tight">
        Choose a plan for after your free trial
      </h2>

      <div className="mt-6 space-y-3">
        <PlanCard
          id="yearly"
          selected={plan === 'yearly'}
          onSelect={onSelect}
          badge={PLAN_DETAILS.yearly.badge}
          title={PLAN_DETAILS.yearly.title}
          price={
            <>
              249.90₪ <span className="line-through opacity-60">418.80₪</span>{' '}
              (20.82₪/month)
            </>
          }
          subtitle={PLAN_DETAILS.yearly.subtitle}
        />
        <PlanCard
          id="monthly"
          selected={plan === 'monthly'}
          onSelect={onSelect}
          title={PLAN_DETAILS.monthly.title}
          price={PLAN_DETAILS.monthly.price}
          subtitle={PLAN_DETAILS.monthly.subtitle}
        />
      </div>

      <div className="mt-8 flex justify-center">
        <Frog
          width={120}
          height={120}
          indices={{ skin: 0, hat: 0, body: 0, hand_item: 0 }}
        />
      </div>

      <div className="mt-auto space-y-2 pt-6 text-center">
        <p className="text-xs font-medium text-white/85">
          Recurring billing, cancel anytime.
        </p>
        <PrimaryButton onClick={onStart}>
          {plan === 'yearly' ? 'Start my free 7 days' : 'Start my free 3 days'}
        </PrimaryButton>
      </div>
    </div>
  );
}

function PlanCard({
  id,
  selected,
  onSelect,
  badge,
  title,
  price,
  subtitle,
}: {
  id: PlanId;
  selected: boolean;
  onSelect: (p: PlanId) => void;
  badge?: string;
  title: string;
  price: React.ReactNode;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={`relative w-full rounded-2xl px-5 py-4 text-left transition-all ${
        selected
          ? 'bg-white/15 ring-2 ring-white'
          : 'bg-white/10 ring-1 ring-white/15'
      }`}
    >
      {badge && (
        <span className="absolute right-4 top-4 rounded-md bg-white px-2 py-0.5 text-[10px] font-black tracking-wider text-foreground">
          {badge}
        </span>
      )}
      <p className="text-lg font-black tracking-tight">{title}</p>
      <p className="mt-1 text-sm font-bold text-white/90">{price}</p>
      <p className="mt-0.5 text-xs font-medium text-white/75">{subtitle}</p>
    </button>
  );
}
