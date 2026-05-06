'use client';

import React, { useState, useCallback, useRef } from 'react';
import useSWR from 'swr';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Plus, X, RefreshCw, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
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
      revalidateOnReconnect: false,
    },
  );

  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showPremiumLimit, setShowPremiumLimit] = useState(false);
  const lastRefreshRef = useRef(0);

  const suggestions = (data?.suggestions ?? []).filter(
    (s) => !dismissed.has(s.text),
  );

  const markUsed = useCallback((text: string) => {
    fetch('/api/tasks/suggest', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  }, []);

  const handleAccept = useCallback(
    async (suggestion: AiSuggestion) => {
      setAdding(suggestion.text);
      try {
        await onAccept(suggestion.text, suggestion.tagIds);
        setDismissed((prev) => new Set(prev).add(suggestion.text));
        markUsed(suggestion.text);
      } finally {
        setAdding(null);
      }
    },
    [onAccept, markUsed],
  );

  const handleDismiss = useCallback((text: string) => {
    setDismissed((prev) => new Set(prev).add(text));
    markUsed(text);
  }, [markUsed]);

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
    <div className="flex flex-col gap-1.5 pb-1.5">
      <AnimatePresence initial={false}>
        {suggestions.map((suggestion) => {
          const tags = (suggestion.tagIds ?? [])
            .map((id) => getTagDetails?.(id))
            .filter(Boolean) as { id: string; name: string; color?: string }[];
          return (
            <motion.div
              key={suggestion.text}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="group relative flex w-full items-center gap-3 px-3 py-3 rounded-[22px] border border-dashed border-muted-foreground/20 bg-muted/5 cursor-pointer hover:bg-muted/10 transition-colors"
              onClick={() => !adding && handleAccept(suggestion)}
            >
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted border border-muted-foreground/10 shrink-0">
                {adding === suggestion.text ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                ) : (
                  <Plus className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" strokeWidth={2.5} />
                )}
              </div>

              <div className="flex-1 min-w-0 flex flex-col items-start gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black text-emerald-600 dark:text-emerald-400">
                    AI Suggestions
                  </span>
                  {tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-black uppercase leading-none tracking-normal shadow-sm"
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
                </div>
                <span className="text-sm font-semibold leading-snug text-muted-foreground group-hover:text-foreground transition-colors">
                  {suggestion.text}
                </span>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRefresh();
                  }}
                  disabled={refreshing}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground/40 hover:text-primary hover:bg-primary/10 transition-colors active:scale-95 md:opacity-0 group-hover:opacity-100",
                    refreshing && "animate-spin text-primary opacity-100"
                  )}
                  aria-label="Refresh suggestion"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDismiss(suggestion.text);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground/40 hover:text-red-500 hover:bg-red-500/10 transition-colors active:scale-95 md:opacity-0 group-hover:opacity-100"
                  aria-label="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          );
        })}
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
    </div>
  );
}
