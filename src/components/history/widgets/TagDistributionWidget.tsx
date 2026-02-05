'use client';

import React, { useMemo } from 'react';
import { WidgetBase, WidgetProps } from './WidgetBase';
import { Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import useSWR from 'swr';

export function TagDistributionWidget(props: WidgetProps) {
    const { data: tagsData } = useSWR('/api/tags', (url) => fetch(url).then((r) => r.json()));
    const allTags = tagsData?.tags || [];

    const topTags = useMemo(() => {
        const counts: Record<string, number> = {};
        props.historyData?.forEach(day => {
            day.tasks.forEach((t: any) => {
                if (t.completed && t.tags) {
                    t.tags.forEach((tagId: string) => {
                        counts[tagId] = (counts[tagId] || 0) + 1;
                    });
                }
            });
        });

        return Object.entries(counts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([id, count]) => {
                const tag = allTags.find((t: any) => t.id === id);
                return {
                    name: tag?.name || 'Unknown',
                    color: tag?.color || '#94a3b8',
                    count
                };
            });
    }, [props.historyData, allTags]);

    return (
        <WidgetBase {...props} className={cn("col-span-2 sm:col-span-1 bg-card/60 backdrop-blur-md border border-border/50 rounded-[20px] shadow-sm hover:bg-muted/30 transition-colors", props.className)}>
            <div className="p-4 flex flex-col h-full gap-3">
                 <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-indigo-500/10 text-indigo-500">
                        <Tag className="w-4 h-4" strokeWidth={3} />
                    </div>
                     <div className="text-[10px] uppercase font-black text-muted-foreground/60 tracking-widest">Top Tags</div>
                </div>
                
                <div className="space-y-2 flex-1">
                    {topTags.length > 0 ? topTags.map((t, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                                <span className="font-bold truncate max-w-[100px]">{t.name}</span>
                            </div>
                            <span className="font-mono text-xs opacity-50">{t.count}</span>
                        </div>
                    )) : (
                        <div className="text-sm text-muted-foreground italic">No tags used</div>
                    )}
                </div>
            </div>
        </WidgetBase>
    );
}
