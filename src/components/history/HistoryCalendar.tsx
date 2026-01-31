'use client';

import React from 'react';
import {
    format,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    isSameMonth,
    isSameDay,
    addMonths,
    subMonths,
    isToday
} from 'date-fns';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

type HistoryCalendarProps = {
    currentDate: Date;
    onDateChange: (date: Date) => void;
    selectedDate?: string | null;
    onSelectDate: (date: string) => void;
    historyData: { date: string; tasks: any[] }[];
    disableSwipe?: boolean;
};

export default function HistoryCalendar({
    currentDate,
    onDateChange,
    selectedDate,
    onSelectDate,
    historyData,
    disableSwipe = false
}: HistoryCalendarProps) {

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const calendarDays = eachDayOfInterval({
        start: startDate,
        end: endDate,
    });

    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Helper to get stats for a day
    const getDayStats = (date: Date) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        const dayData = historyData.find(d => d.date === dateStr);
        if (!dayData) return null;

        const completed = dayData.tasks.filter(t => t.completed).length;
        const total = dayData.tasks.length;
        return { completed, total };
    };

    const handlePrevMonth = () => onDateChange(subMonths(currentDate, 1));
    const handleNextMonth = () => onDateChange(addMonths(currentDate, 1));

    return (
        <div className="w-full max-w-md mx-auto bg-card/80 backdrop-blur-2xl border border-border/50 rounded-[32px] p-6 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between mb-8 px-2">
                <h2 className="text-2xl font-black text-foreground tracking-tight flex-1 text-center sm:text-left">
                    {format(currentDate, 'MMMM yyyy')}
                </h2>
                <div className="flex gap-2">
                    <button
                        onClick={handlePrevMonth}
                        className="p-2.5 bg-muted/50 hover:bg-muted rounded-xl transition-colors text-foreground"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                        onClick={handleNextMonth}
                        className="p-2.5 bg-muted/50 hover:bg-muted rounded-xl transition-colors text-foreground"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Week Days */}
            <div className="grid grid-cols-7 mb-4">
                {weekDays.map(day => (
                    <div key={day} className="text-center text-[11px] uppercase font-black text-muted-foreground/60 tracking-wider">
                        {day}
                    </div>
                ))}
            </div>

            {/* Days Grid - Swipeable Area */}
            <motion.div
                drag={disableSwipe ? false : "x"}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.1} // Feel of resistance
                onDragEnd={(e, { offset, velocity }) => {
                    const swipeThreshold = 50;
                    if (offset.x > swipeThreshold) {
                        handlePrevMonth();
                    } else if (offset.x < -swipeThreshold) {
                        handleNextMonth();
                    }
                }}
                className="grid grid-cols-7 gap-1 sm:gap-2 touch-pan-y" // touch-pan-y allows vertical scrolling while dragging
            >
                {calendarDays.map((day, idx) => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const isCurrentMonth = isSameMonth(day, monthStart);
                    const isSelected = selectedDate === dateStr;
                    const isTodayDate = isToday(day);
                    const stats = getDayStats(day);

                    const hasTasks = stats && stats.total > 0;
                    const isAllDone = hasTasks && stats?.completed === stats?.total;
                    const completionRate = hasTasks ? (stats!.completed / stats!.total) : 0;

                    return (
                        <motion.button
                            key={day.toISOString()}
                            layout // helps with smooth transitions if layout changes
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: idx * 0.005 }} // Reduce delay for snappier feel
                            onClick={() => onSelectDate(dateStr)}
                            className={cn(
                                "relative aspect-square flex flex-col items-center justify-center rounded-2xl transition-all border-2",
                                !isCurrentMonth && "opacity-20 hover:opacity-100 border-transparent",
                                isCurrentMonth && "border-transparent",
                                // Selection state
                                isSelected ? "border-primary bg-primary/5 shadow-[0_0_0_2px_rgba(var(--primary),0.2)]" : "hover:bg-muted/50",
                                // Today state (if not selected)
                                isTodayDate && !isSelected && "bg-muted/30 border-muted-foreground/20",
                            )}
                        >
                            <span className={cn(
                                "text-sm font-bold z-10",
                                isTodayDate ? "text-primary" : "text-foreground",
                                !isCurrentMonth && "text-muted-foreground",
                                isSelected && "text-primary scan-text",
                            )}>
                                {format(day, 'd')}
                            </span>

                            {/* Indicators */}
                            <div className="absolute bottom-2 left-0 right-0 flex justify-center">
                                {hasTasks ? (
                                    <>
                                        {/* Progress Bar Style Indicator */}
                                        <div className="hidden sm:block w-8 h-1 bg-muted/50 rounded-full overflow-hidden">
                                            <div
                                                className={cn("h-full rounded-full transition-all",
                                                    isAllDone ? "bg-emerald-500" :
                                                        completionRate > 0.5 ? "bg-primary" : "bg-orange-400"
                                                )}
                                                style={{ width: `${completionRate * 100}%` }}
                                            />
                                        </div>

                                        {/* Dot Style for Mobile */}
                                        <div className={cn("sm:hidden w-1.5 h-1.5 rounded-full transition-colors",
                                            isAllDone ? "bg-emerald-500" :
                                                completionRate > 0 ? "bg-primary" : "bg-muted-foreground/30"
                                        )}
                                        />
                                    </>
                                ) : (
                                    // Empty placeholder to keep alignment
                                    <div className="w-1 h-1" />
                                )}
                            </div>

                            {/* Completion checkmark for perfect days */}
                            {isAllDone && (
                                <div className="hidden sm:flex absolute -top-1 -right-1 bg-background rounded-full p-0.5 border border-border shadow-sm">
                                    <Check className="w-3 h-3 text-emerald-500" strokeWidth={3} />
                                </div>
                            )}
                        </motion.button>
                    );
                })}
            </motion.div>
        </div>
    );
}
