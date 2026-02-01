'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Loader2 } from 'lucide-react';
import { startOfMonth, endOfMonth, format, subDays, startOfToday } from 'date-fns';
import useSWR from 'swr';

import { LoadingScreen } from '@/components/ui/LoadingScreen';
import HistoryCalendar from '@/components/history/HistoryCalendar';
import DayDetailSheet from '@/components/history/DayDetailSheet';
import HistoryInsights from '@/components/history/HistoryInsights';
import { DateRangeOption } from '@/components/history/HistoryTimeSelector';
import { useTaskData } from '@/hooks/useTaskData';

export default function HistoryPage() {
   const { data: session, status } = useSession();
   const { hungerStatus, flyStatus } = useTaskData();
   const router = useRouter();

   // --- State: Calendar View ---
   const [viewDate, setViewDate] = useState(new Date());
   const [calendarData, setCalendarData] = useState<any[]>([]);
   const [loadingCalendar, setLoadingCalendar] = useState(false);

   // --- State: Selection (Day Popup) ---
   const [selectedDate, setSelectedDate] = useState<string | null>(null);

   // --- State: Stats Dialog ---
   const [isStatsOpen, setIsStatsOpen] = useState(false);
   // Filters for Stats
   const [statsFilter, setStatsFilter] = useState<DateRangeOption>('7d');
   const [customFrom, setCustomFrom] = useState<string>(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
   const [customTo, setCustomTo] = useState<string>(format(subDays(new Date(), 1), 'yyyy-MM-dd'));
   const [statsData, setStatsData] = useState<any[]>([]);
   const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

   const { data: tagsData } = useSWR('/api/tags', (url) => fetch(url).then((r) => r.json()));
   const availableTags = tagsData?.tags || [];

   // --- Auth Check ---
   useEffect(() => {
      if (status === 'loading') return;
      if (status === 'unauthenticated') {
         router.push('/login');
      }
   }, [status, router]);

   // --- 1. Fetch Calendar Data (View Month) ---
   useEffect(() => {
      if (!session) return;

      const fetchMonth = async () => {
         setLoadingCalendar(true);
         try {
            const fromStr = format(startOfMonth(viewDate), 'yyyy-MM-dd');
            const toStr = format(endOfMonth(viewDate), 'yyyy-MM-dd');
            const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

            const res = await fetch(`/api/history?from=${fromStr}&to=${toStr}&timezone=${encodeURIComponent(userTimezone)}`);
            if (res.ok) {
               const data = await res.json();
               setCalendarData(data);
            }
         } catch (e) {
            console.error("Calendar fetch error", e);
         } finally {
            setLoadingCalendar(false);
         }
      };

      fetchMonth();
   }, [viewDate, session]);

   // --- 2. Fetch Stats Data (When needed) ---
   useEffect(() => {
      if (!isStatsOpen || !session) return;

      const fetchStats = async () => {
         try {
            // Logic similar to old page
            const today = startOfToday();
            let fromDate = new Date();
            let toDate = subDays(today, 1);

            switch (statsFilter) {
               case '7d': fromDate = subDays(today, 7); break;
               case '30d': fromDate = subDays(today, 30); break;
               case 'custom':
                  if (customFrom) fromDate = new Date(customFrom);
                  if (customTo) toDate = new Date(customTo);
                  break;
            }

            const fromStr = format(fromDate, 'yyyy-MM-dd');
            const toStr = format(toDate, 'yyyy-MM-dd');
            const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

            const res = await fetch(`/api/history?from=${fromStr}&to=${toStr}&timezone=${encodeURIComponent(userTimezone)}`);
            if (res.ok) {
               const data = await res.json();
               setStatsData(data);
            }
         } catch (e) {
            console.error("Stats fetch error", e);
         }
      };

      fetchStats();
   }, [isStatsOpen, statsFilter, customFrom, customTo, session]);

   // --- Helpers ---
   const selectedDayTasks = useMemo(() => {
      if (!selectedDate) return [];
      const day = calendarData.find(d => d.date === selectedDate);
      return day ? day.tasks : [];
   }, [calendarData, selectedDate]);

   const filteredStatsData = useMemo(() => {
      if (selectedTagIds.length === 0) return statsData;
      return statsData.map(day => ({
         ...day,
         tasks: day.tasks.filter((t: any) => selectedTagIds.some(id => t.tags?.includes(id)))
      })).filter(day => day.tasks.length > 0);
   }, [statsData, selectedTagIds]);

   const statsSummary = useMemo(() => {
      let total = 0;
      let completed = 0;
      filteredStatsData.forEach((day) => {
         day.tasks.forEach((t: any) => {
            total++;
            if (t.completed) completed++;
         });
      });
      return {
         total,
         completed,
         completionRate: total > 0 ? (completed / total) * 100 : 0,
      };
   }, [filteredStatsData]);


   // Refactored Toggle for Popup
   const handleToggleTask = async (taskId: string, date: string, currentStatus: boolean) => {
      // Optimistic update in both Calendar Data and Stats Data
      const updateData = (prev: any[]) => prev.map(day => {
         if (day.date !== date) return day;
         return {
            ...day,
            tasks: day.tasks.map((t: any) => {
               if (t.id === taskId) return { ...t, completed: !currentStatus };
               return t;
            })
         };
      });

      setCalendarData(updateData);
      setStatsData(updateData);

      try {
         await fetch('/api/tasks', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId, date, completed: !currentStatus })
         });
      } catch (error) {
         console.error("Toggle failed", error);
         // Revert
         const revertData = (prev: any[]) => prev.map(day => {
            if (day.date !== date) return day;
            return {
               ...day,
               tasks: day.tasks.map((t: any) => {
                  if (t.id === taskId) return { ...t, completed: currentStatus };
                  return t;
               })
            };
         });
         setCalendarData(revertData);
         setStatsData(revertData);
      }
   };

   // Frog Props for Day Detail
   const frogProps = {
      flyBalance: flyStatus.balance,
      animateBalance: false,
      animateHunger: false,
      hunger: hungerStatus.hunger,
      maxHunger: hungerStatus.maxHunger,
      // Note: rate/done/total are calculated inside DayDetailSheet for that specific day
   };


   if (status === 'loading') return <LoadingScreen message="Loading..." />;

   return (
      <main className="min-h-screen pb-12 bg-background flex flex-col items-center">
         <div className="w-full max-w-6xl px-4 py-8 md:px-8">

            {/* Header */}
            <div className="flex items-center justify-center mb-10 px-2 relative">
               <div className="flex flex-col items-center">
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground/50">
                     Overview
                  </span>
                  <h1 className="text-xl font-black tracking-tight text-foreground">
                     History
                  </h1>
               </div>
            </div>

            {/* Calendar */}
            <div className="relative mb-8">
               {loadingCalendar && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50 backdrop-blur-sm rounded-3xl">
                     <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  </div>
               )}
               <HistoryCalendar
                  currentDate={viewDate}
                  onDateChange={setViewDate}
                  selectedDate={selectedDate}
                  onSelectDate={setSelectedDate}
                  historyData={calendarData}
                  disableSwipe={!!selectedDate}
               />
            </div>

            {/* Insights Module */}
            <HistoryInsights
               historyData={filteredStatsData}
               stats={statsSummary}
               dateRange={statsFilter}
               onDateRangeChange={setStatsFilter}
               customDateRange={{ from: customFrom, to: customTo }}
               onCustomDateChange={(r) => { setCustomFrom(r.from); setCustomTo(r.to); }}
               selectedTags={selectedTagIds}
               onTagsChange={setSelectedTagIds}
               availableTags={availableTags}
            />

            {/* Day Popup */}
            <DayDetailSheet
               open={!!selectedDate}
               onClose={() => setSelectedDate(null)}
               date={selectedDate || format(new Date(), 'yyyy-MM-dd')}
               tasks={selectedDayTasks}
               onToggleTask={handleToggleTask}
               frogProps={frogProps}
            />

         </div>
      </main>
   );
}
