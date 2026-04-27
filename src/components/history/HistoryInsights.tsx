'use client';

import React from 'react';
import { BarChart3 } from 'lucide-react';
import InsightsGrid from './InsightsGrid';
import HistoryTimeSelector, { DateRangeOption } from './HistoryTimeSelector';
import PatternInsights from './PatternInsights';

type HistoryInsightsProps = {
  // Stats Data
  historyData: any[];
  previousHistoryData: any[];
  stats: {
    total: number;
    completed: number;
    completionRate: number;
  };
  // Filters
  dateRange: DateRangeOption;
  onDateRangeChange: (val: DateRangeOption) => void;
  customDateRange: { from: string; to: string };
  onCustomDateChange: (range: { from: string; to: string }) => void;
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  availableTags: any[];
};

export default function HistoryInsights({
  historyData,
  previousHistoryData,
  stats,
  dateRange,
  onDateRangeChange,
  customDateRange,
  onCustomDateChange,
  selectedTags,
  onTagsChange,
  availableTags,
}: HistoryInsightsProps) {
  return (
    <div className="w-full bg-card/40 backdrop-blur-xl border border-border/50 rounded-[32px] p-6 shadow-sm relative overflow-hidden group">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 px-1 relative z-50">
        <div>
          <h2 className="text-2xl font-black tracking-tight flex items-center gap-3 text-foreground">
            <BarChart3 className="w-6 h-6 text-primary" />
            Insights
          </h2>
          <p className="text-[11px] font-black text-muted-foreground/60 uppercase tracking-[0.2em] mt-1">
            Data-Driven Productivity
          </p>
        </div>
      </div>

      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <HistoryTimeSelector
          dateRange={dateRange}
          onDateRangeChange={onDateRangeChange}
          customDateRange={customDateRange}
          onCustomDateChange={onCustomDateChange}
          selectedTags={selectedTags}
          onTagsChange={onTagsChange}
          availableTags={availableTags}
        />
        <PatternInsights
          historyData={historyData}
          previousHistoryData={previousHistoryData}
          availableTags={availableTags}
        />
        <InsightsGrid
          historyData={historyData}
          stats={stats}
          dateRange={dateRange}
        />
      </div>
    </div>
  );
}
