'use client';

import React, { useState, useCallback, useRef } from 'react';
import useSWR from 'swr';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Plus, X, RefreshCw, ChevronDown } from 'lucide-react';
import { QUEST_MACRO_CATEGORIES } from '@/lib/quests/catalog';
import Fly from '@/components/ui/fly';
import { PremiumLimitDialog } from './PremiumLimitDialog';

type AiSuggestion = {
  text: string;
  categoryId: string;
};

type SuggestResponse = {
  suggestions: AiSuggestion[];
  cached: boolean;
  isPremium?: boolean;
  refreshesLeft?: number;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const REFRESH_COOLDOWN_MS = 3000;

export default function AiSuggestions({
  onAccept,
}: {
  onAccept: (text: string, tags?: string[]) => Promise<void> | void;
}) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { data, mutate, isLoading } = useSWR<SuggestResponse>(
    `/api/tasks/suggest?timezone=${encodeURIComponent(tz)}`,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
    },
  );

  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showPremiumLimit, setShowPremiumLimit] = useState(false);
  const lastRefreshRef = useRef(0);

  const suggestions = (data?.suggestions ?? []).filter(
    (s) => !dismissed.has(s.text),
  );

  const handleAccept = useCallback(
    async (suggestion: AiSuggestion) => {
      setAdding(suggestion.text);
      try {
        await onAccept(suggestion.text);
        setDismissed((prev) => new Set(prev).add(suggestion.text));
      } finally {
        setAdding(null);
      }
    },
    [onAccept],
  );

  const handleDismiss = useCallback((text: string) => {
    setDismissed((prev) => new Set(prev).add(text));
  }, []);

  const handleRefresh = useCallback(async () => {
    const now = Date.now();
    if (now - lastRefreshRef.current < REFRESH_COOLDOWN_MS) return;
    lastRefreshRef.current = now;

    if (!data?.isPremium && data?.refreshesLeft !== undefined && data.refreshesLeft <= 0) {
      setShowPremiumLimit(true);
      return;
    }

    setRefreshing(true);
    setDismissed(new Set());
    try {
      const res = await fetch(
        `/api/tasks/suggest?timezone=${encodeURIComponent(tz)}`,
        { method: 'POST' },
      );
      if (res.status === 403) {
        const body = await res.json();
        if (body.error === 'limit') {
          setShowPremiumLimit(true);
          return;
        }
      }
      await mutate();
    } finally {
      setRefreshing(false);
    }
  }, [tz, mutate, data?.isPremium, data?.refreshesLeft]);

  if (isLoading || !data?.suggestions?.length || suggestions.length === 0) {
    return null;
  }

  const getCategoryColor = (categoryId: string) => {
    return (
      QUEST_MACRO_CATEGORIES.find((c) => c.id === categoryId)?.accent ??
      '#6b7280'
    );
  };

  const getCategoryName = (categoryId: string) => {
    return (
      QUEST_MACRO_CATEGORIES.find((c) => c.id === categoryId)?.shortLabel ??
      categoryId
    );
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[22px] bg-card/40 border border-border/50 shadow-sm overflow-hidden"
      >
        {/* Header */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-primary">
              AI Suggestions
            </span>
            <span className="ml-2 text-[10px] font-semibold text-muted-foreground">
              {suggestions.length} task{suggestions.length !== 1 ? 's' : ''}
            </span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleRefresh();
            }}
            disabled={refreshing}
            className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
            aria-label="Refresh suggestions"
          >
            <RefreshCw
              className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`}
            />
          </button>
          <ChevronDown
            className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${collapsed ? '-rotate-90' : ''}`}
          />
        </button>

        {/* Suggestion List */}
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              exit={{ height: 0 }}
              transition={{ type: 'tween', duration: 0.15, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              <div className="p-1.5 pt-0 flex flex-col gap-0">
                {suggestions.map((suggestion) => (
                  <motion.div
                    key={suggestion.text}
                    layout
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.97, height: 0 }}
                    transition={{ duration: 0.15 }}
                    className="group flex items-center gap-2 rounded-[14px] px-2 py-2"
                  >
                    <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted/50 ring-1 ring-border/60">
                      <Fly size={24} y={-3} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="inline-block h-1.5 w-1.5 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: getCategoryColor(suggestion.categoryId),
                          }}
                        />
                        <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                          {getCategoryName(suggestion.categoryId)}
                        </span>
                      </div>
                      <p className="text-sm font-semibold leading-snug text-foreground">
                        {suggestion.text}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleAccept(suggestion)}
                        disabled={adding === suggestion.text}
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors active:scale-95 disabled:opacity-50"
                        aria-label="Add task"
                      >
                        {adding === suggestion.text ? (
                          <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                        )}
                      </button>
                      <button
                        onClick={() => handleDismiss(suggestion.text)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/40 hover:bg-muted hover:text-muted-foreground transition-colors active:scale-95"
                        aria-label="Dismiss"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <PremiumLimitDialog
        open={showPremiumLimit}
        onClose={() => setShowPremiumLimit(false)}
        title="Daily Refresh Limit"
        description={
          <>
            Free users get {2} AI suggestion refreshes per day. Upgrade to{' '}
            <b>Premium</b> for unlimited refreshes.
          </>
        }
      />
    </>
  );
}
