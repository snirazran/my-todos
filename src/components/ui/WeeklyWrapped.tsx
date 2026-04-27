'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Flame,
  Calendar,
  CalendarCheck,
  Target,
  Clock,
  Trophy,
  Sparkles,
  Zap,
  ChevronRight,
  Crown,
  Share2,
  PartyPopper,
  Shirt,
  Star,
  Compass,
  Waves,
} from 'lucide-react';
import Frog from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import { cn } from '@/lib/utils';
import type { WeeklyRecapData } from '@/app/api/weekly-recap/route';
import type { RecapInsightsResponse } from '@/app/api/weekly-recap/insights/route';

/* ------------------------------------------------------------------ */
/*  Constants & Helpers                                                */
/* ------------------------------------------------------------------ */

const SLIDE_DURATION = 7500; // 7.5 seconds for a premium feel

function getWeekRating(rate: number) {
  if (rate >= 90) return { label: 'Legendary', sub: 'You mastered the week!', color: '#10b981', bg: 'from-emerald-950 to-black', icon: Crown };
  if (rate >= 75) return { label: 'Great', sub: 'Solid consistency!', color: '#22c55e', bg: 'from-green-950 to-black', icon: Trophy };
  if (rate >= 60) return { label: 'Good', sub: 'Keep that momentum!', color: '#84cc16', bg: 'from-lime-950 to-black', icon: Zap };
  if (rate >= 40) return { label: 'Fair', sub: 'Room to grow next week.', color: '#f59e0b', bg: 'from-amber-950 to-black', icon: Target };
  return { label: 'Reset', sub: 'New week, new start.', color: '#ef4444', bg: 'from-red-950 to-black', icon: Flame };
}

/* ------------------------------------------------------------------ */
/*  Themed Background Elements                                         */
/* ------------------------------------------------------------------ */

function ParticleBackground({ color, count = 20 }: { color: string, count?: number }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ 
            x: Math.random() * 100 + '%', 
            y: Math.random() * 100 + '%', 
            opacity: 0,
            scale: Math.random() * 0.5 + 0.5 
          }}
          animate={{ 
            y: [null, '-20%', '120%'],
            opacity: [0, 0.4, 0],
          }}
          transition={{ 
            duration: Math.random() * 5 + 5, 
            repeat: Infinity, 
            delay: Math.random() * 5,
            ease: "linear"
          }}
          className="absolute w-1 h-1 rounded-full"
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

function PondBackground() {
  return (
    <div className="absolute inset-0 bg-[#020617] pointer-events-none">
      <motion.div
        animate={{ 
          scale: [1, 1.1, 1],
          rotate: [0, 5, 0],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-500/20 via-transparent to-transparent"
      />
      {Array.from({ length: 3 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 4], opacity: [0.3, 0] }}
          transition={{ duration: 6, repeat: Infinity, delay: i * 2, ease: "easeOut" }}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border border-blue-400/20 rounded-full"
        />
      ))}
    </div>
  );
}

function SpecialistBackground({ accent }: { accent: string }) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      <div className="absolute inset-0 opacity-10 bg-[grid-white/5] [mask-image:radial-gradient(white,transparent_70%)]" />
      <motion.div
        animate={{ 
          rotate: 360,
          scale: [1, 1.2, 1],
        }}
        transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
        className="absolute -right-20 -top-20 w-96 h-96 rounded-full blur-[100px]"
        style={{ backgroundColor: accent + '20' }}
      />
      <motion.div
        animate={{ 
          rotate: -360,
          scale: [1, 1.3, 1],
        }}
        transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
        className="absolute -left-20 -bottom-20 w-96 h-96 rounded-full blur-[100px]"
        style={{ backgroundColor: accent + '10' }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function WeeklyWrapped({
  data,
  indices,
  onClose,
}: {
  data: WeeklyRecapData;
  indices: { skin: number; mood: number; hat: number; body: number; hand_item: number };
  onClose: () => void;
}) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [progress, setProgress] = useState(0);
  const [aiInsights, setAiInsights] = useState<RecapInsightsResponse | null>(null);
  const rating = useMemo(() => getWeekRating(data.completionRate), [data.completionRate]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!data.isPremium) return;
    fetch('/api/weekly-recap/insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
      .then((r) => r.json())
      .then((d) => setAiInsights(d))
      .catch(() => {});
  }, [data]);

  const handleFinish = useCallback(() => {
    fetch('/api/weekly-recap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekStart: data.weekStart }),
    }).catch(() => {});
    onClose();
  }, [data.weekStart, onClose]);

  const handleNext = useCallback(() => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide((prev) => prev + 1);
      setProgress(0);
    } else {
      handleFinish();
    }
  }, [currentSlide, handleFinish]);

  const handlePrev = useCallback(() => {
    if (currentSlide > 0) {
      setCurrentSlide((prev) => prev - 1);
      setProgress(0);
    }
  }, [currentSlide]);

  useEffect(() => {
    const step = 100;
    const increment = (step / SLIDE_DURATION) * 100;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setProgress((prev) => {
        const next = prev + increment;
        if (next >= 100) {
          handleNext();
          return 0;
        }
        return next;
      });
    }, step);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentSlide, handleNext]);

  const slides = useMemo(() => [
    // 0: Intro (Pond Theme)
    {
      id: 'intro',
      background: <PondBackground />,
      content: (
        <div className="relative flex flex-col items-center justify-center h-full text-center px-6 z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="mb-12"
          >
            <div className="relative h-64 w-80 flex items-center justify-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 rounded-full border border-primary/10 p-6"
              >
                <div className="w-full h-full rounded-full border-2 border-dotted border-primary/20" />
              </motion.div>
              <Frog width={280} height={210} indices={indices} />
            </div>
          </motion.div>
          <div className="space-y-6">
            <motion.h1
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-6xl font-black tracking-tighter leading-[0.85] italic"
            >
              YOUR WEEK,<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-indigo-400 to-emerald-400">WRAPPED.</span>
            </motion.h1>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10"
            >
              <Waves className="w-3 h-3 text-primary animate-pulse" />
              <span className="text-white/40 font-black tracking-[0.2em] uppercase text-[10px]">
                {new Date(data.weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — {new Date(data.weekEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </motion.div>
          </div>
        </div>
      ),
    },
    // 1: Overall Score
    {
      id: 'score',
      background: (
        <div className="absolute inset-0 bg-[#020617]">
          <ParticleBackground color={rating.color} />
          <div className={cn("absolute inset-0 opacity-40 bg-gradient-to-b", rating.bg)} />
        </div>
      ),
      content: (
        <div className="flex flex-col items-center justify-center h-full text-center px-6 relative z-10">
          <div className="relative mb-12">
             <motion.div
               initial={{ scale: 0.5, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               transition={{ type: 'spring', damping: 12, delay: 0.2 }}
               className="text-[140px] leading-none font-black tracking-tighter italic"
               style={{ color: rating.color }}
             >
               {data.completionRate}%
             </motion.div>
             <motion.div
               initial={{ rotate: -40, opacity: 0, scale: 0 }}
               animate={{ rotate: -15, opacity: 1, scale: 1 }}
               transition={{ delay: 0.6, type: 'spring' }}
               className="absolute -top-16 -right-12"
             >
               <rating.icon className="w-24 h-24 text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.4)]" />
             </motion.div>
          </div>
          <motion.div 
            initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 }}
            className="space-y-2"
          >
            <h2 className="text-5xl font-black uppercase italic tracking-tighter" style={{ color: rating.color }}>{rating.label}</h2>
            <p className="text-xl text-white/60 font-black uppercase tracking-widest">{rating.sub}</p>
          </motion.div>
          
          <div className="mt-16 grid grid-cols-2 gap-4 w-full max-w-xs">
            {[
              { label: 'Tasks', val: data.tasksCompleted, icon: CalendarCheck, color: 'text-primary' },
              { label: 'Days', val: data.activeDays, icon: Zap, color: 'text-amber-400' }
            ].map((st, i) => (
              <motion.div
                key={st.label}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.8 + i * 0.1 }}
                className="bg-white/5 backdrop-blur-3xl p-6 rounded-[32px] border border-white/10 text-left relative overflow-hidden"
              >
                <st.icon className={cn("w-5 h-5 mb-4", st.color)} />
                <div className="text-4xl font-black italic">{st.val}</div>
                <div className="text-[10px] font-black uppercase text-white/30 tracking-widest">{st.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      ),
    },
    // 2: Flies & Skins (The Collector)
    {
      id: 'collection',
      background: (
        <div className="absolute inset-0 bg-[#09090b]">
           <ParticleBackground color="#f59e0b" count={15} />
           <div className="absolute inset-0 opacity-30 bg-gradient-to-br from-amber-900/50 via-purple-950/40 to-black" />
           {/* Background Fly Swarm */}
           {Array.from({ length: 5 }).map((_, i) => (
             <motion.div
               key={i}
               initial={{ x: Math.random() * 100 + '%', y: '110%' }}
               animate={{ y: '-10%', x: (Math.random() * 100) + '%' }}
               transition={{ duration: Math.random() * 10 + 10, repeat: Infinity, delay: i * 2 }}
               className="absolute opacity-5 pointer-events-none"
             >
               <Fly size={40} />
             </motion.div>
           ))}
        </div>
      ),
      content: (
        <div className="flex flex-col items-center justify-center h-full px-6 relative z-10">
          <motion.div 
             initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
             className="text-center mb-12"
          >
            <h2 className="text-4xl font-black italic tracking-tighter uppercase text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-purple-400">The Collector</h2>
          </motion.div>

          <div className="grid grid-cols-1 gap-5 w-full max-w-xs">
            {/* Flies Card */}
            <motion.div
              initial={{ x: -30, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="bg-white/5 p-8 rounded-[40px] border border-white/10 text-left relative overflow-hidden group shadow-2xl"
            >
              <div className="absolute -right-4 -top-4 w-44 h-44 z-0 pointer-events-none drop-shadow-[0_0_15px_rgba(251,191,36,0.4)]">
                <Fly size={160} className="w-full h-full opacity-60 rotate-12 group-hover:rotate-[25deg] transition-transform duration-700" />
              </div>
              <div className="relative z-10">
                <div className="text-[10px] font-black uppercase text-amber-400 tracking-[0.3em] mb-2">Flies Caught</div>
                <div className="text-7xl font-black tracking-tighter italic">{data.fliesEarned}</div>
                <p className="text-xs text-white/40 mt-3 font-bold uppercase tracking-wider">A feast for the queen</p>
              </div>
            </motion.div>

            {/* Skins Card */}
            <motion.div
              initial={{ x: 30, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="bg-white/5 p-8 rounded-[40px] border border-white/10 text-left relative overflow-hidden shadow-2xl group"
            >
              <div className="absolute -right-6 -top-6 w-44 h-44 z-0 pointer-events-none drop-shadow-[0_0_15px_rgba(168,85,247,0.4)]">
                {data.skinsRarestDetail ? (
                   <div className="scale-125 rotate-[-10deg] group-hover:rotate-0 transition-transform duration-1000">
                     <Frog 
                       width={180} 
                       height={140} 
                       indices={{
                         ...indices,
                         [data.skinsRarestDetail.slot]: data.skinsRarestDetail.riveIndex
                       }} 
                     />
                   </div>
                ) : (
                  <Shirt className="w-full h-full -rotate-12 opacity-10 text-purple-400" />
                )}
              </div>
              <div className="relative z-10">
                <div className="text-[10px] font-black uppercase text-purple-400 tracking-[0.3em] mb-2">New Wardrobe</div>
                <div className="text-7xl font-black tracking-tighter italic">+{data.skinsNew || 0}</div>
                {data.skinsRarest && (
                  <div className="mt-4 inline-flex items-center gap-2 bg-purple-500/20 px-3 py-1.5 rounded-full border border-purple-500/30">
                    <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                    <span className="text-[10px] font-black uppercase text-white tracking-widest">{data.skinsRarest}</span>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      ),
    },
    // 3: Focus Areas (The Specialist)
    ...(data.focusAreas && data.focusAreas.length > 0 ? [{
      id: 'focus-areas',
      background: <SpecialistBackground accent={data.focusAreas[0]?.accent || '#3b82f6'} />,
      content: (
        <div className="flex flex-col items-center justify-center h-full px-6 relative z-10">
          <motion.div 
            initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            className="text-center mb-10"
          >
            <div className="w-16 h-16 rounded-3xl bg-blue-500/10 flex items-center justify-center mx-auto mb-6 border border-blue-500/20">
              <Compass className="w-8 h-8 text-blue-400" />
            </div>
            <h2 className="text-4xl font-black italic tracking-tighter uppercase leading-[0.9]">Your Life,<br/><span className="text-blue-400">In Focus</span></h2>
          </motion.div>

          <div className="space-y-4 w-full max-w-xs">
            {data.focusAreas.slice(0, 3).map((area, i) => (
              <motion.div
                key={area.categoryId}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: i * 0.15 + 0.3 }}
                className="group bg-white/5 p-6 rounded-[32px] border border-white/10 relative overflow-hidden"
              >
                <div className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: area.accent }} />
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-black uppercase tracking-[0.2em]" style={{ color: area.accent }}>{area.categoryName}</span>
                  <div className="flex gap-2">
                    {area.topTags.slice(0, 2).map(tag => (
                      <div key={tag.tagId} className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.2)]" style={{ backgroundColor: tag.tagColor }} />
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-6">
                  <div>
                    <div className="text-2xl font-black italic">{area.tasksCompleted}</div>
                    <div className="text-[8px] font-black text-white/20 uppercase tracking-widest">Tasks</div>
                  </div>
                  <div>
                    <div className="text-2xl font-black italic">{area.habitsCompleted}</div>
                    <div className="text-[8px] font-black text-white/20 uppercase tracking-widest">Habits</div>
                  </div>
                  <div>
                    <div className="text-2xl font-black italic">{area.focusMinutes}m</div>
                    <div className="text-[8px] font-black text-white/20 uppercase tracking-widest">Focus</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      ),
    }] : []),
    // 4: AI Fortune (The Oracle)
    ...(aiInsights?.summary && aiInsights?.insights ? [{
      id: 'ai',
      background: (
        <div className="absolute inset-0 bg-[#0c0a09]">
          <ParticleBackground color="#d946ef" count={30} />
          <motion.div
            animate={{ opacity: [0.1, 0.2, 0.1] }}
            transition={{ duration: 4, repeat: Infinity }}
            className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,_#701a75_0%,_transparent_60%)]"
          />
        </div>
      ),
      content: (
        <div className="flex flex-col items-center justify-center h-full text-center px-8 relative z-10">
          <motion.div 
            initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            className="mb-10"
          >
            <div className="w-20 h-20 rounded-full bg-fuchsia-500/10 border border-fuchsia-500/30 flex items-center justify-center shadow-[0_0_30px_rgba(217,70,239,0.2)]">
              <Sparkles className="w-10 h-10 text-fuchsia-400" />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white/5 backdrop-blur-3xl p-10 rounded-[60px] border border-white/10 relative shadow-2xl"
          >
            <div className="text-3xl font-black leading-tight italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-white via-white to-fuchsia-200">
              "{aiInsights.summary}"
            </div>
          </motion.div>
          
          <div className="mt-12 flex flex-wrap justify-center gap-3">
            {aiInsights.insights?.map((ins, i) => (
              <motion.div 
                key={i}
                initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.7 + i * 0.1 }}
                className="bg-white/10 px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white/60 border border-white/5"
              >
                {ins.emoji} {ins.title}
              </motion.div>
            ))}
          </div>
        </div>
      ),
    }] : []),
    // 5: Outro (The Legend)
    {
      id: 'outro',
      background: (
        <div className="absolute inset-0 bg-black">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,_#1e1b4b_0%,_transparent_50%)]" />
        </div>
      ),
      content: (
        <div className="flex flex-col items-center justify-center h-full text-center px-6 relative z-10">
          <h2 className="text-5xl font-black mb-12 italic tracking-tighter uppercase leading-[0.85] text-transparent bg-clip-text bg-gradient-to-b from-white to-white/40">
            Another Week,<br/>Another Legend.
          </h2>

          <div className="grid grid-cols-2 gap-4 w-full max-w-xs mb-12">
            <div className="text-left p-6 rounded-[40px] bg-white/5 border border-white/10">
              <div className="text-white/20 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Success</div>
              <div className="text-5xl font-black italic tracking-tighter text-primary">{data.completionRate}%</div>
            </div>
            <div className="text-left p-6 rounded-[40px] bg-white/5 border border-white/10">
              <div className="text-white/20 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Focus</div>
              <div className="text-5xl font-black italic tracking-tighter text-blue-400">{data.totalFocusMinutes}m</div>
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={(e) => {
              e.stopPropagation();
              handleFinish();
            }}
            className="w-full max-w-xs py-6 rounded-[35px] bg-primary text-primary-foreground font-black text-2xl shadow-[0_20px_50px_rgba(34,197,94,0.3)] uppercase tracking-tighter italic"
          >
            START NEW WEEK
          </motion.button>
          
          <button className="mt-8 flex items-center gap-2 text-white/20 font-black text-xs uppercase tracking-[0.3em] hover:text-white transition-colors">
            <Share2 className="w-4 h-4" /> Share Story
          </button>
        </div>
      ),
    },
  ], [data, rating, aiInsights, indices, handleFinish]);

  return (
    <div className="fixed inset-0 z-[1000] bg-black text-white select-none overflow-hidden flex flex-col font-sans">
      {/* Dynamic Background Wrapper */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`bg-${slides[currentSlide].id}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1 }}
          className="absolute inset-0 z-0"
        >
          {slides[currentSlide].background}
        </motion.div>
      </AnimatePresence>

      {/* Progress Bars Container */}
      <div className="absolute top-4 left-4 right-4 z-[1050] flex gap-2 px-1">
        {slides.map((_, i) => (
          <div key={i} className="h-1 flex-1 bg-white/10 rounded-full overflow-hidden">
            <div 
              className="h-full bg-white transition-all ease-linear"
              style={{ 
                width: i < currentSlide ? '100%' : i === currentSlide ? `${progress}%` : '0%',
                transitionDuration: i === currentSlide ? '100ms' : '0ms'
              }}
            />
          </div>
        ))}
      </div>

      {/* Persistent Header */}
      <div className="absolute top-10 left-6 right-6 z-[1050] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center font-black text-sm shadow-lg shadow-primary/20 rotate-3">FT</div>
          <div className="flex flex-col">
            <span className="font-black text-[10px] tracking-[0.3em] uppercase opacity-50">Weekly</span>
            <span className="font-black text-xs tracking-tight uppercase">Wrapped</span>
          </div>
        </div>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }} 
          className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-white/20 transition-colors pointer-events-auto"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Slide Content Layer */}
      <div className="relative flex-1 z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={slides[currentSlide].id}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -40 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0"
          >
            {slides[currentSlide].content}
          </motion.div>
        </AnimatePresence>

        {/* Interaction Overlays */}
        <div className="absolute inset-y-0 left-0 w-[40%] z-[1020]" onClick={handlePrev} />
        <div className="absolute inset-y-0 right-0 w-[60%] z-[1020]" onClick={handleNext} />
      </div>

      {/* Dynamic Interaction Hint */}
      {currentSlide < slides.length - 1 && (
        <div className="absolute bottom-10 left-0 right-0 text-center z-[1050] pointer-events-none">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.4, 0], y: [0, 10, 0] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="text-[9px] font-black uppercase tracking-[0.5em] text-white/50"
          >
            Tap to Advance
          </motion.div>
        </div>
      )}
    </div>
  );
}
