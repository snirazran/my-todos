'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { mutate } from 'swr';
import {
  ShieldCheck,
  ChevronRight,
  Image as ImageIcon,
  Trash2,
  DollarSign,
  Sparkles,
  AlertTriangle,
  Gift,
  Wind,
  Bell,
  CalendarClock,
  RefreshCw,
  Send,
  CheckCircle,
  XCircle,
  Paintbrush,
  ScrollText,
  Upload,
  Bug,
  RefreshCcw,
  UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useUIStore } from '@/lib/uiStore';
import { AdminCosmeticsPopup } from '@/components/ui/AdminCosmeticsPopup';
import { AdminGiftManagerPopup } from '@/components/ui/AdminGiftManagerPopup';
import { AdminRiveManagerPopup } from '@/components/ui/AdminRiveManagerPopup';
import { AdminGuard } from '@/components/auth/AdminGuard';

type Template = {
  id: string;
  label: string;
  preview: string;
};

export default function AdminPage() {
  return (
    <AdminGuard>
      <AdminPageContent />
    </AdminGuard>
  );
}

function AdminPageContent() {
  const router = useRouter();
  const { isDebugMode, setIsDebugMode } = useUIStore();

  const [loading, setLoading] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Notification test state
  const [templates, setTemplates] = useState<Template[]>([]);
  const [taskCount, setTaskCount] = useState(0);
  const [hasTokens, setHasTokens] = useState(false);
  const [tokenCount, setTokenCount] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [notifResult, setNotifResult] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Popup managers
  const [cosmeticsOpen, setCosmeticsOpen] = useState(false);
  const [giftManagerOpen, setGiftManagerOpen] = useState(false);
  const [riveManagerOpen, setRiveManagerOpen] = useState(false);

  // Load notification data
  useEffect(() => {
    async function loadNotifData() {
      try {
        const res = await fetch('/api/admin/test-notification', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setTemplates(data.templates);
          setTaskCount(data.taskCount);
          setHasTokens(data.hasTokens);
          setTokenCount(data.tokenCount);
          if (data.templates.length > 0) {
            setSelectedTemplate((prev) => prev ?? data.templates[0].id);
          }
        }
      } catch {
        /* silent */
      }
    }
    loadNotifData();
  }, []);

  const flash = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3500);
  };

  const handleSendTestNotification = async () => {
    if (!selectedTemplate) return;
    setLoading('test-notif');
    setNotifResult(null);
    try {
      const res = await fetch('/api/admin/test-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ templateId: selectedTemplate }),
      });
      const data = await res.json();
      if (res.ok) {
        setNotifResult({
          type: 'success',
          message: `Sent to ${data.sent}/${data.totalTokens} device${data.totalTokens === 1 ? '' : 's'}`,
        });
      } else {
        setNotifResult({ type: 'error', message: data.error || 'Failed to send' });
      }
    } catch {
      setNotifResult({ type: 'error', message: 'Network error' });
    } finally {
      setLoading(null);
    }
  };

  const runConfirmed = async (
    key: string,
    endpoint: string,
    init: RequestInit,
    onSuccess: () => void,
  ) => {
    if (confirmAction !== key) {
      setConfirmAction(key);
      return;
    }
    setLoading(key);
    try {
      const res = await fetch(endpoint, init);
      if (res.ok) {
        onSuccess();
      } else {
        flash('error', 'Action failed');
      }
    } catch {
      flash('error', 'Network error');
    } finally {
      setLoading(null);
      setConfirmAction(null);
    }
  };

  const handleResetTasks = () =>
    runConfirmed('reset-tasks', '/api/admin/reset-tasks', { method: 'POST' }, () =>
      window.location.reload(),
    );

  const handleResetCash = () =>
    runConfirmed('reset-cash', '/api/admin/reset-cash', { method: 'POST' }, () =>
      window.location.reload(),
    );

  const handleResetDaily = () =>
    runConfirmed('reset-daily', '/api/admin/reset-daily-reward', { method: 'POST' }, () =>
      window.location.reload(),
    );

  const handleResetWeeklyRecap = async () => {
    setLoading('reset-weekly-wrapped');
    try {
      const res = await fetch('/api/admin/reset-weekly-recap', { method: 'POST' });
      if (res.ok) {
        mutate((key) => typeof key === 'string' && key.startsWith('/api/weekly-recap'));
        flash('success', 'Weekly Wrapped reset');
      } else {
        flash('error', 'Failed to reset weekly wrapped');
      }
    } catch {
      flash('error', 'Network error');
    } finally {
      setLoading(null);
    }
  };

  const handleResetMissedReview = async () => {
    setLoading('reset-missed-review');
    try {
      const res = await fetch('/api/admin/reset-missed-review', { method: 'POST' });
      if (res.ok) flash('success', 'Missed-review popup reset');
      else flash('error', 'Failed to reset missed review');
    } catch {
      flash('error', 'Network error');
    } finally {
      setLoading(null);
    }
  };

  const handleResetFlies = async () => {
    setLoading('reset-flies');
    try {
      const res = await fetch('/api/admin/reset-flies');
      if (res.ok) window.location.reload();
      else flash('error', 'Failed to reset flies');
    } catch {
      flash('error', 'Network error');
    } finally {
      setLoading(null);
    }
  };

  const handleAddFlies = async () => {
    setLoading('add-flies');
    try {
      const res = await fetch('/api/admin/add-flies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 100000 }),
      });
      if (res.ok) window.location.reload();
      else flash('error', 'Failed to add flies');
    } catch {
      flash('error', 'Network error');
    } finally {
      setLoading(null);
    }
  };

  const handleRefreshQuests = async (scope: 'daily' | 'focus') => {
    const loadingKey = scope === 'focus' ? 'refresh-focus-quests' : 'refresh-daily-quests';
    setLoading(loadingKey);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch('/api/quests/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          timezone,
          ...(scope === 'focus' ? { scope: 'focus' } : {}),
        }),
      });
      if (res.ok) {
        mutate((key) => typeof key === 'string' && key.startsWith('/api/quests'));
        flash('success', scope === 'focus' ? 'Focus quests refreshed' : 'Daily quests refreshed');
      } else {
        const data = await res.json().catch(() => ({}));
        flash('error', data.error || 'Failed to refresh quests');
      }
    } catch {
      flash('error', 'Network error');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-16">
      {/* Hero */}
      <div className="relative overflow-hidden border-b border-border/50 bg-gradient-to-br from-amber-500/10 via-background to-orange-500/10">
        <div className="max-w-5xl mx-auto px-6 md:px-12 pb-8 md:pb-10 pt-[calc(2rem+env(safe-area-inset-top))] md:pt-10">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-black tracking-tight">Admin Dashboard</h1>
                <p className="text-sm md:text-base text-muted-foreground font-medium">
                  Internal tools, content managers, and developer utilities.
                </p>
              </div>
            </div>
            <button
              onClick={() => router.push('/')}
              className="text-xs md:text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back to App
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 md:px-12 pt-6 md:pt-8 space-y-10">
        {message && (
          <div
            className={`rounded-xl px-4 py-3 text-sm font-bold ${
              message.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-red-500/10 text-red-600 dark:text-red-400'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Content Managers */}
        <Section
          title="Content Managers"
          subtitle="Manage shop catalogs, gifts, quests, and game assets."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ManagerLinkCard
              href="/admin/backgrounds"
              icon={<ImageIcon className="w-5 h-5" />}
              accent="bg-sky-500/10 text-sky-600 dark:text-sky-400"
              title="Background Manager"
              description="Backgrounds with name, cost, rarity, and an image per screen size."
            />
            <ManagerLinkCard
              href="/admin/quests"
              icon={<ScrollText className="w-5 h-5" />}
              accent="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              title="Quest Manager"
              description="Macro-categories, tag mappings, daily and category quests."
            />
            <ManagerLinkCard
              href="/admin/invites"
              icon={<UserPlus className="w-5 h-5" />}
              accent="bg-rose-500/10 text-rose-600 dark:text-rose-400"
              title="Invite Manager"
              description="Reward tiers per friend invited and the gifts users can send."
            />
            <ManagerActionCard
              icon={<Paintbrush className="w-5 h-5" />}
              accent="bg-purple-500/10 text-purple-600 dark:text-purple-400"
              title="Cosmetics Manager"
              description="View all skins and add new items to the DB."
              onClick={() => setCosmeticsOpen(true)}
            />
            <ManagerActionCard
              icon={<Gift className="w-5 h-5" />}
              accent="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              title="Gift Manager"
              description="Create gifts and configure item drop chances."
              onClick={() => setGiftManagerOpen(true)}
            />
            <ManagerActionCard
              icon={<Upload className="w-5 h-5" />}
              accent="bg-sky-500/10 text-sky-600 dark:text-sky-400"
              title="Rive Manager"
              description="Upload frog, fly, and gift Rive files with backups."
              onClick={() => setRiveManagerOpen(true)}
            />
          </div>
        </Section>

        {/* Quick Actions */}
        <Section title="Quick Actions" subtitle="One-tap utilities for testing.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ActionButton
              icon={<Sparkles className="w-5 h-5" />}
              accent="bg-emerald-600 hover:bg-emerald-700 text-white"
              iconWrap="bg-white/20"
              title="Add 100,000 Flies"
              description="Instant currency boost for testing"
              loading={loading === 'add-flies'}
              onClick={handleAddFlies}
              filled
            />
            <ActionButton
              icon={<RefreshCw className="w-5 h-5" />}
              accent="bg-amber-500/10 text-amber-600 dark:text-amber-400"
              title="Refresh Daily Quests"
              description="Reroll today's daily quest selection"
              loading={loading === 'refresh-daily-quests'}
              onClick={() => handleRefreshQuests('daily')}
            />
            <ActionButton
              icon={<RefreshCw className="w-5 h-5" />}
              accent="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              title="Refresh Focus Quests"
              description="Rebuild quests for the selected focus areas"
              loading={loading === 'refresh-focus-quests'}
              onClick={() => handleRefreshQuests('focus')}
            />
            <ActionButton
              icon={<CalendarClock className="w-5 h-5" />}
              accent="bg-lime-500/10 text-lime-600 dark:text-lime-400"
              title="Reset Missed Review"
              description="Show yesterday's missed tasks popup again"
              loading={loading === 'reset-missed-review'}
              onClick={handleResetMissedReview}
            />
            <ActionButton
              icon={<Sparkles className="w-5 h-5" />}
              accent="bg-pink-500/10 text-pink-600 dark:text-pink-400"
              title="Reset Weekly Wrapped"
              description="Allow viewing the Spotify-style recap again"
              loading={loading === 'reset-weekly-wrapped'}
              onClick={handleResetWeeklyRecap}
            />
            <ActionButton
              icon={<Wind className="w-5 h-5" />}
              accent="bg-cyan-500/10 text-cyan-600 dark:text-cyan-400"
              title="Reset Flies"
              description="Reset collected flies to 0 for today"
              loading={loading === 'reset-flies'}
              onClick={handleResetFlies}
            />
          </div>
        </Section>

        {/* Destructive Resets */}
        <Section
          title="Destructive Resets"
          subtitle="Two-step confirmation required. Use with care."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ConfirmActionRow
              icon={<Trash2 className="w-5 h-5" />}
              accent="bg-red-500/10 text-red-600 dark:text-red-400"
              warningAccent="bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900 text-red-600 dark:text-red-400"
              title="Reset Tasks & Statistics"
              description="Clear all tasks, history, and milestones"
              isConfirming={confirmAction === 'reset-tasks'}
              loading={loading === 'reset-tasks'}
              warningText="Warning: This permanently deletes all your tasks and progress. Click again to confirm."
              onClick={handleResetTasks}
            />
            <ConfirmActionRow
              icon={<DollarSign className="w-5 h-5" />}
              accent="bg-orange-500/10 text-orange-600 dark:text-orange-400"
              warningAccent="bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900 text-orange-600 dark:text-orange-400"
              title="Reset Cash"
              description="Set flies balance to 0"
              isConfirming={confirmAction === 'reset-cash'}
              loading={loading === 'reset-cash'}
              warningText="Warning: This sets your fly balance to 0. Click again to confirm."
              onClick={handleResetCash}
            />
            <ConfirmActionRow
              icon={<Gift className="w-5 h-5" />}
              accent="bg-teal-500/10 text-teal-600 dark:text-teal-400"
              warningAccent="bg-teal-50 dark:bg-teal-950/20 border-teal-200 dark:border-teal-900 text-teal-600 dark:text-teal-400"
              title="Reset Daily Reward"
              description="Allow claiming today's reward again"
              isConfirming={confirmAction === 'reset-daily'}
              loading={loading === 'reset-daily'}
              warningText="Confirm: This resets today's reward claim status. Click again to apply."
              onClick={handleResetDaily}
            />
          </div>
        </Section>

        {/* Notifications */}
        <Section
          title="Push Notifications"
          subtitle={
            hasTokens
              ? `${tokenCount} device${tokenCount === 1 ? '' : 's'} registered · ${taskCount} task${taskCount === 1 ? '' : 's'} left`
              : 'No devices registered — open the app on mobile first.'
          }
        >
          <div className="rounded-3xl border border-border bg-card shadow-sm p-5 md:p-6 space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-9 h-9 rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-400">
                <Bell className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-black text-foreground">Test Templates</h3>
            </div>

            <div className="space-y-1.5">
              {templates.length === 0 ? (
                <p className="text-sm text-muted-foreground">No templates available.</p>
              ) : (
                templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTemplate(t.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all text-xs ${
                      selectedTemplate === t.id
                        ? 'border-violet-500/50 bg-violet-500/10 ring-1 ring-violet-500/20'
                        : 'border-border/50 bg-muted/30 hover:bg-muted/50'
                    }`}
                  >
                    <div className="font-semibold text-foreground mb-0.5">{t.label}</div>
                    <div className="text-muted-foreground leading-snug">{t.preview}</div>
                  </button>
                ))
              )}
            </div>

            <Button
              onClick={handleSendTestNotification}
              disabled={loading !== null || !hasTokens || !selectedTemplate}
              className="w-full gap-2 h-11 bg-violet-600 hover:bg-violet-700 text-white font-bold"
            >
              {loading === 'test-notif' ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Send Test Notification
            </Button>

            {notifResult && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium ${
                  notifResult.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                    : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                }`}
              >
                {notifResult.type === 'success' ? (
                  <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 shrink-0" />
                )}
                {notifResult.message}
              </motion.div>
            )}
          </div>
        </Section>

        {/* Settings */}
        <Section title="Developer Settings" subtitle="Toggle dev-only UI helpers.">
          <div className="rounded-3xl border border-border bg-card shadow-sm p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400">
                  <Bug className="w-5 h-5" />
                </div>
                <div>
                  <Label htmlFor="debug-mode" className="font-bold cursor-pointer">
                    Debug Mode
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Show Rive stats and dev tools.
                  </p>
                </div>
              </div>
              <Checkbox
                id="debug-mode"
                checked={isDebugMode}
                onCheckedChange={(checked) => setIsDebugMode(!!checked)}
              />
            </div>
          </div>
        </Section>

        {/* Premium Status */}
        <Section
          title="Premium Status"
          subtitle="Grant or revoke premium on your own account for testing."
        >
          <div className="rounded-3xl border border-border bg-card shadow-sm p-5 md:p-6">
            <PremiumControls />
          </div>
        </Section>
      </div>

      <AdminCosmeticsPopup open={cosmeticsOpen} onClose={() => setCosmeticsOpen(false)} />
      <AdminGiftManagerPopup open={giftManagerOpen} onClose={() => setGiftManagerOpen(false)} />
      <AdminRiveManagerPopup open={riveManagerOpen} onClose={() => setRiveManagerOpen(false)} />
    </div>
  );
}

function PremiumControls() {
  const [premiumUntil, setPremiumUntil] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/user')
      .then((res) => res.json())
      .then((data) => setPremiumUntil(data.premiumUntil))
      .catch((err) => console.error('Failed to fetch user data', err));
  }, []);

  const handleUpdate = async (action: 'add' | 'remove', days?: number) => {
    setLoading(true);
    try {
      const res = await fetch('/api/user/premium', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, days }),
      });
      const data = await res.json();
      if (data.success) setPremiumUntil(data.premiumUntil);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const isPremium = premiumUntil && new Date(premiumUntil) > new Date();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span
          className={`text-xs font-black uppercase tracking-wide px-2.5 py-1 rounded-lg ${
            isPremium
              ? 'bg-indigo-500 text-white'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {isPremium ? 'Premium Active' : 'Free Plan'}
        </span>
        {isPremium && (
          <span className="text-[11px] font-medium text-muted-foreground">
            Expires {new Date(premiumUntil!).toLocaleDateString()}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          disabled={loading}
          onClick={() => handleUpdate('add', 7)}
          className="p-2.5 bg-muted/40 border border-border rounded-xl text-xs font-bold hover:bg-indigo-500/10 hover:border-indigo-500/50 transition-all disabled:opacity-50"
        >
          + 7 Days
        </button>
        <button
          disabled={loading}
          onClick={() => handleUpdate('add', 30)}
          className="p-2.5 bg-muted/40 border border-border rounded-xl text-xs font-bold hover:bg-purple-500/10 hover:border-purple-500/50 transition-all disabled:opacity-50"
        >
          + 1 Month
        </button>
        <button
          disabled={loading}
          onClick={() => handleUpdate('add', 1 / 1440)}
          className="p-2.5 bg-muted/40 border border-border rounded-xl text-xs font-bold hover:bg-yellow-500/10 hover:border-yellow-500/50 transition-all disabled:opacity-50"
        >
          + 1 Min (Test)
        </button>
        <button
          disabled={loading}
          onClick={() => handleUpdate('remove')}
          className="col-span-2 p-2.5 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-xs font-bold hover:bg-red-500/20 hover:border-red-500/40 transition-all disabled:opacity-50"
        >
          Remove Premium
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg md:text-xl font-black tracking-tight">{title}</h2>
        {subtitle && (
          <p className="text-xs md:text-sm text-muted-foreground font-medium">{subtitle}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function ManagerLinkCard({
  href,
  icon,
  accent,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  accent: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 p-4 md:p-5 rounded-3xl border border-border bg-card shadow-sm hover:border-primary/40 transition-colors"
    >
      <div className={`flex items-center justify-center w-10 h-10 rounded-full ${accent}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm md:text-base font-black text-foreground tracking-tight">
          {title}
        </h3>
        <p className="text-xs text-muted-foreground font-medium leading-snug">{description}</p>
      </div>
      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
    </Link>
  );
}

function ManagerActionCard({
  icon,
  accent,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  accent: string;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 p-4 md:p-5 rounded-3xl border border-border bg-card shadow-sm hover:border-primary/40 transition-colors text-left"
    >
      <div className={`flex items-center justify-center w-10 h-10 rounded-full ${accent}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm md:text-base font-black text-foreground tracking-tight">
          {title}
        </h3>
        <p className="text-xs text-muted-foreground font-medium leading-snug">{description}</p>
      </div>
      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
    </button>
  );
}

function ActionButton({
  icon,
  accent,
  iconWrap,
  title,
  description,
  loading,
  onClick,
  filled = false,
}: {
  icon: React.ReactNode;
  accent: string;
  iconWrap?: string;
  title: string;
  description: string;
  loading: boolean;
  onClick: () => void;
  filled?: boolean;
}) {
  return (
    <Button
      onClick={onClick}
      disabled={loading}
      variant={filled ? 'default' : 'outline'}
      className={`w-full justify-start gap-3 h-auto py-4 px-4 rounded-2xl ${filled ? accent : ''}`}
    >
      <div
        className={`flex items-center justify-center w-10 h-10 rounded-full ${
          filled ? iconWrap || 'bg-white/20' : accent
        }`}
      >
        {icon}
      </div>
      <div className="flex-1 text-left">
        <div className="font-bold text-sm">{title}</div>
        <div
          className={`text-xs font-normal ${filled ? 'text-white/80' : 'text-muted-foreground'}`}
        >
          {description}
        </div>
      </div>
      {loading && (
        <div
          className={`w-4 h-4 border-2 ${filled ? 'border-white' : 'border-current'} border-t-transparent rounded-full animate-spin`}
        />
      )}
    </Button>
  );
}

function ConfirmActionRow({
  icon,
  accent,
  warningAccent,
  title,
  description,
  isConfirming,
  loading,
  warningText,
  onClick,
}: {
  icon: React.ReactNode;
  accent: string;
  warningAccent: string;
  title: string;
  description: string;
  isConfirming: boolean;
  loading: boolean;
  warningText: string;
  onClick: () => void;
}) {
  return (
    <div className="space-y-2">
      <Button
        onClick={onClick}
        disabled={loading}
        variant={isConfirming ? 'destructive' : 'outline'}
        className="w-full justify-start gap-3 h-auto py-4 px-4 rounded-2xl"
      >
        <div className={`flex items-center justify-center w-10 h-10 rounded-full ${accent}`}>
          {icon}
        </div>
        <div className="flex-1 text-left">
          <div className="font-bold text-sm">{title}</div>
          <div className="text-xs text-muted-foreground font-normal">{description}</div>
        </div>
        {loading && (
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        )}
      </Button>
      {isConfirming && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className={`flex items-start gap-2 p-3 border rounded-xl ${warningAccent}`}
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="text-xs">
            <strong>{warningText.split(':')[0]}:</strong>
            {warningText.includes(':') ? warningText.slice(warningText.indexOf(':') + 1) : ''}
          </div>
        </motion.div>
      )}
    </div>
  );
}
