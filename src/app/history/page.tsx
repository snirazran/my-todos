'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ArrowLeft, Calendar as CalendarIcon, Loader2, Tag, X } from 'lucide-react';
import { subDays, startOfToday, format } from 'date-fns';
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
  const router = useRouter();
  const [filter, setFilter] = useState<DateRangeOption>('7d');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [showTagFilter, setShowTagFilter] = useState(false);
  
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

  const toggleTag = (id: string) => {
    setSelectedTagIds(prev => 
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
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
              Review your past accomplishments and habits.
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
              />

              <div className="w-full">
                <HistoryStats data={stats} className="grid-cols-1 md:grid-cols-3 lg:grid-cols-1 mb-0" />
              </div>
           </div>

           {/* Right Column: Filters & List */}
           <div className="flex flex-col gap-4 lg:col-span-8 lg:gap-6">
              <div className="flex flex-col gap-3">
                 <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sticky top-2 z-20 bg-background/90 backdrop-blur-md py-2 -mx-2 px-2 md:static md:bg-transparent md:p-0">
                    <HistoryFilter value={filter} onChange={setFilter} />
                    {filter !== 'custom' && (
                       <div className="hidden md:flex items-center text-sm text-slate-400 gap-2">
                          <CalendarIcon className="w-4 h-4" />
                          <span>{filter === '7d' ? 'Last 7 Days (Excl. Today)' : 'Last 30 Days (Excl. Today)'}</span>
                       </div>
                    )}
                 </div>

                 <AnimatePresence>
                   {filter === 'custom' && (
                     <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                       <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 p-4 bg-card/80 backdrop-blur-xl rounded-[24px] border border-border/50 shadow-sm">
                         <div className="flex-1 flex flex-col gap-1.5">
                           <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">From</label>
                           <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-border/50 bg-background/50 text-foreground font-bold focus:ring-2 focus:ring-primary/20 outline-none text-sm transition-all" />
                         </div>
                         <div className="hidden sm:flex items-center justify-center self-end pb-3 text-muted-foreground/30">
                           <ArrowLeft className="w-4 h-4 rotate-180" strokeWidth={3} />
                         </div>
                         <div className="flex-1 flex flex-col gap-1.5">
                           <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">To</label>
                           <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-border/50 bg-background/50 text-foreground font-bold focus:ring-2 focus:ring-primary/20 outline-none text-sm transition-all" />
                         </div>
                       </div>
                     </motion.div>
                   )}
                 </AnimatePresence>

                 {/* Tag Filter Trigger */}
                 {availableTags.length > 0 && (
                    <div className="flex items-center gap-2">
                       <button
                          onClick={() => setShowTagFilter(true)}
                          className={cn(
                             "inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all border",
                             selectedTagIds.length > 0 
                                ? "bg-primary/10 text-primary border-primary/20 shadow-sm" 
                                : "bg-card/80 backdrop-blur-md text-muted-foreground border-border/50 hover:border-primary/30"
                          )}
                       >
                          <Tag className="w-3.5 h-3.5" strokeWidth={3} />
                          <span>
                            {selectedTagIds.length === 0 
                              ? 'Filter by Tag' 
                              : selectedTagIds.length === 1 
                                ? availableTags.find(t => t.id === selectedTagIds[0])?.name 
                                : `${selectedTagIds.length} Tags Selected`}
                          </span>
                          {selectedTagIds.length > 0 && (
                             <X 
                                className="w-3 h-3 ml-1 hover:text-rose-500 transition-colors" 
                                strokeWidth={4}
                                onClick={(e) => { e.stopPropagation(); setSelectedTagIds([]); }} 
                             />
                          )}
                       </button>
                    </div>
                 )}
              </div>

              <AnimatePresence>
                 {showTagFilter && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
                       <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowTagFilter(false)} className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
                       <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative w-full max-w-lg bg-card border border-border/50 shadow-2xl rounded-[32px] overflow-hidden">
                          <div className="p-6 border-b border-border/50 flex items-center justify-between">
                             <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-primary/10 text-primary"><Tag size={20} strokeWidth={2.5} /></div>
                                <h2 className="text-xl font-black uppercase tracking-tight">Select Tags</h2>
                             </div>
                             <button onClick={() => setShowTagFilter(false)} className="p-2 rounded-xl bg-secondary text-muted-foreground hover:text-foreground transition-colors"><X size={20} strokeWidth={2.5} /></button>
                          </div>
                          <div className="p-6 max-h-[60vh] overflow-y-auto no-scrollbar">
                             <div className="grid grid-cols-2 gap-3">
                                <button onClick={() => setSelectedTagIds([])} className={cn("px-4 py-3 rounded-2xl text-[13px] font-bold uppercase tracking-wider transition-all border text-center", selectedTagIds.length === 0 ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20" : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted")}>Clear All</button>
                                {availableTags.map(tag => (
                                   <button key={tag.id} onClick={() => toggleTag(tag.id)} className={cn("px-4 py-3 rounded-2xl text-[13px] font-bold uppercase tracking-wider transition-all border flex items-center gap-3", selectedTagIds.includes(tag.id) ? "ring-2 ring-offset-2 ring-offset-card scale-[1.02]" : "bg-muted/30 border-transparent hover:bg-muted/50")} style={{ backgroundColor: selectedTagIds.includes(tag.id) ? `${tag.color}20` : undefined, color: tag.color, borderColor: selectedTagIds.includes(tag.id) ? `${tag.color}40` : undefined }}><span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color }} /><span className="truncate">{tag.name}</span></button>
                                ))}
                             </div>
                          </div>
                          <div className="p-4 bg-muted/30 border-t border-border/50 flex justify-center">
                             <Button onClick={() => setShowTagFilter(false)} className="rounded-xl px-12 py-6 font-black uppercase tracking-[0.2em] text-[11px] shadow-lg shadow-primary/20">Apply Filters</Button>
                          </div>
                       </motion.div>
                    </div>
                 )}
              </AnimatePresence>

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
