'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence, useSpring, useTransform } from 'framer-motion';
import {
  X,
  Flame,
  CalendarCheck,
  Target,
  Zap,
  Crown,
  Share2,
  Shirt,
  Star,
  Compass,
  Sparkles,
  Trophy
} from 'lucide-react';
import Frog from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import { cn } from '@/lib/utils';
import type { WeeklyRecapData } from '@/app/api/weekly-recap/route';
import type { RecapInsightsResponse } from '@/app/api/weekly-recap/insights/route';

/* ------------------------------------------------------------------ */
/*  Constants & Helpers                                                */
/* ------------------------------------------------------------------ */

const SLIDE_DURATION = 8000; // 8 seconds for pacing

function getWeekRating(rate: number) {
  if (rate >= 90) return { label: 'LEGENDARY', sub: 'Absolutely unstoppable.', color: '#10b981', bg: 'bg-emerald-950', icon: Crown };
  if (rate >= 75) return { label: 'GREAT', sub: 'Solid consistency.', color: '#22c55e', bg: 'bg-green-950', icon: Trophy };
  if (rate >= 60) return { label: 'GOOD', sub: 'Kept the momentum.', color: '#84cc16', bg: 'bg-lime-950', icon: Zap };
  if (rate >= 40) return { label: 'FAIR', sub: 'Room to grow.', color: '#f59e0b', bg: 'bg-amber-950', icon: Target };
  return { label: 'RESET', sub: 'A fresh start awaits.', color: '#ef4444', bg: 'bg-red-950', icon: Flame };
}

/* ------------------------------------------------------------------ */
/*  Micro-Interactions & Components                                    */
/* ------------------------------------------------------------------ */

function AnimatedNumber({ value, suffix = '', className }: { value: number, suffix?: string, className?: string }) {
  const spring = useSpring(0, { bounce: 0, duration: 2500 });
  const display = useTransform(spring, (current) => Math.round(current).toString() + suffix);
  
  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  return <motion.span className={className}>{display}</motion.span>;
}

const StaggeredText = ({ text, className, delay = 0, stagger = 0.1, style }: { text: string, className?: string, delay?: number, stagger?: number, style?: React.CSSProperties }) => {
  const words = text.split(" ");
  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      style={style}
      variants={{
        visible: { transition: { staggerChildren: stagger, delayChildren: delay } },
      }}
      className={cn("flex flex-wrap justify-center gap-[0.25em]", className)}
    >
      {words.map((word, i) => (
        <motion.span 
          key={i} 
          variants={{
            hidden: { y: 40, opacity: 0, rotate: 5 },
            visible: { y: 0, opacity: 1, rotate: 0, transition: { type: "spring", damping: 15, stiffness: 100 } }
          }}
          className="inline-block origin-bottom-left"
        >
          {word}
        </motion.span>
      ))}
    </motion.div>
  );
}

function NoiseOverlay() {
  return (
    <div 
      className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay"
      style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")' }}
    />
  );
}

function FloatingBlobs({ color1, color2 }: { color1: string, color2: string }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 mix-blend-screen">
      <motion.div
        animate={{ 
          scale: [1, 1.5, 1],
          x: ['0%', '30%', '0%'],
          y: ['0%', '20%', '0%'],
        }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-0 left-0 w-[150vw] h-[150vw] md:w-[80vw] md:h-[80vw] rounded-full blur-[100px] opacity-40 -translate-x-1/2 -translate-y-1/2"
        style={{ backgroundColor: color1 }}
      />
      <motion.div
        animate={{ 
          scale: [1, 1.3, 1],
          x: ['0%', '-40%', '0%'],
          y: ['0%', '40%', '0%'],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-0 right-0 w-[120vw] h-[120vw] md:w-[70vw] md:h-[70vw] rounded-full blur-[100px] opacity-30 translate-x-1/4 translate-y-1/4"
        style={{ backgroundColor: color2 }}
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
    const step = 50; // Smoother 50ms updates
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
    // 0: Intro (The Hook)
    {
      id: 'intro',
      bg: 'bg-indigo-950',
      blobs: ['#4f46e5', '#ec4899'],
      content: (
        <div className="relative flex flex-col items-center justify-center h-full text-center px-6 z-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            className="mb-8 relative"
          >
            <div className="relative h-64 w-80 flex items-center justify-center drop-shadow-[0_20px_50px_rgba(79,70,229,0.5)]">
              <motion.div
                animate={{ rotate: 360, scale: [1, 1.05, 1] }}
                transition={{ rotate: { duration: 30, repeat: Infinity, ease: 'linear' }, scale: { duration: 4, repeat: Infinity, ease: 'easeInOut' } }}
                className="absolute inset-0 rounded-full border border-indigo-400/20 p-6"
              >
                <div className="w-full h-full rounded-full border-2 border-dashed border-pink-400/30" />
              </motion.div>
              <Frog width={280} height={210} indices={indices} />
            </div>
          </motion.div>
          <div className="space-y-4">
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="text-indigo-200 font-bold tracking-[0.3em] uppercase text-xs"
            >
              Are you ready?
            </motion.p>
            <StaggeredText 
              text="YOUR WEEK UNWRAPPED" 
              delay={1.5}
              className="text-6xl md:text-7xl font-black tracking-tighter leading-[0.85] italic text-transparent bg-clip-text bg-gradient-to-br from-white via-indigo-100 to-pink-200"
            />
          </div>
        </div>
      ),
    },
    // 1: The Vibe (Score)
    {
      id: 'score',
      bg: 'bg-[#0f172a]', // Slate 950 base
      blobs: [rating.color, '#0ea5e9'],
      content: (
        <div className="flex flex-col h-full justify-center px-8 relative z-10">
          <motion.p 
            initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}
            className="text-2xl md:text-3xl font-bold italic text-white/60 mb-2"
          >
            This week, your vibe was...
          </motion.p>
          <StaggeredText 
            text={rating.label} 
            delay={1.2}
            className="text-[6rem] md:text-[8rem] font-black uppercase italic tracking-tighter leading-none mb-12 justify-start"
            style={{ color: rating.color }}
          />

          <motion.div 
            initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2, type: "spring" }}
            className="bg-white/5 backdrop-blur-2xl p-8 rounded-[40px] border border-white/10 shadow-2xl relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-50" />
            <div className="relative z-10 grid grid-cols-2 gap-6">
              <div>
                <div className="text-sm font-bold uppercase tracking-widest text-white/40 mb-1">Completion</div>
                <div className="text-5xl font-black italic"><AnimatedNumber value={data.completionRate} suffix="%" /></div>
              </div>
              <div>
                <div className="text-sm font-bold uppercase tracking-widest text-white/40 mb-1">Tasks Crushed</div>
                <div className="text-5xl font-black italic"><AnimatedNumber value={data.tasksCompleted} /></div>
              </div>
            </div>
            <motion.p 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 3.5 }}
              className="mt-6 text-lg font-medium text-white/70"
            >
              {rating.sub} You showed up for <span className="text-white font-bold">{data.activeDays}</span> days.
            </motion.p>
          </motion.div>
        </div>
      ),
    },
    // 2: The Focus (Focus Areas & Time)
    {
      id: 'focus',
      bg: 'bg-blue-950',
      blobs: ['#3b82f6', '#8b5cf6'],
      content: (
        <div className="flex flex-col h-full justify-center px-8 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="mb-8"
          >
            <p className="text-xl font-bold italic text-blue-200 mb-2">You locked in for...</p>
            <div className="text-7xl md:text-8xl font-black italic tracking-tighter leading-none text-white">
              <AnimatedNumber value={data.totalFocusMinutes} />
              <span className="text-4xl ml-2 text-blue-400">minutes.</span>
            </div>
          </motion.div>

          {data.focusAreas && data.focusAreas.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.5 }}
              className="space-y-4"
            >
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-white/40 mb-6">Where your energy went</p>
              {data.focusAreas.slice(0, 3).map((area, i) => (
                <motion.div
                  key={area.categoryId}
                  initial={{ x: -40, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 2 + i * 0.2, type: "spring" }}
                  className="bg-white/5 backdrop-blur-xl p-5 rounded-[32px] border border-white/5 relative overflow-hidden"
                >
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, (area.tasksCompleted / Math.max(1, data.tasksCompleted)) * 100)}%` }}
                    transition={{ delay: 2.5 + i * 0.2, duration: 1, ease: "easeOut" }}
                    className="absolute inset-y-0 left-0 opacity-20"
                    style={{ backgroundColor: area.accent }} 
                  />
                  <div className="relative z-10 flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-black italic uppercase tracking-wider" style={{ color: area.accent }}>{area.categoryName}</h3>
                      <p className="text-xs font-bold text-white/50">{area.tasksCompleted} tasks • {area.focusMinutes}m focus</p>
                    </div>
                    {i === 0 && <Crown className="w-6 h-6 text-amber-400" />}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      ),
    },
    // 3: The Collector (Flies & Skins)
    {
      id: 'collection',
      bg: 'bg-amber-950',
      blobs: ['#f59e0b', '#d946ef'],
      content: (
        <div className="flex flex-col items-center justify-center h-full text-center px-6 relative z-10">
          <StaggeredText 
            text="HARD WORK PAYS OFF." 
            delay={0.3}
            className="text-4xl md:text-5xl font-black italic tracking-tighter uppercase text-amber-400 mb-12"
          />

          <div className="grid grid-cols-1 gap-6 w-full max-w-sm">
            {/* Flies Card */}
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 1.2, type: "spring" }}
              className="bg-gradient-to-br from-amber-500/20 to-orange-600/20 backdrop-blur-2xl p-8 rounded-[40px] border border-amber-500/30 text-left relative overflow-hidden shadow-2xl"
            >
              <div className="absolute -right-8 -top-8 w-48 h-48 z-20 pointer-events-none drop-shadow-[0_0_25px_rgba(251,191,36,0.6)]">
                <Fly size={200} className="w-full h-full opacity-100 rotate-12 transition-transform duration-700" />
              </div>
              <div className="relative z-10">
                <div className="text-[10px] font-black uppercase text-amber-200 tracking-[0.3em] mb-2">The Bounty</div>
                <div className="text-7xl font-black tracking-tighter italic text-white"><AnimatedNumber value={data.fliesEarned} /></div>
                <p className="text-sm text-amber-200/60 mt-2 font-bold uppercase tracking-widest">Flies caught</p>
              </div>
            </motion.div>

            {/* Skins Card */}
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 1.6, type: "spring" }}
              className="bg-gradient-to-br from-fuchsia-500/20 to-purple-600/20 backdrop-blur-2xl p-8 rounded-[40px] border border-fuchsia-500/30 text-left relative overflow-hidden shadow-2xl"
            >
              <div className="absolute -right-4 -top-4 w-40 h-40 z-0 pointer-events-none drop-shadow-[0_0_20px_rgba(217,70,239,0.5)]">
                {data.skinsRarestDetail ? (
                   <div className="scale-125 -rotate-12 origin-center">
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
                  <Shirt className="w-full h-full -rotate-12 opacity-20 text-fuchsia-300" />
                )}
              </div>
              <div className="relative z-10">
                <div className="text-[10px] font-black uppercase text-fuchsia-200 tracking-[0.3em] mb-2">New Style</div>
                <div className="text-7xl font-black tracking-tighter italic text-white">+<AnimatedNumber value={data.skinsNew || 0} /></div>
                {data.skinsRarest && (
                  <div className="mt-4 inline-flex items-center gap-2 bg-fuchsia-500/30 px-4 py-2 rounded-full border border-fuchsia-400/40">
                    <Star className="w-4 h-4 text-amber-300 fill-amber-300" />
                    <span className="text-xs font-black uppercase text-white tracking-widest truncate max-w-[120px]">{data.skinsRarest}</span>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      ),
    },
    // 4: AI Fortune (The Oracle)
    ...(aiInsights?.summary && aiInsights?.insights ? [{
      id: 'ai',
      bg: 'bg-zinc-950',
      blobs: ['#9333ea', '#4f46e5'],
      content: (
        <div className="flex flex-col items-center justify-center h-full text-center px-8 relative z-10">
          <motion.div 
            initial={{ scale: 0, opacity: 0, rotate: -180 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ duration: 1, type: "spring" }}
            className="mb-12"
          >
            <div className="w-24 h-24 rounded-[32px] bg-fuchsia-500/20 border border-fuchsia-500/40 flex items-center justify-center shadow-[0_0_50px_rgba(217,70,239,0.3)] backdrop-blur-xl rotate-12">
              <Sparkles className="w-12 h-12 text-fuchsia-300 -rotate-12" />
            </div>
          </motion.div>

          <StaggeredText 
            text={aiInsights.summary}
            delay={0.5}
            stagger={0.05}
            className="text-3xl md:text-4xl font-black leading-tight italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-white to-white/60 mb-12"
          />
          
          <div className="flex flex-col gap-3 w-full max-w-sm">
            {aiInsights.insights?.map((ins, i) => (
              <motion.div 
                key={i}
                initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 2 + i * 0.2, type: "spring" }}
                className="bg-white/5 backdrop-blur-xl p-4 rounded-3xl text-left border border-white/10 flex items-center gap-4"
              >
                <div className="text-3xl">{ins.emoji}</div>
                <div className="text-sm font-bold uppercase tracking-widest text-white/80">{ins.title}</div>
              </motion.div>
            ))}
          </div>
        </div>
      ),
    }] : []),
    // 5: Outro
    {
      id: 'outro',
      bg: 'bg-black',
      blobs: ['#1e1b4b', '#000000'],
      content: (
        <div className="flex flex-col items-center justify-center h-full text-center px-6 relative z-10">
          <motion.div
             initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, ease: "easeOut" }}
             className="mb-8"
          >
             <h2 className="text-6xl md:text-7xl font-black italic tracking-tighter uppercase leading-[0.85] text-white">
              ONE WEEK.<br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-emerald-400 to-blue-500">ONE LEGEND.</span>
            </h2>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.8 }}
            className="grid grid-cols-2 gap-4 w-full max-w-sm mb-16"
          >
            <div className="p-8 rounded-[40px] bg-white/5 border border-white/10 backdrop-blur-xl flex flex-col items-center justify-center">
              <div className="text-6xl font-black italic tracking-tighter text-primary"><AnimatedNumber value={data.completionRate} suffix="%" /></div>
              <div className="text-white/40 text-[10px] font-black uppercase tracking-[0.3em] mt-2">Success</div>
            </div>
            <div className="p-8 rounded-[40px] bg-white/5 border border-white/10 backdrop-blur-xl flex flex-col items-center justify-center">
              <div className="text-6xl font-black italic tracking-tighter text-blue-400"><AnimatedNumber value={data.totalFocusMinutes} /></div>
              <div className="text-white/40 text-[10px] font-black uppercase tracking-[0.3em] mt-2">Minutes</div>
            </div>
          </motion.div>

          <motion.button
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.5 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={(e) => {
              e.stopPropagation();
              handleFinish();
            }}
            className="w-full max-w-sm py-6 rounded-[40px] bg-primary text-primary-foreground font-black text-2xl shadow-[0_20px_50px_rgba(34,197,94,0.3)] uppercase tracking-tighter italic"
          >
            DOMINATE NEXT WEEK
          </motion.button>
          
          <motion.button 
             initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2 }}
             className="mt-8 flex items-center gap-2 text-white/30 font-black text-xs uppercase tracking-[0.3em] hover:text-white transition-colors"
          >
            <Share2 className="w-4 h-4" /> Share Story
          </motion.button>
        </div>
      ),
    },
  ], [data, rating, aiInsights, indices, handleFinish]);

  return (
    <div className="fixed inset-0 z-[1000] bg-black text-white select-none overflow-hidden flex flex-col font-sans">
      <NoiseOverlay />
      
      {/* Dynamic Background Wrapper */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`bg-${slides[currentSlide].id}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2 }}
          className={cn("absolute inset-0 z-0", slides[currentSlide].bg)}
        >
          <FloatingBlobs color1={slides[currentSlide].blobs[0]} color2={slides[currentSlide].blobs[1]} />
        </motion.div>
      </AnimatePresence>

      {/* Progress Bars Container */}
      <div className="absolute top-4 left-4 right-4 z-[1050] flex gap-2 px-1">
        {slides.map((_, i) => (
          <div key={i} className="h-1.5 flex-1 bg-white/20 rounded-full overflow-hidden backdrop-blur-md">
            <div 
              className="h-full bg-white transition-all ease-linear"
              style={{ 
                width: i < currentSlide ? '100%' : i === currentSlide ? `${progress}%` : '0%',
                transitionDuration: i === currentSlide ? '50ms' : '0ms'
              }}
            />
          </div>
        ))}
      </div>

      {/* Persistent Header */}
      <div className="absolute top-10 left-6 right-6 z-[1050] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white text-black flex items-center justify-center font-black text-sm shadow-xl">FT</div>
          <div className="flex flex-col">
            <span className="font-black text-[9px] tracking-[0.4em] uppercase text-white/60">Weekly</span>
            <span className="font-black text-sm tracking-tighter uppercase leading-none">Wrapped</span>
          </div>
        </div>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }} 
          className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-xl flex items-center justify-center hover:bg-white/20 transition-colors pointer-events-auto border border-white/10"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Slide Content Layer */}
      <div className="relative flex-1 z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={slides[currentSlide].id}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.05, y: -20 }}
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
        <div className="absolute bottom-8 left-0 right-0 text-center z-[1050] pointer-events-none">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.6, 0], y: [0, -5, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
            className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 drop-shadow-md"
          >
            Tap to advance
          </motion.div>
        </div>
      )}
    </div>
  );
}