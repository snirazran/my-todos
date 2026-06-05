'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from '@/components/ui/Icon';
import { AppImage } from '@/components/ui/AppImage';
import { Bell, Check, Heart, Image as ImageIcon, Shirt, Sparkle, Sparkles, Tag, Unlock, X } from 'lucide-react';
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
            className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 280 }}
            className="pointer-events-none fixed inset-0 z-[9999] flex md:items-center md:justify-center md:p-6"
          >
            <div className="pointer-events-auto relative mx-auto flex h-full w-full flex-col overflow-y-auto bg-[#6c6fce] text-white md:h-[min(720px,calc(100dvh-3rem))] md:w-[min(100vw-3rem,28rem)] md:rounded-[32px] md:shadow-2xl">
              <button
                type="button"
                onClick={onClose}
                className="absolute left-4 top-[calc(1rem+env(safe-area-inset-top))] z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white transition-colors hover:bg-white/30"
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
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="relative flex min-h-full flex-1 flex-col"
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
    <div className="flex min-h-full flex-col pb-8">
      <div className="relative -mt-px h-[40vh] min-h-[260px] w-full overflow-hidden md:h-56 md:min-h-0">
        <AppImage
          src="/premium-cover.webp"
          priority
          className="h-full w-full object-cover object-top"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-b from-transparent to-[#6c6fce]" />
      </div>
      <div className="flex flex-1 flex-col px-6 pb-6 md:pb-5">
      <h2 className="mt-2 text-center text-xl font-black tracking-tight md:text-2xl">
        People with Plus are <span className="text-amber-300">2x better</span> at sticking
        with their goals!
      </h2>
      <div className="mt-5 space-y-3 rounded-2xl bg-white/10 p-4 md:mt-6">
        <FeatureRow
          icon={<Unlock className="h-5 w-5 text-amber-300" />}
          title="Improve in all areas"
          subtitle="Unlimited tags and quests, focus on more areas and earn more rewards!"
        />
        <FeatureRow
          icon={<span className="text-sm font-black text-amber-300">×2</span>}
          title="Double rewards"
          subtitle="Earn double rewards from quests and tasks!"
        />
        <FeatureRow
          icon={<Sparkle className="h-5 w-5 text-amber-300" />}
          title="Season plus rewards"
          subtitle="Instantly unlock all Season Plus rewards!"
        />
        <FeatureRow
          icon={<Heart className="h-5 w-5 text-rose-300" fill="currentColor" />}
          title="Support our mission"
          subtitle="Help us keep making Frogress the best app we can!"
        />
      </div>

      <div className="mt-auto space-y-2 pt-6 md:pt-5">
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
  { label: 'Unlimited quests', free: false },
  { label: 'Unlimited tags', free: false },
  { label: 'Double rewards', free: false },
  { label: 'Season plus rewards', free: false },
  { label: 'Plus only skins', free: false },
  { label: 'Plus only backgrounds', free: false },
];

function randomIndices() {
  const rand = (n: number) => Math.floor(Math.random() * n);
  return {
    skin: rand(4),
    hat: rand(6),
    body: rand(4),
    hand_item: rand(4),
  };
}

function Step1({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="flex min-h-full flex-col px-6 pb-6 pt-16 md:pb-5 md:pt-12">
      <h2 className="text-center text-2xl font-black tracking-tight">Have more fun with Plus!</h2>

      <div className="relative mt-8">
        {/* PLUS column highlight */}
        <div className="absolute -right-3 -top-3 -bottom-3 w-[6.5rem] overflow-hidden rounded-2xl bg-white/15">
          {/* Three evenly-spaced lanes with staggered timing for a calm, flowing stream */}
          <FloatingSparkle delay={0.0} left="22%" size={14} duration={3.6} spin={180} />
          <FloatingSparkle delay={1.2} left="22%" size={20} duration={3.6} spin={180} />
          <FloatingSparkle delay={2.4} left="22%" size={11} duration={3.6} spin={180} />

          <FloatingSparkle delay={0.6} left="50%" size={18} duration={3.6} spin={180} />
          <FloatingSparkle delay={1.8} left="50%" size={12} duration={3.6} spin={180} />
          <FloatingSparkle delay={3.0} left="50%" size={22} duration={3.6} spin={180} />

          <FloatingSparkle delay={0.3} left="78%" size={11} duration={3.6} spin={180} />
          <FloatingSparkle delay={1.5} left="78%" size={16} duration={3.6} spin={180} />
          <FloatingSparkle delay={2.7} left="78%" size={13} duration={3.6} spin={180} />
        </div>

        <div className="relative">
          <div className="grid grid-cols-[1fr_5rem_5rem] items-center pb-3 text-sm font-black">
            <div />
            <div className="text-center text-white/90">Free</div>
            <div className="flex justify-center">
              <span className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-black tracking-wider text-foreground">
                PLUS
              </span>
            </div>
          </div>
          {COMPARISON_ROWS.map((row, i) => (
            <div
              key={row.label}
              className={`grid grid-cols-[1fr_5rem_5rem] items-center py-4 text-sm font-bold ${
                i < COMPARISON_ROWS.length - 1 ? 'border-b border-white/20' : ''
              }`}
            >
              <span>{row.label}</span>
              <div className="flex justify-center">
                {row.free && <Check className="h-5 w-5 stroke-[3]" />}
              </div>
              <div className="flex justify-center">
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
  const step2Indices = React.useMemo(() => randomIndices(), []);
  return (
    <div className="flex min-h-full flex-col px-6 pb-6 pt-16 md:pb-5 md:pt-12">
      <h2 className="text-center text-2xl font-black tracking-tight">
        We&apos;ll remind you <span className="text-amber-300">2 days</span> before your
        trial ends
      </h2>
      <p className="mt-3 text-center text-sm font-medium text-white/90">
        You&apos;ll get a push notification on {reminderDate}.
      </p>

      <div className="mt-12 flex justify-center">
        <Frog width={240} height={240} indices={step2Indices} />
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
    <div className="flex min-h-full flex-col px-6 pb-6 pt-16 md:pb-5 md:pt-12">
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

      <div className="flex flex-1 items-center justify-center">
        <Icon
          name="frogPlus"
          className="h-44 w-44 drop-shadow-[0_5px_0_rgba(0,0,0,0.3)]"
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

function FloatingSparkle({
  delay,
  left,
  size,
  duration,
  spin,
}: {
  delay: number;
  left: string;
  size: number;
  duration: number;
  spin: number;
}) {
  return (
    <motion.div
      className="pointer-events-none absolute"
      style={{ left, bottom: -size }}
      initial={{ y: 0, opacity: 0, rotate: 0 }}
      animate={{ y: -280, opacity: [0, 1, 1, 0], rotate: spin }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: 'linear',
        times: [0, 0.15, 0.8, 1],
      }}
    >
      <Sparkle
        style={{ width: size, height: size }}
        className="text-white/80"
        fill="currentColor"
      />
    </motion.div>
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
