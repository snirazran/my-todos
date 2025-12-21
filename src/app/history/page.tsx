'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ArrowLeft, Calendar as CalendarIcon, Loader2, Tag } from 'lucide-react';
import { subDays, startOfToday, format, startOfYesterday } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import useSWR from 'swr';

import { LoadingScreen } from '@/components/ui/LoadingScreen';
import HistoryStats from '@/components/history/HistoryStats';
import HistoryFilter, { DateRangeOption } from '@/components/history/HistoryFilter';
import HistoryList from '@/components/history/HistoryList';
import { Button } from '@/components/ui/button';
import { FrogDisplay } from '@/components/ui/FrogDisplay';
import { type FrogHandle } from '@/components/ui/frog';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
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
  const router = useRouter();
  const [filter, setFilter] = useState<DateRangeOption>('7d');
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  
  // Custom date range state
  const [customFrom, setCustomFrom] = useState<string>(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [customTo, setCustomTo] = useState<string>(format(subDays(new Date(), 1), 'yyyy-MM-dd')); // Default to yesterday

  const [historyData, setHistoryData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const { data: tagsData } = useSWR('/api/tags', (url) => fetch(url).then((r) => r.json()));
  const availableTags: { id: string; name: string; color: string }[] = tagsData?.tags || [];

  /* ---- Frog Animation State ---- */
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

  // Prevent scrolling during cinematic
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

  // Initial Data Fetch (Balance + History)
  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        // 1. Fetch Fly Balance
        const todayStr = format(startOfToday(), 'yyyy-MM-dd');
        const flyRes = await fetch(`/api/tasks?date=${todayStr}`);
        if (flyRes.ok) {
           const flyJson = await flyRes.json();
           if (flyJson.flyStatus?.balance !== undefined) {
              setFlyBalance(flyJson.flyStatus.balance);
           }
        }

        // 2. Fetch History
        const today = startOfToday();
        let fromDate = new Date();
        let toDate = subDays(today, 1); // Always end yesterday by default for standard filters

        // Determine dates based on filter
        switch (filter) {
          case '7d':
            fromDate = subDays(today, 7); 
            break;
          case '30d':
            fromDate = subDays(today, 30);
            break;
          case 'custom':
            // Use user selected dates
            if (customFrom) fromDate = new Date(customFrom);
            if (customTo) toDate = new Date(customTo);
            break;
        }

        const fromStr = format(fromDate, 'yyyy-MM-dd');
        const toStr = format(toDate, 'yyyy-MM-dd');

        const res = await fetch(`/api/history?from=${fromStr}&to=${toStr}`);
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
  }, [filter, session, status, customFrom, customTo]);

  // Filter history data by tag
  const filteredHistory = useMemo(() => {
    if (!selectedTagId) return historyData;
    return historyData.map(day => ({
      ...day,
      tasks: day.tasks.filter((t: any) => t.tags?.includes(selectedTagId))
    })).filter(day => day.tasks.length > 0);
  }, [historyData, selectedTagId]);

  // Updated stats calculation (combined view)
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

  // Handler for task toggling
  const handleToggleTask = async (taskId: string, date: string, currentStatus: boolean) => {
     if (cinematic || grab) return; // Prevent interaction during animation

     const performUpdate = async () => {
       // 1. Optimistic Update
       const newStatus = !currentStatus;
       
       setHistoryData(prevData => prevData.map(day => {
          if (day.date !== date) return day;
          return {
             ...day,
             tasks: day.tasks.map((t: any) => {
                if (t.id === taskId) {
                   return { ...t, completed: newStatus };
                }
                return t;
             })
          };
       }));

       // 2. API Call
       try {
          const res = await fetch('/api/tasks', {
             method: 'PUT',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({
                taskId,
                date,
                completed: newStatus
             })
          });

          if (!res.ok) {
             throw new Error("Failed to update task");
          }
          
          // Update fly balance if returned
          const data = await res.json();
          if (data.flyStatus?.balance !== undefined) {
             setFlyBalance(data.flyStatus.balance);
          }

       } catch (error) {
          console.error("Failed to persist task toggle", error);
          // Revert on error
          setHistoryData(prevData => prevData.map(day => {
             if (day.date !== date) return day;
             return {
                ...day,
                tasks: day.tasks.map((t: any) => {
                   if (t.id === taskId) {
                      return { ...t, completed: currentStatus }; // Revert to old status
                   }
                   return t;
                })
             };
          }));
       }
     };

     // If marking as complete, trigger tongue first
     if (!currentStatus) {
        const uniqueKey = `${date}::${taskId}`;
        await triggerTongue({
           key: uniqueKey,
           completed: true,
           onPersist: performUpdate
        });
     } else {
        // Marking as incomplete, just do it
        await performUpdate();
     }
  };

  // Initial Data Fetch (Balance + History)

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors">
      <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-4 md:space-y-8">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
              Task History
            </h1>
            <p className="text-slate-500 dark:text-slate-400">
              Review your past accomplishments and habits.
            </p>
          </div>
          
          <div className="flex items-center gap-3">
             <Link href="/">
                <Button variant="outline" size="sm" className="hidden md:flex gap-2">
                   <ArrowLeft className="w-4 h-4" />
                   Back to Board
                </Button>
             </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-8 items-start">
           {/* Left Column: Frog & Stats */}
           <div className="lg:col-span-4 space-y-4 lg:space-y-6 lg:sticky lg:top-8">
              {/* Frog Display */}
              <div className="flex flex-col items-center w-full">
                <FrogDisplay
                  frogRef={frogRef}
                  frogBoxRef={frogBoxRef}
                  mouthOpen={!!grab}
                  mouthOffset={{ y: -4 }}
                  indices={indices}
                  openWardrobe={openWardrobe}
                  onOpenChange={setOpenWardrobe}
                  flyBalance={flyBalance}
                />
              </div>

              {/* Stats Section (Vertical Stack on Desktop) */}
              <HistoryStats 
                 data={stats} 
                 className="grid-cols-1 md:grid-cols-3 lg:grid-cols-1 mb-0"
              />
           </div>

           {/* Right Column: Filters & List */}
           <div className="lg:col-span-8 space-y-4 lg:space-y-6">
              {/* Controls Container */}
              <div className="flex flex-col gap-3">
                 {/* Filter Tabs */}
                 <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sticky top-2 z-20 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-md py-2 -mx-2 px-2 md:static md:bg-transparent md:p-0">
                    <HistoryFilter value={filter} onChange={setFilter} />
                    
                    {/* Context Label (Only show if not custom) */}
                    {filter !== 'custom' && (
                       <div className="hidden md:flex items-center text-sm text-slate-400 gap-2">
                          <CalendarIcon className="w-4 h-4" />
                          <span>
                             {filter === '7d' 
                                   ? 'Last 7 Days (Excl. Today)' 
                                   : 'Last 30 Days (Excl. Today)'}
                          </span>
                       </div>
                    )}
                 </div>

                 {/* Custom Date Pickers (Animated Expansion) */}
                 <AnimatePresence>
                   {filter === 'custom' && (
                     <motion.div
                       initial={{ height: 0, opacity: 0 }}
                       animate={{ height: 'auto', opacity: 1 }}
                       exit={{ height: 0, opacity: 0 }}
                       className="overflow-hidden"
                     >
                       <div className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                         <div className="flex items-center gap-2 w-full sm:w-auto">
                           <label className="text-sm font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">From:</label>
                           <input
                             type="date"
                             value={customFrom}
                             onChange={(e) => setCustomFrom(e.target.value)}
                             className="w-full sm:w-auto px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none text-sm"
                           />
                         </div>
                         <div className="hidden sm:block text-slate-400">→</div>
                         <div className="flex items-center gap-2 w-full sm:w-auto">
                           <label className="text-sm font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">To:</label>
                           <input
                             type="date"
                             value={customTo}
                             onChange={(e) => setCustomTo(e.target.value)}
                             className="w-full sm:w-auto px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none text-sm"
                           />
                         </div>
                       </div>
                     </motion.div>
                   )}
                 </AnimatePresence>

                 {/* Tag Filter */}
                 {availableTags.length > 0 && (
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar p-1 pb-2 -mx-1 px-1">
                       <button
                          onClick={() => setSelectedTagId(null)}
                          className={`
                             whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold transition-all border
                             ${!selectedTagId 
                                ? 'bg-slate-800 text-white border-slate-800 dark:bg-white dark:text-slate-900 dark:border-white' 
                                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'}
                          `}
                       >
                          All Tags
                       </button>
                       {availableTags.map(tag => (
                          <button
                             key={tag.id}
                             onClick={() => setSelectedTagId(selectedTagId === tag.id ? null : tag.id)}
                             className={`
                                whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold transition-all border flex items-center gap-1.5
                                ${selectedTagId === tag.id 
                                   ? 'ring-2 ring-offset-1 ring-offset-white dark:ring-offset-slate-900' 
                                   : 'opacity-70 hover:opacity-100 bg-white dark:bg-slate-800'}
                             `}
                             style={{
                                backgroundColor: selectedTagId === tag.id ? `${tag.color}20` : undefined,
                                color: tag.color,
                                borderColor: selectedTagId === tag.id ? `${tag.color}40` : `${tag.color}20`,
                                boxShadow: selectedTagId === tag.id ? `0 0 0 1px ${tag.color}` : 'none',
                             }}
                          >
                             {tag.name}
                          </button>
                       ))}
                    </div>
                 )}
              </div>

              {/* Main List */}
              <div className="relative min-h-[400px]">
                 {loading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-slate-900/50 z-10 backdrop-blur-sm rounded-xl">
                       <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
                    </div>
                 ) : null}
                 
                 <HistoryList 
                    history={filteredHistory} 
                    onToggleTask={handleToggleTask} 
                    setFlyRef={(key, el) => { flyRefs.current[key] = el; }}
                    visuallyCompleted={visuallyDone}
                 />
              </div>
           </div>
        </div>

      </div>
      
      {/* Mobile Floating Action Button for Back */}
      
      {/* Mobile Floating Action Button for Back */}
      <div className="md:hidden fixed bottom-6 right-6 z-50">
        <Link href="/">
           <Button className="rounded-full w-12 h-12 shadow-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:scale-105 transition-transform">
              <ArrowLeft className="w-6 h-6" />
           </Button>
        </Link>
      </div>

      {/* SVG Tongue Overlay */}
      {grab && (
        <svg
          key={grab.startAt}
          className="fixed inset-0 z-50 pointer-events-none"
          width={vp.w}
          height={vp.h}
          viewBox={`0 0 ${vp.w} ${vp.h}`}
          preserveAspectRatio="none"
          style={{ width: vp.w, height: vp.h }}
        >
          <defs>
            <linearGradient id="tongue-grad" x1="0" y1="0" x2="0" y2="1">
              <stop stopColor="#ff6b6b" />
              <stop offset="1" stopColor="#f43f5e" />
            </linearGradient>
          </defs>

          <motion.path
            key={`tongue-${grab.startAt}`}
            ref={tonguePathEl}
            d="M0 0 L0 0"
            fill="none"
            stroke="url(#tongue-grad)"
            strokeWidth={TONGUE_STROKE}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: [0, 1, 0] }}
            transition={{
              delay: OFFSET_MS / 1000,
              duration: TONGUE_MS / 1000,
              times: [0, HIT_AT, 1],
              ease: 'linear',
            }}
          />

          {tipVisible && tip && (
            <g transform={`translate(${tip.x}, ${tip.y})`}>
              <circle r={10} fill="transparent" />
              <image
                href="/fly.svg"
                x={-FLY_PX / 2}
                y={-FLY_PX / 2}
                width={FLY_PX}
                height={FLY_PX}
              />
            </g>
          )}
        </svg>
      )}
    </main>
  );
}
