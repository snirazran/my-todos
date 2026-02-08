import React from 'react';
import { createPortal } from 'react-dom'; // Added import
import { BarChart3, Lock, Sparkles } from 'lucide-react'; // Added icons
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
    isPremium
}: HistoryInsightsProps) {
    const [showPremiumPopup, setShowPremiumPopup] = React.useState(false);
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
    }, []);

    return (
        <div className="w-full bg-card/40 backdrop-blur-xl border border-border/50 rounded-[24px] p-4 shadow-sm relative overflow-hidden group">
            
            {/* Premium Lock Overlay - Teaser Mode */}
            {!isPremium && (
                <div 
                    onClick={() => setShowPremiumPopup(true)}
                    className="absolute inset-0 z-40 flex flex-col items-center justify-center cursor-pointer group/overlay"
                >
                    {/* Gradient Overlay - Stronger fade at bottom to hide specific data */}
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/60 to-background/95 transition-opacity duration-500" />
                    
                    {/* CTA Button - Floating in center */}
                    <div className="z-50 transition-all duration-300 group-hover/overlay:-translate-y-1">
                         <div className="bg-card/95 border border-primary/30 p-1.5 pr-5 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] flex items-center gap-4 hover:shadow-primary/25 transition-shadow">
                            <div className="bg-primary text-primary-foreground p-2.5 rounded-full shadow-inner">
                                <Lock className="w-4 h-4" strokeWidth={2.5} />
                            </div>
                            <div className="flex flex-col items-start gap-0.5">
                                <span className="text-sm font-bold text-foreground leading-none">Unlock Insights</span>
                                <span className="text-[10px] font-bold text-primary uppercase tracking-widest leading-none">Premium</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Portal Popup */}
            {showPremiumPopup && mounted && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
                    <div 
                        onClick={() => setShowPremiumPopup(false)}
                        className="absolute inset-0"
                    />
                    <div 
                        className="relative bg-card border border-border w-full max-w-md p-0 rounded-[32px] shadow-2xl scale-100 animate-in zoom-in-95 duration-200 overflow-hidden ring-1 ring-white/10"
                    >
                        {/* Decorative Header Background */}
                        <div className="h-40 bg-gradient-to-br from-primary/30 via-primary/10 to-background relative overflow-hidden flex items-center justify-center">
                             <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent opacity-50" />
                             <div className="absolute -right-10 -top-10 w-40 h-40 bg-primary/30 rounded-full blur-[60px] opacity-40 mix-blend-screen" />
                             <div className="absolute -left-10 bottom-0 w-32 h-32 bg-secondary/30 rounded-full blur-[60px] opacity-40 mix-blend-screen" />
                             
                             <div className="relative z-10 flex flex-col items-center">
                                <div className="bg-background/80 backdrop-blur-md p-4 rounded-[24px] ring-1 ring-white/20 shadow-xl mb-3 shadow-primary/10 group-hover:scale-110 transition-transform duration-500">
                                    <Sparkles className="w-8 h-8 text-primary fill-primary/20" />
                                </div>
                                <div className="px-3 py-1 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-sm">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-primary">Pro Feature</span>
                                </div>
                             </div>
                        </div>

                        <div className="p-8 pt-4">
                            <div className="text-center mb-8">
                                <h3 className="text-2xl font-black tracking-tight mb-3 text-foreground">Unlock Full Potential</h3>
                                <p className="text-muted-foreground text-sm font-medium leading-relaxed px-2">
                                    Supercharge your productivity with advanced tools and unlimited data access.
                                </p>
                            </div>

                            {/* Feature List */}
                            <div className="space-y-4 mb-8">
                                {[
                                    { text: "Unlimited History Access", sub: "View patterns from day one" },
                                    { text: "Advanced Analytics", sub: "Deep dive into your habits" },
                                    { text: "Custom Widget Layouts", sub: "Personalize your dashboard" }
                                ].map((feature, i) => (
                                    <div key={i} className="flex items-start gap-3.5 p-3 rounded-2xl bg-muted/30 hover:bg-muted/50 transition-colors border border-transparent hover:border-border/50">
                                        <div className="mt-0.5 bg-primary/10 p-1.5 rounded-full ring-1 ring-primary/20">
                                            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-sm font-bold text-foreground leading-none mb-1">{feature.text}</p>
                                            <p className="text-[11px] font-medium text-muted-foreground">{feature.sub}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            
                            <div className="space-y-3">
                                <button 
                                    onClick={() => {
                                        setShowPremiumPopup(false);
                                        // router.push('/premium'); 
                                    }}
                                    className="w-full py-4 rounded-[20px] font-bold bg-primary text-primary-foreground shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 group"
                                >
                                    <Sparkles className="w-4 h-4 fill-primary-foreground/20 group-hover:animate-pulse" />
                                    <span>Upgrade Now</span>
                                </button>
                                <button 
                                    onClick={() => setShowPremiumPopup(false)}
                                    className="w-full py-3 rounded-[20px] font-bold text-xs text-muted-foreground hover:text-foreground transition-colors hover:bg-muted/30"
                                >
                                    Maybe Later
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Header */}
            <div className="flex items-center justify-between mb-4 px-1">
                <div>
                    <h2 className="text-lg font-black tracking-tight flex items-center gap-2 text-foreground">
                        <BarChart3 className="w-5 h-5 text-primary" />
                        Insights
                    </h2>
                    <p className="text-xs font-bold text-muted-foreground/60 uppercase tracking-widest mt-0.5">
                        Productivity Overview
                    </p>
                </div>
            </div>

            {/* Content Container - blurred if not premium */}
            <div className={`space-y-6 transition-all duration-500 ${!isPremium ? 'opacity-40 pointer-events-none select-none' : ''}`}>
                {/* Time Selector Section */}
                <div className="space-y-3">
                    <HistoryTimeSelector
                        dateRange={dateRange}
                        onDateRangeChange={onDateRangeChange}
                        customDateRange={customDateRange}
                        onCustomDateChange={onCustomDateChange}
                        selectedTags={selectedTags}
                        onTagsChange={onTagsChange}
                        availableTags={availableTags}
                    />
                </div>

                {/* Metrics Section (Now Customizable Grid) */}
                <div className="space-y-4">
                    <InsightsGrid
                        historyData={historyData}
                        stats={stats}
                        dateRange={dateRange}
                    />
                </div>
            </div>
        </div>
    );
}
