'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ArrowLeft, Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { subDays, startOfToday, format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import useSWR from 'swr';
import { useTaskData } from '@/hooks/useTaskData';

import { LoadingScreen } from '@/components/ui/LoadingScreen';
import HistoryMetrics from '@/components/history/HistoryMetrics';
import ActivityHeatmap from '@/components/history/ActivityHeatmap';
import HistoryTimeSelector, { DateRangeOption } from '@/components/history/HistoryTimeSelector';
import HistoryList from '@/components/history/HistoryList';
import { Button } from '@/components/ui/button';
import { FrogDisplay } from '@/components/ui/FrogDisplay';
import { type FrogHandle } from '@/components/ui/frog';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { cn } from '@/lib/utils';
import {
   HIT_AT,
   OFFSET_MS,
   TONGUE_MS,
   TONGUE_STROKE,
   useFrogTongue,
} from '@/hooks/useFrogTongue';

const FLY_PX = 24;

export default function HistoryPage() {
   const { data: session, status } = useSession();
   const { hungerStatus } = useTaskData();
   const router = useRouter();
   const [filter, setFilter] = useState<DateRangeOption>('7d');
   const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);


   const [customFrom, setCustomFrom] = useState<string>(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
   const [customTo, setCustomTo] = useState<string>(format(subDays(new Date(), 1), 'yyyy-MM-dd'));

   const [historyData, setHistoryData] = useState<any[]>([]);
   const [loading, setLoading] = useState(true);

   const { data: tagsData } = useSWR('/api/tags', (url) => fetch(url).then((r) => r.json()));
   const availableTags: { id: string; name: string; color: string }[] = tagsData?.tags || [];

   const frogRef = useRef<FrogHandle>(null);
   const flyRefs = useRef<Record<string, HTMLDivElement | null>>({});
   const frogBoxRef = useRef<HTMLDivElement | null>(null);
   const [openWardrobe, setOpenWardrobe] = useState(false);
   const [flyBalance, setFlyBalance] = useState<number | undefined>(undefined);

   const { indices } = useWardrobeIndices(!!session);

   const {
      vp,
      cinematic,
      grab,
      tip,
      tipVisible,
      tonguePathEl,
      triggerTongue,
      visuallyDone,
   } = useFrogTongue({ frogRef, frogBoxRef, flyRefs });

   useEffect(() => {
      if (!cinematic) return;
      const stop = (e: Event) => e.preventDefault();
      window.addEventListener('wheel', stop, { passive: false });
      window.addEventListener('touchmove', stop, { passive: false });
      return () => {
         window.removeEventListener('wheel', stop as any);
         window.removeEventListener('touchmove', stop as any);
      };
   }, [cinematic]);

   useEffect(() => {
      if (status === 'loading') return;
      if (status === 'unauthenticated') {
         router.push('/login');
         return;
      }

      const fetchData = async () => {
         setLoading(true);
         try {
            const todayStr = format(startOfToday(), 'yyyy-MM-dd');
            const flyRes = await fetch(`/api/tasks?date=${todayStr}`);
            if (flyRes.ok) {
               const flyJson = await flyRes.json();
               if (flyJson.flyStatus?.balance !== undefined) {
                  setFlyBalance(flyJson.flyStatus.balance);
               }
            }

            const today = startOfToday();
            let fromDate = new Date();
            let toDate = subDays(today, 1);

            switch (filter) {
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
            if (!res.ok) throw new Error('Failed to fetch');

            const data = await res.json();
            setHistoryData(data);
         } catch (error) {
            console.error("History fetch error", error);
         } finally {
            setLoading(false);
         }
      };

      fetchData();
   }, [filter, session, status, customFrom, customTo, router]);

   const filteredHistory = useMemo(() => {
      if (selectedTagIds.length === 0) return historyData;
      return historyData.map(day => ({
         ...day,
         tasks: day.tasks.filter((t: any) =>
            selectedTagIds.some(id => t.tags?.includes(id))
         )
      })).filter(day => day.tasks.length > 0);
   }, [historyData, selectedTagIds]);

   const stats = useMemo(() => {
      let total = 0;
      let completed = 0;
      filteredHistory.forEach((day) => {
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
   }, [filteredHistory]);

   const handleToggleTask = async (taskId: string, date: string, currentStatus: boolean) => {
      if (cinematic || grab) return;

      const performUpdate = async () => {
         const newStatus = !currentStatus;
         setHistoryData(prevData => prevData.map(day => {
            if (day.date !== date) return day;
            return {
               ...day,
               tasks: day.tasks.map((t: any) => {
                  if (t.id === taskId) return { ...t, completed: newStatus };
                  return t;
               })
            };
         }));

         try {
            const res = await fetch('/api/tasks', {
               method: 'PUT',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ taskId, date, completed: newStatus })
            });
            const data = await res.json();
            if (data.flyStatus?.balance !== undefined) setFlyBalance(data.flyStatus.balance);
         } catch (error) {
            console.error("Failed to persist task toggle", error);
            setHistoryData(prevData => prevData.map(day => {
               if (day.date !== date) return day;
               return {
                  ...day,
                  tasks: day.tasks.map((t: any) => {
                     if (t.id === taskId) return { ...t, completed: currentStatus };
                     return t;
                  })
               };
            }));
         }
      };

      if (!currentStatus) {
         await triggerTongue({
            key: `${date}::${taskId}`,
            completed: true,
            onPersist: performUpdate
         });
      } else {
         await performUpdate();
      }
   };



   if (status === 'loading') return <LoadingScreen message="Loading history..." />;

   return (
      <main className="min-h-screen pb-48 md:pb-32 bg-background">
         <div className="px-4 py-6 mx-auto max-w-7xl md:px-8">
            {/* Header Section */}
            <div className="flex flex-col gap-4 mb-2 md:mb-6 md:flex-row md:items-center md:justify-between">
               <div>
                  <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-5xl">
                     Task History
                  </h1>
                  <p className="flex items-center gap-2 font-medium text-md md:text-lg text-muted-foreground">
                     <CalendarIcon className="w-4 h-4 md:w-5 md:h-5" />
                     Your productivity journey.
                  </p>
               </div>

               <div className="self-start hidden gap-2 md:flex md:self-auto">
                  <Link href="/">
                     <Button variant="outline" size="sm" className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium transition bg-card rounded-lg shadow-sm text-foreground hover:bg-accent border border-border">
                        <ArrowLeft className="w-4 h-4" />
                        <span>Back to Board</span>
                     </Button>
                  </Link>
               </div>
            </div>

            <div className="relative grid items-start grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-8">
               {/* Left Column: Frog & Stats */}
               <div className="z-10 flex flex-col gap-4 lg:col-span-4 lg:sticky lg:top-8 lg:gap-6">
                  <FrogDisplay
                     frogRef={frogRef}
                     frogBoxRef={frogBoxRef}
                     mouthOpen={!!grab}
                     mouthOffset={{ y: -4 }}
                     indices={indices}
                     openWardrobe={openWardrobe}
                     onOpenChange={setOpenWardrobe}
                     flyBalance={flyBalance}
                     rate={stats.completionRate}
                     done={stats.total}
                     animateBalance={false}
                     hunger={hungerStatus.hunger}
                     maxHunger={hungerStatus.maxHunger}
                  />


                  <div className="w-full">
                     <HistoryMetrics
                        historyData={filteredHistory}
                        completedTasks={stats.completed}
                        completionRate={stats.completionRate}
                        totalTasks={stats.total}
                     />
                  </div>
               </div>



               {/* Right Column: Filters & List */}
               <div className="flex flex-col gap-4 lg:col-span-8 lg:gap-6">

                  {/* Master Time Control (+ Filters) */}
                  <HistoryTimeSelector
                     dateRange={filter}
                     onDateRangeChange={setFilter}
                     customDateRange={{ from: customFrom, to: customTo }}
                     onCustomDateChange={(range) => {
                        setCustomFrom(range.from);
                        setCustomTo(range.to);
                     }}
                     selectedTags={selectedTagIds}
                     onTagsChange={setSelectedTagIds}
                     availableTags={availableTags}
                  />

                  {/* Collapsible Chart */}
                  {/* Collapsible Chart */}
                  <ActivityHeatmap
                     historyData={filteredHistory}
                     rangeDays={
                        filter === '7d' ? 7 :
                           filter === '30d' ? 30 :
                              Math.max(1, Math.ceil((new Date(customTo).getTime() - new Date(customFrom).getTime()) / (1000 * 60 * 60 * 24)) + 1)
                     }
                  />

                  <div className="relative min-h-[400px]">
                     {loading ? <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10 backdrop-blur-sm rounded-xl"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div> : null}
                     <HistoryList history={filteredHistory} onToggleTask={handleToggleTask} setFlyRef={(key, el) => { flyRefs.current[key] = el; }} visuallyCompleted={visuallyDone} />
                  </div>
               </div>
            </div>
         </div>

         {grab && (
            <svg key={grab.startAt} className="fixed inset-0 z-50 pointer-events-none" width={vp.w} height={vp.h} viewBox={`0 0 ${vp.w} ${vp.h}`} preserveAspectRatio="none" style={{ width: vp.w, height: vp.h }}>
               <defs><linearGradient id="tongue-grad" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#ff6b6b" /><stop offset="1" stopColor="#f43f5e" /></linearGradient></defs>
               <motion.path key={`tongue-${grab.startAt}`} ref={tonguePathEl} d="M0 0 L0 0" fill="none" stroke="url(#tongue-grad)" strokeWidth={TONGUE_STROKE} strokeLinecap="round" vectorEffect="non-scaling-stroke" initial={{ pathLength: 0 }} animate={{ pathLength: [0, 1, 0] }} transition={{ delay: OFFSET_MS / 1000, duration: TONGUE_MS / 1000, times: [0, HIT_AT, 1], ease: 'linear' }} />
               {tipVisible && tip && (<g transform={`translate(${tip.x}, ${tip.y})`}><circle r={10} fill="transparent" /><image href="/fly.svg" x={-FLY_PX / 2} y={-FLY_PX / 2} width={FLY_PX} height={FLY_PX} /></g>)}
            </svg>
         )}
      </main>
   );
}
