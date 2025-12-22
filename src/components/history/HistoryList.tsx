'use client';

import React from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import HistoryTaskItem, { HistoryTaskItemProps } from './HistoryTaskItem';
import { motion } from 'framer-motion';
import useSWR from 'swr';

type DailyGroup = {
  date: string;
  tasks: HistoryTaskItemProps[];
};

type HistoryListProps = {
   history: DailyGroup[];
   onToggleTask: (id: string, date: string, currentStatus: boolean) => void;
   setFlyRef?: (key: string, el: HTMLDivElement | null) => void;
   visuallyCompleted?: Set<string>;
};

export default function HistoryList({ history, onToggleTask, setFlyRef, visuallyCompleted }: HistoryListProps) {
  const { data: tagsData } = useSWR('/api/tags', (url) =>
    fetch(url).then((r) => r.json())
  );
  const userTags: { id: string; name: string; color: string }[] =
    tagsData?.tags || [];

  if (!history || history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center opacity-60">
        <div className="text-4xl mb-4">🐸</div>
        <h3 className="text-lg font-medium text-foreground">No history found</h3>
        <p className="text-muted-foreground">Try selecting a different date range.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      {history.map((day, groupIndex) => {
        const dateObj = new Date(day.date);
        let dateLabel = format(dateObj, 'EEEE, MMMM do');
        if (isToday(dateObj)) dateLabel = 'Today';
        if (isYesterday(dateObj)) dateLabel = 'Yesterday';

        // Count completed tasks for summary
        const completedCount = day.tasks.filter(t => t.completed).length;
        const totalCount = day.tasks.length;

        return (
          <motion.div 
            key={day.date}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: groupIndex * 0.1 }}
            className="space-y-3"
          >
            <div className="flex items-end justify-between px-1 py-2">
               <div>
                  <h3 className="text-lg font-bold text-foreground">
                    {dateLabel}
                  </h3>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                     {format(dateObj, 'yyyy')}
                  </p>
               </div>
               <div className="text-xs font-medium text-muted-foreground">
                  {completedCount}/{totalCount} Completed
               </div>
            </div>
            
            <div className="grid gap-2">
              {day.tasks.map((task, i) => {
                const uniqueKey = `${day.date}::${task.id}`;
                return (
                  <HistoryTaskItem 
                    key={uniqueKey} 
                    {...task} 
                    index={i}
                    date={day.date} // Explicitly pass the date of the group
                    onToggle={onToggleTask}
                    setFlyRef={(el) => setFlyRef?.(uniqueKey, el)}
                    isEaten={visuallyCompleted?.has(uniqueKey)}
                    userTags={userTags} // Pass userTags
                  />
                );
              })}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}