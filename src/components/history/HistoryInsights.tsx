'use client';

import React from 'react';
import { BarChart3 } from 'lucide-react';
import HistoryMetrics from './HistoryMetrics';
import HistoryTimeSelector, { DateRangeOption } from './HistoryTimeSelector';

type HistoryInsightsProps = {
    // Stats Data
    historyData: any[];
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
    stats,
    dateRange,
    onDateRangeChange,
    customDateRange,
    onCustomDateChange,
    selectedTags,
    onTagsChange,
    availableTags
}: HistoryInsightsProps) {

    return (
        <div className="w-full bg-card/40 backdrop-blur-xl border border-border/50 rounded-[24px] p-4 shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 px-1">
                <div>
                    <h2 className="text-lg font-black tracking-tight flex items-center gap-2 text-foreground">
                        <BarChart3 className="w-5 h-5 text-primary" />
                        Insights
                    </h2>
                    <p className="text-xs font-bold text-muted-foreground/60 uppercase tracking-widest mt-0.5">
                        Productivity Overview
                    </p>
                </div>
            </div>

            <div className="space-y-6">
                {/* Time Selector Section */}
                <div className="space-y-3">
                    <HistoryTimeSelector
                        dateRange={dateRange}
                        onDateRangeChange={onDateRangeChange}
                        customDateRange={customDateRange}
                        onCustomDateChange={onCustomDateChange}
                        selectedTags={selectedTags}
                        onTagsChange={onTagsChange}
                        availableTags={availableTags}
                    />
                </div>

                {/* Metrics Section */}
                <div className="space-y-4">
                    <HistoryMetrics
                        historyData={historyData}
                        completedTasks={stats.completed}
                        completionRate={stats.completionRate}
                        totalTasks={stats.total}
                    />
                </div>
            </div>
        </div>
    );
}
