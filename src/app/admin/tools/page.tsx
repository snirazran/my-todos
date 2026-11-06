'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { mutate } from 'swr';
import {
  AlertTriangle,
  Bell,
  Bug,
  CalendarCheck,
  DollarSign,
  Gift,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Wind,
  Wrench,
} from 'lucide-react';
import {
  AdminCard,
  AdminPage,
  IconTile,
  Notice,
  PondButton,
  ToggleRow,
  type Tone,
} from '@/components/admin/kit';
import { useUIStore } from '@/lib/uiStore';
import { PlusWelcomeCelebration } from '@/components/ui/PlusWelcome';
import { cn } from '@/lib/utils';

type Template = { id: string; label: string; preview: string };

type ResetAction = {
  key: string;
  title: string;
  description: string;
  warning: string;
  endpoint: string;
  icon: React.ReactNode;
  tone: Tone;
  onDone?: () => void;
};

const RESETS: ResetAction[] = [
  {
    key: 'refresh-quests',
    title: 'Restart quests',
    description: 'Wipe every quest, counter and focus area. Onboarding starts over.',
    warning: 'Deletes all onboarding and daily quest progress, every quest counter, your focus areas and their tag links.',
    endpoint: '/api/admin/reset-quests',
    icon: <RefreshCw />,
    tone: 'sun',
    onDone: () => mutate((key) => typeof key === 'string' && key.startsWith('/api/quests')),
  },
  {
    key: 'reset-pacts',
    title: 'Reset Leaps',
    description: 'Clear your Leap streak, weeks and Lily progress. Tasks stay.',
    warning: 'Clears your Leap streak, every recorded Leap week, your Lily progress and old weekly-pact history.',
    endpoint: '/api/admin/reset-leap',
    icon: <CalendarCheck />,
    tone: 'sky',
    onDone: () => mutate((key) => typeof key === 'string' && key.startsWith('/api/leap')),
  },
  {
    key: 'reset-daily',
    title: 'Reset daily reward',
    description: "Lets you claim today's reward again.",
    warning: "Resets today's reward claim.",
    endpoint: '/api/admin/reset-daily-reward',
    icon: <Gift />,
    tone: 'pond',
  },
  {
    key: 'reset-cash',
    title: 'Empty fly balance',
    description: 'Set your flies to 0.',
    warning: 'Sets your fly balance to 0.',
    endpoint: '/api/admin/reset-cash',
    icon: <DollarSign />,
    tone: 'berry',
  },
  {
    key: 'reset-tasks',
    title: 'Delete tasks & stats',
    description: 'Clear all tasks, history and milestones.',
    warning: 'Permanently deletes all your tasks and progress.',
    endpoint: '/api/admin/reset-tasks',
    icon: <Trash2 />,
    tone: 'danger',
  },
];

export default function AdminToolsPage() {
  const { isDebugMode, setIsDebugMode } = useUIStore();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [taskCount, setTaskCount] = useState(0);
  const [tokenCount, setTokenCount] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/test-notification', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setTemplates(data.templates ?? []);
        setTaskCount(data.taskCount ?? 0);
        setTokenCount(data.hasTokens ? data.tokenCount ?? 0 : 0);
        if (data.templates?.length) setSelectedTemplate((prev) => prev ?? data.templates[0].id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 4000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const run = async (key: string, endpoint: string, init: RequestInit, done: string, after?: () => void) => {
    setBusy(key);
    try {
      const res = await fetch(endpoint, { credentials: 'include', ...init });
      if (!res.ok) throw new Error('That did not work');
      after?.();
      mutate((swrKey) => typeof swrKey === 'string' && swrKey.startsWith('/api/user'));
      setMessage({ type: 'success', text: done });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Network error' });
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  };

  const sendPush = async () => {
    if (!selectedTemplate) return;
    setBusy('push');
    try {
      const res = await fetch('/api/admin/test-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ templateId: selectedTemplate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send');
      setMessage({
        type: 'success',
        text: `Sent to ${data.sent}/${data.totalTokens} device${data.totalTokens === 1 ? '' : 's'}`,
      });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Network error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminPage
      title="My test account"
      subtitle="Shortcuts for testing on your own account. Nothing on this page reaches players."
      icon={<Wrench />}
    >
      <div className="space-y-6">
        {message ? <Notice type={message.type}>{message.text}</Notice> : null}

        <div className="grid gap-4 md:grid-cols-2">
          <AdminCard title="Flies" subtitle="Top up or clear today's catch." icon={<Sparkles />} bodyClassName="flex flex-wrap gap-2 pt-3">
            <PondButton
              loading={busy === 'add-flies'}
              onClick={() =>
                void run(
                  'add-flies',
                  '/api/admin/add-flies',
                  { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: 100000 }) },
                  'Added 100,000 flies',
                )
              }
            >
              <Sparkles className="h-4 w-4" />
              Add 100,000
            </PondButton>
            <PondButton
              variant="secondary"
              loading={busy === 'reset-flies'}
              onClick={() => void run('reset-flies', '/api/admin/reset-flies', { method: 'GET' }, "Today's caught flies reset to 0")}
            >
              <Wind className="h-4 w-4" />
              Reset today&apos;s catch
            </PondButton>
          </AdminCard>

          <AdminCard title="Frogress Plus" subtitle="Grant or remove Plus on your own account." icon={<span className="text-[18px]">👑</span>} tone="grape">
            <PremiumControls />
          </AdminCard>

          <AdminCard
            title="Test push"
            subtitle={
              tokenCount > 0
                ? `${tokenCount} device${tokenCount === 1 ? '' : 's'} registered · ${taskCount} task${taskCount === 1 ? '' : 's'} left today`
                : 'No devices registered. Open the app on your phone first.'
            }
            icon={<Bell />}
            tone="sky"
            bodyClassName="space-y-3 pt-3"
          >
            <div className="max-h-64 space-y-1.5 overflow-y-auto">
              {templates.length === 0 ? (
                <p className="text-[13px] font-bold text-muted-foreground">No templates available.</p>
              ) : (
                templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setSelectedTemplate(template.id)}
                    className={cn(
                      'w-full rounded-2xl border px-3 py-2 text-left transition',
                      selectedTemplate === template.id
                        ? 'border-sky-500/40 bg-sky-500/10'
                        : 'border-border bg-muted/30 hover:bg-muted/60',
                    )}
                  >
                    <p className="text-[13px] font-black">{template.label}</p>
                    <p className="text-[12px] font-medium leading-snug text-muted-foreground">{template.preview}</p>
                  </button>
                ))
              )}
            </div>
            <PondButton
              className="w-full"
              loading={busy === 'push'}
              disabled={tokenCount === 0 || !selectedTemplate}
              onClick={() => void sendPush()}
            >
              <Send className="h-4 w-4" />
              Send to my devices
            </PondButton>
          </AdminCard>

          <AdminCard title="Developer view" icon={<Bug />} tone="stone" bodyClassName="pt-3">
            <ToggleRow
              title="Debug mode"
              description="Shows Rive stats, quest priority scoring and dev tools around the app."
              checked={isDebugMode}
              onChange={setIsDebugMode}
            />
          </AdminCard>
        </div>

        <AdminCard
          title="Start over"
          subtitle="Each one asks twice before it runs, and only touches your account."
          icon={<AlertTriangle />}
          tone="danger"
          bodyClassName="grid gap-2 pt-3 md:grid-cols-2"
        >
          {RESETS.map((reset) => {
            const isConfirming = confirming === reset.key;
            return (
              <div
                key={reset.key}
                className={cn(
                  'flex flex-col gap-2 rounded-2xl border p-3 transition',
                  isConfirming ? 'border-red-500/40 bg-red-500/5' : 'border-border bg-muted/30',
                )}
              >
                <div className="flex items-center gap-3">
                  <IconTile tone={reset.tone} size="sm">
                    {reset.icon}
                  </IconTile>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-black">{reset.title}</p>
                    <p className="text-[12px] font-medium leading-snug text-muted-foreground">
                      {isConfirming ? reset.warning : reset.description}
                    </p>
                  </div>
                  {isConfirming ? null : (
                    <PondButton variant="secondary" size="sm" onClick={() => setConfirming(reset.key)}>
                      Reset
                    </PondButton>
                  )}
                </div>
                {isConfirming ? (
                  <div className="flex justify-end gap-2">
                    <PondButton variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                      Cancel
                    </PondButton>
                    <PondButton
                      variant="danger"
                      size="sm"
                      loading={busy === reset.key}
                      onClick={() =>
                        void run(reset.key, reset.endpoint, { method: 'POST' }, `${reset.title}: done`, () => {
                          reset.onDone?.();
                          window.location.reload();
                        })
                      }
                    >
                      Yes, reset
                    </PondButton>
                  </div>
                ) : null}
              </div>
            );
          })}
        </AdminCard>
      </div>
    </AdminPage>
  );
}

function PremiumControls() {
  const [premiumUntil, setPremiumUntil] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [celebrating, setCelebrating] = useState(false);

  useEffect(() => {
    fetch('/api/user')
      .then((res) => res.json())
      .then((data) => setPremiumUntil(data.premiumUntil))
      .catch(() => {});
  }, []);

  const update = async (action: 'add' | 'remove', days?: number) => {
    setLoading(true);
    try {
      const res = await fetch('/api/user/premium', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, days }),
      });
      const data = await res.json();
      if (data.success) {
        setPremiumUntil(data.premiumUntil);
        mutate(
          (key) => typeof key === 'string' && (key.startsWith('/api/user') || key.startsWith('/api/quests')),
        );
        if (action === 'add') setCelebrating(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const isPremium = !!premiumUntil && new Date(premiumUntil) > new Date();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            'rounded-full px-3 py-1 text-[12px] font-black',
            isPremium ? 'bg-violet-500 text-white' : 'bg-muted text-muted-foreground',
          )}
        >
          {isPremium ? 'Plus is on' : 'Free plan'}
        </span>
        {isPremium ? (
          <span className="text-[12px] font-bold text-muted-foreground">
            until {new Date(premiumUntil!).toLocaleDateString()}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <PondButton variant="secondary" size="sm" disabled={loading} onClick={() => void update('add', 7)}>
          + 7 days
        </PondButton>
        <PondButton variant="secondary" size="sm" disabled={loading} onClick={() => void update('add', 30)}>
          + 1 month
        </PondButton>
        <PondButton variant="secondary" size="sm" disabled={loading} onClick={() => void update('add', 1 / 1440)}>
          + 1 minute
        </PondButton>
        {isPremium ? (
          <PondButton variant="ghost" size="sm" disabled={loading} onClick={() => void update('remove')}>
            Remove Plus
          </PondButton>
        ) : null}
      </div>
      {celebrating && typeof document !== 'undefined'
        ? createPortal(<PlusWelcomeCelebration onDone={() => setCelebrating(false)} />, document.body)
        : null}
    </div>
  );
}
