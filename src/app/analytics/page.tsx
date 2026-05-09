'use client';

import React from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import { format, subDays } from 'date-fns';
import useSWR from 'swr';
import { Brain, Lock, ShieldCheck, AlertTriangle, Target, CheckCircle2, Sparkles, ChevronLeft } from 'lucide-react';
import ProgressCoach from '@/components/coach/ProgressCoach';
import { useRouter } from 'next/navigation';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

export default function ProgressCoachPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const { data: questsData } = useSWR<{ isPremium?: boolean }>(
    user ? `/api/quests?view=home&timezone=${encodeURIComponent(timezone)}` : null,
    (url: string) => fetch(url).then((res) => res.json()),
    { revalidateOnFocus: false }
  );

  const isPremium = !!questsData?.isPremium;
  const coachHistoryFrom = format(subDays(new Date(), 6), 'yyyy-MM-dd');
  const coachHistoryTo = format(new Date(), 'yyyy-MM-dd');

  const { data: historyData, isLoading: historyLoading } = useSWR<any[]>(
    user
      ? `/api/history?from=${coachHistoryFrom}&to=${coachHistoryTo}&timezone=${encodeURIComponent(timezone)}`
      : null,
    (url: string) => fetch(url).then((res) => res.json()),
    { revalidateOnFocus: false }
  );

  const { data: tagsData } = useSWR<any[]>(
    user ? '/api/tags' : null,
    (url: string) => fetch(url).then((res) => res.json())
  );

  if (loading || historyLoading) return <LoadingScreen />;
  if (!user) {
    router.push('/login');
    return null;
  }

  return (
    <main className="min-h-screen bg-background pb-20 md:pb-10">
      {/* Header */}
      <div className="sticky top-0 z-40 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Brain className="h-5 w-5" />
            </div>
            <h1 className="text-lg font-black uppercase tracking-wider">Progress Coach</h1>
          </div>
          <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-primary">
            {isPremium ? 'Pro' : 'Locked'}
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-3xl p-4 md:p-6">
        {isPremium ? (
          <ProgressCoach
            historyData={historyData || []}
            dateRange="7d"
            selectedTags={[]}
            availableTags={tagsData || []}
          />
        ) : (
          <div className="space-y-6">
             <section className="overflow-hidden rounded-[30px] border border-primary/20 bg-card/80 shadow-sm">
        <div className="border-b border-border/50 bg-primary/[0.04] p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20">
              <Lock className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2">
                <span className="rounded-full bg-primary px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-primary-foreground">
                  Pro coach
                </span>
              </div>
              <h3 className="text-xl font-black leading-tight tracking-tight text-foreground">
                Know exactly what to change next.
              </h3>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-muted-foreground">
                Progress Coach reads your recent tasks, tags, and focus sessions, then turns them into a simple plan.
              </p>
            </div>
          </div>
        </div>

        <div className="p-5">
          <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            <Brain className="h-4 w-4 text-primary" />
            Preview
          </div>
          <div className="space-y-3">
            <div className="rounded-[24px] border border-border/50 bg-background/70 p-4">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                <Brain className="h-4 w-4 text-primary" />
                Main insight
              </div>
              <p className="mt-2 text-sm font-black leading-snug text-foreground">
                Your progress drops when tasks stay vague or pile up on the same day.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
               <div className="rounded-[22px] border border-emerald-500/20 bg-emerald-500/[0.04] text-emerald-600 dark:text-emerald-400 p-3 shadow-sm">
                  <div className="mb-2 flex items-center gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-background/70">
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <div className="text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground">Works</div>
                  </div>
                  <p className="text-sm font-black leading-snug text-foreground">Short, specific lists get finished.</p>
               </div>
               <div className="rounded-[22px] border border-amber-500/20 bg-amber-500/[0.05] text-amber-600 dark:text-amber-400 p-3 shadow-sm">
                  <div className="mb-2 flex items-center gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-background/70">
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                    <div className="text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground">Adjust</div>
                  </div>
                  <p className="text-sm font-black leading-snug text-foreground">Open-ended reminders are easier to miss.</p>
               </div>
            </div>

            <div className="rounded-[24px] border border-primary/20 bg-primary/[0.04] p-4">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                <Target className="h-4 w-4 text-primary" />
                Do next
              </div>
              <div className="mt-3 space-y-2">
                {[
                  'Keep busy days to 3 important tasks.',
                  'Schedule one soft reminder for a fixed time.',
                  'Start a focus session on your hardest task.',
                ].map((step, index) => (
                  <div key={step} className="flex items-start gap-3 rounded-2xl bg-background/70 px-3 py-2.5">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <span className="text-[11px] font-black">{index + 1}</span>
                    </div>
                    <p className="text-sm font-bold leading-snug text-foreground">
                      {step}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-primary/15 bg-primary/[0.04] px-2 py-3 text-center text-[11px] font-black leading-tight text-primary shadow-sm">Less guessing</div>
        <div className="rounded-2xl border border-primary/15 bg-primary/[0.04] px-2 py-3 text-center text-[11px] font-black leading-tight text-primary shadow-sm">Better planning</div>
        <div className="rounded-2xl border border-primary/15 bg-primary/[0.04] px-2 py-3 text-center text-[11px] font-black leading-tight text-primary shadow-sm">Clear next steps</div>
      </section>

      <section className="rounded-[26px] border border-border/60 bg-card/70 p-4 shadow-sm">
        <div className="space-y-2">
          {[
            'Find the pattern behind missed tasks.',
            'Separate what works from what needs adjusting.',
            'Get a short plan you can use before planning tomorrow.',
          ].map((item) => (
            <div key={item} className="flex items-start gap-2.5">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-sm font-bold leading-snug text-foreground">
                {item}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-black uppercase tracking-wider text-primary-foreground shadow-sm">
          <Sparkles className="h-4 w-4" />
          Unlock Progress Coach
        </div>
      </section>
          </div>
        )}
      </div>
    </main>
  );
}
