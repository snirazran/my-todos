'use client';

import { useRiveStatsStore } from '@/lib/riveStatsStore';
import { useUIStore } from '@/lib/uiStore';
import { motion } from 'framer-motion';
import { Activity, Pause, Monitor, Gauge } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { cn } from '@/lib/utils';

export function RiveCounter() {
  const isDebugMode = useUIStore((s) => s.isDebugMode);
  const instances = useRiveStatsStore((s) => s.instances);
  const [mounted, setMounted] = useState(false);
  
  // FPS Logic
  const [fps, setFps] = useState(0);
  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !isDebugMode) return;

    let rafId: number;
    const updateFps = () => {
      frameCount.current++;
      const now = performance.now();
      const elapsed = now - lastTime.current;

      if (elapsed >= 1000) {
        setFps(Math.round((frameCount.current * 1000) / elapsed));
        frameCount.current = 0;
        lastTime.current = now;
      }
      rafId = requestAnimationFrame(updateFps);
    };

    rafId = requestAnimationFrame(updateFps);
    return () => cancelAnimationFrame(rafId);
  }, [mounted, isDebugMode]);
  
  const stats = {
    total: Object.keys(instances).length,
    playing: Object.values(instances).filter(i => i.isPlaying).length,
    paused: Object.values(instances).filter(i => i.isPaused).length,
  };

  if (!mounted || !isDebugMode) return null;

  return (
    <div className="fixed bottom-24 right-4 z-[9999] pointer-events-none">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-background/80 backdrop-blur-md border border-border p-3 rounded-2xl shadow-xl flex flex-col gap-2 min-w-[140px]"
      >
        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-muted-foreground border-b border-border/50 pb-1 mb-1">
          <span>Dev Stats</span>
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        </div>
        
        {/* FPS Counter */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-600">
            <Gauge className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground font-bold uppercase">Performance</span>
            <span className={cn(
              "text-sm font-black transition-colors",
              fps >= 55 ? "text-emerald-500" : fps >= 30 ? "text-amber-500" : "text-rose-500"
            )}>
              {fps} FPS
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-sky-500/10 text-sky-600">
            <Monitor className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground font-bold uppercase">Rendered</span>
            <span className="text-sm font-black text-foreground">{stats.total}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600">
            <Activity className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground font-bold uppercase">Playing</span>
            <span className="text-sm font-black text-foreground">{stats.playing}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600">
            <Pause className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground font-bold uppercase">Paused</span>
            <span className="text-sm font-black text-foreground">{stats.paused}</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
