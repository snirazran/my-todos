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
  tagIds?: string[];
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
  getTagDetails,
  focusCategoryIds,
}: {
  onAccept: (text: string, tagIds?: string[]) => Promise<void> | void;
  getTagDetails?: (tagId: string) => { id: string; name: string; color?: string } | undefined;
  focusCategoryIds?: string[];
}) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const focusKey = (focusCategoryIds ?? []).slice().sort().join(',');
  const { data, mutate, isLoading } = useSWR<SuggestResponse>(
    focusKey
      ? `/api/tasks/suggest?timezone=${encodeURIComponent(tz)}&focus=${encodeURIComponent(focusKey)}`
      : null,
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
        await onAccept(suggestion.text, suggestion.tagIds);
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
      QUEST_MACRO_CATEGORIES.find((c) => c.id === categoryId)?.name ??
      categoryId
    );
  };

  return (
    <>
      {/* Header row */}
      <div className="flex items-center gap-2 px-2 pt-2 pb-1">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 flex-1 min-w-0"
        >
          <div className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10">
            <Sparkles className="h-3 w-3 text-primary" />
          </div>
          <span className="text-[11px] font-black uppercase tracking-[0.14em] text-primary">
            AI Suggestions
          </span>
          <span className="text-[10px] font-semibold text-muted-foreground">
            {suggestions.length} task{suggestions.length !== 1 ? 's' : ''}
          </span>
        </button>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
          aria-label="Refresh suggestions"
        >
          <RefreshCw
            className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`}
          />
        </button>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground"
        >
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${collapsed ? '-rotate-90' : ''}`}
          />
        </button>
      </div>

      {/* Suggestion cards */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'tween', duration: 0.15, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="space-y-1 pb-1.5">
              {suggestions.map((suggestion) => {
                const color = getCategoryColor(suggestion.categoryId);
                return (
                  <motion.div
                    key={suggestion.text}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.15 }}
                    className="relative flex w-full items-center gap-2 px-2 py-2 rounded-xl bg-card border border-border/50"
                  >
                    <div className="relative flex-shrink-0 w-7 h-7 flex items-center justify-center">
                      <Fly size={24} y={-3} />
                    </div>

                    <div className="flex-1 min-w-0">
                      {(() => {
                        const tags = (suggestion.tagIds ?? [])
                          .map((id) => getTagDetails?.(id))
                          .filter(Boolean) as { id: string; name: string; color?: string }[];
                        const showCategory = tags.length === 0;
                        return (tags.length > 0 || showCategory) ? (
                          <div className="flex flex-wrap gap-1 mb-0.5">
                            {tags.map((tag) => (
                              <span
                                key={tag.id}
                                className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-black uppercase leading-none tracking-normal shadow-sm"
                                style={
                                  tag.color
                                    ? {
                                        backgroundColor: `${tag.color}20`,
                                        color: tag.color,
                                        borderColor: `${tag.color}40`,
                                      }
                                    : undefined
                                }
                              >
                                {tag.name}
                              </span>
                            ))}
                            {showCategory && (
                              <span
                                className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-black uppercase leading-none tracking-normal shadow-sm"
                                style={{
                                  backgroundColor: `${color}20`,
                                  color: color,
                                  borderColor: `${color}40`,
                                }}
                              >
                                {getCategoryName(suggestion.categoryId)}
                              </span>
                            )}
                          </div>
                        ) : null;
                      })()}
                      <span className="text-sm font-semibold leading-snug text-foreground">
                        {suggestion.text}
                      </span>
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
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
