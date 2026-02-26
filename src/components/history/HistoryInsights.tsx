'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { BarChart3, Lock, Sparkles, TrendingUp, Clock, Zap, PieChart, LayoutGrid } from 'lucide-react';
import InsightsGrid from './InsightsGrid';
import HistoryTimeSelector, { DateRangeOption } from './HistoryTimeSelector';

type HistoryInsightsProps = {
  // Stats Data
  historyData: any[];
  stats: {
    total: number;
    completed: number;
    completionRate: number;
  };
  // Filters
  dateRange: DateRangeOption;
  onDateRangeChange: (val: DateRangeOption) => void;
  customDateRange: { from: string; to: string };
  onCustomDateChange: (range: { from: string; to: string }) => void;
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  availableTags: any[];
  isPremium: boolean;
};

export default function HistoryInsights({
  historyData,
  stats,
  dateRange,
  onDateRangeChange,
  customDateRange,
  onCustomDateChange,
  selectedTags,
  onTagsChange,
  availableTags,
  isPremium,
}: HistoryInsightsProps) {
  const [showPremiumPopup, setShowPremiumPopup] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="w-full bg-card/40 backdrop-blur-xl border border-border/50 rounded-[32px] p-6 shadow-sm relative overflow-hidden group">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 px-1 relative z-50">
        <div>
          <h2 className="text-2xl font-black tracking-tight flex items-center gap-3 text-foreground">
            <BarChart3 className="w-6 h-6 text-primary" />
            Insights
          </h2>
          <p className="text-[11px] font-black text-muted-foreground/60 uppercase tracking-[0.2em] mt-1">
            Data-Driven Productivity
          </p>
        </div>
        {!isPremium && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
            <Lock className="w-3 h-3 text-primary" />
            <span className="text-[10px] font-black uppercase tracking-widest text-primary">PRO</span>
          </div>
        )}
      </div>

      {!isPremium ? (
        /* PREMIUM TEASER VIEW */
        <div className="space-y-8">
          {/* Dedicated CTA Card - Doesn't hide widgets */}
          <div 
            onClick={() => setShowPremiumPopup(true)}
            className="cursor-pointer group/cta bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 p-6 rounded-[32px] text-center relative overflow-hidden transition-all hover:bg-primary/[0.08] active:scale-[0.98]"
          >
            <div className="relative z-10 space-y-2">
              <h3 className="text-xl font-black text-foreground tracking-tight">Visualize Your Success</h3>
              <p className="text-sm font-medium text-muted-foreground max-w-sm mx-auto leading-relaxed">
                Get deep analytics, productivity trends, and custom dashboard layouts to master your time.
              </p>
              <div className="inline-flex items-center gap-2 pt-2 text-primary font-black text-xs uppercase tracking-[0.2em] group-hover/cta:scale-105 transition-transform">
                <Sparkles className="w-4 h-4 fill-primary/10" />
                Unlock Pro Insights
              </div>
            </div>
            <div className="absolute -right-4 -bottom-4 opacity-5 group-hover/cta:opacity-10 transition-opacity">
               <BarChart3 className="w-24 h-24" />
            </div>
          </div>

          {/* Teaser Content - Visible but non-interactive */}
          <div className="space-y-8 pointer-events-none select-none opacity-50 grayscale-[0.1]">
            {/* Mock Time Selector */}
            <div className="flex gap-2 overflow-hidden">
               {['Last 7 Days', 'Last 30 Days', 'Custom'].map((t) => (
                 <div key={t} className="px-4 py-2 rounded-xl bg-muted/50 border border-border/50 text-[11px] font-bold text-muted-foreground whitespace-nowrap">
                   {t}
                 </div>
               ))}
            </div>

            {/* Mock Grid */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <TeaserWidget 
                icon={TrendingUp} 
                title="Completion" 
                value="+12%" 
                sub="vs last week" 
                bgColor="bg-emerald-500/10"
                iconColor="text-emerald-500"
              />
              <TeaserWidget 
                icon={Clock} 
                title="Peak Hour" 
                value="10:00 AM" 
                sub="Most active" 
                bgColor="bg-blue-500/10"
                iconColor="text-blue-500"
              />
              <TeaserWidget 
                icon={Zap} 
                title="Velocity" 
                value="4.2" 
                sub="Tasks / day" 
                bgColor="bg-amber-500/10"
                iconColor="text-amber-500"
              />
              <TeaserWidget 
                icon={PieChart} 
                title="Focus" 
                value="Work" 
                sub="Top category" 
                bgColor="bg-violet-500/10"
                iconColor="text-violet-500"
              />
            </div>
          </div>
        </div>
      ) : (
        /* ACTUAL INSIGHTS VIEW */
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <HistoryTimeSelector
            dateRange={dateRange}
            onDateRangeChange={onDateRangeChange}
            customDateRange={customDateRange}
            onCustomDateChange={onCustomDateChange}
            selectedTags={selectedTags}
            onTagsChange={onTagsChange}
            availableTags={availableTags}
          />
          <InsightsGrid
            historyData={historyData}
            stats={stats}
            dateRange={dateRange}
          />
        </div>
      )}

      {/* Premium Popup Portal */}
      {showPremiumPopup && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div onClick={() => setShowPremiumPopup(false)} className="absolute inset-0" />
          <div className="relative bg-card border border-border w-full max-w-md p-0 rounded-[40px] shadow-2xl scale-100 animate-in zoom-in-95 duration-200 overflow-hidden ring-1 ring-white/10">
            <div className="h-48 bg-gradient-to-br from-primary via-emerald-500 to-primary relative flex items-center justify-center">
              <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
              <div className="relative z-10 flex flex-col items-center">
                <div className="bg-background/90 backdrop-blur-md p-5 rounded-3xl shadow-2xl mb-4 ring-1 ring-white/20">
                  <Sparkles className="w-10 h-10 text-primary fill-primary/20" />
                </div>
                <div className="px-4 py-1.5 rounded-full bg-black/20 backdrop-blur-md border border-white/10">
                  <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white">PRO ACCESS</span>
                </div>
              </div>
            </div>

            <div className="p-10 text-center">
              <h3 className="text-2xl font-black tracking-tight mb-4 text-foreground">
                Level Up Your History
              </h3>
              <p className="text-muted-foreground text-sm font-medium leading-relaxed mb-8">
                Join our pro community to access advanced analytics, custom themes, and exclusive productivity tools.
              </p>

              <div className="space-y-3 mb-8">
                {[
                  { icon: TrendingUp, title: 'Growth Trends', sub: 'Weekly productivity scores' },
                  { icon: LayoutGrid, title: 'Custom Dashboards', sub: 'Organize your metrics' },
                  { icon: Clock, title: 'Time Analysis', sub: 'Find your golden hours' }
                ].map((f, i) => (
                  <div key={i} className="flex items-center gap-4 p-4 rounded-2xl bg-muted/40 border border-border/50 text-left">
                    <div className="bg-primary/10 p-2 rounded-xl text-primary">
                      <f.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-foreground leading-none mb-1">{f.title}</p>
                      <p className="text-xs font-medium text-muted-foreground">{f.sub}</p>
                    </div>
                  </div>
                ))}
              </div>

              <button className="w-full py-4 rounded-2xl font-black bg-primary text-primary-foreground shadow-xl shadow-primary/20 hover:scale-[1.02] transition-all flex items-center justify-center gap-3">
                Upgrade Now
              </button>
              <button 
                onClick={() => setShowPremiumPopup(false)}
                className="w-full mt-4 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
              >
                No thanks, I'll stick to basics
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function TeaserWidget({ icon: Icon, title, value, sub, bgColor, iconColor }: any) {
  return (
    <div className="p-4 sm:p-5 rounded-[28px] bg-card/60 border border-border/40 flex flex-col gap-3 sm:gap-4 min-h-[130px] sm:min-h-[150px] justify-between shadow-sm">
      <div className="flex items-center gap-2.5">
        <div className={`p-2 rounded-xl ${bgColor} ${iconColor}`}>
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground/70 truncate">{title}</span>
      </div>
      <div>
        <div className="text-xl sm:text-2xl font-black text-foreground leading-none mb-1.5 tracking-tight">{value}</div>
        <div className="text-[10px] sm:text-[11px] font-bold text-muted-foreground/40">{sub}</div>
      </div>
    </div>
  );
}
