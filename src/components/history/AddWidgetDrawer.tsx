import { BaseSheet } from '@/components/ui/BaseSheet';
import { useSheetOverscrollDrag } from '@/components/ui/useSheetOverscrollDrag';
import { Plus, X, LayoutGrid } from 'lucide-react';

// Widget icons/labels mapping (reusing from parent if possible, but defining here for now)
const WIDGET_LABELS: Record<string, string> = {
    'completion-rate': 'Completion Rate',
    'total-done': 'Total Tasks Done',
    'best-day': 'Best Day',
    'average': 'Daily Average',
    'active-days': 'Active Days',
    'streak': 'Current Streak',
    'tag-distribution': 'Top Tags View',
    'productivity-trend': 'Activity Trend',
};

// Simple descriptions for better UX
const WIDGET_DESCRIPTIONS: Record<string, string> = {
    'completion-rate': 'Track how often you complete planned tasks.',
    'total-done': 'Total count of finished tasks.',
    'best-day': 'Which day of the week you are most productive.',
    'average': 'Average tasks completed per day.',
    'active-days': 'Number of days you were active.',
    'streak': 'Current daily streak.',
    'tag-distribution': 'Breakdown of tasks by tag.',
    'productivity-trend': 'Your productivity over the last 7 days.',
};

interface AddWidgetDrawerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    availableWidgets: string[];
    onAdd: (id: string) => void;
}

export function AddWidgetDrawer({ open, onOpenChange, availableWidgets, onAdd }: AddWidgetDrawerProps) {
    const overscrollDrag = useSheetOverscrollDrag();

    return (
        <BaseSheet
            open={open}
            onOpenChange={onOpenChange}
            className="sm:max-w-xl bg-background"
            zIndex={1000}
        >
            {({ isDesktop, dragControls }) => {
                overscrollDrag.setContext(dragControls, !isDesktop);

                return (
                    <div className="flex flex-col h-full relative">
                        {/* Header */}
                        <div
                            onPointerDown={(e) => !isDesktop && dragControls.start(e)}
                            className="px-6 py-5 border-b border-border/50 shrink-0 flex items-center justify-between gap-3"
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-primary/10 shrink-0">
                                    <Plus className="w-5 h-5 text-primary" strokeWidth={3} />
                                </div>
                                <h2 className="text-xl font-black tracking-tight text-foreground uppercase leading-none">
                                    Add Widget
                                </h2>
                            </div>
                            <button
                                onClick={() => onOpenChange(false)}
                                onPointerDown={(e) => e.stopPropagation()}
                                className="flex items-center justify-center w-9 h-9 rounded-full bg-muted/60 hover:bg-muted text-muted-foreground transition-all active:scale-95 shrink-0"
                            >
                                <X className="w-4 h-4" strokeWidth={2.5} />
                            </button>
                        </div>

                        {/* Content Scrollable */}
                        <div
                            ref={overscrollDrag.bind}
                            className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide overscroll-none"
                        >
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-10">
                                {availableWidgets.length === 0 ? (
                                    <div className="col-span-full py-12 text-center text-muted-foreground flex flex-col items-center gap-3">
                                        <div className="p-4 rounded-full bg-muted/50">
                                            <LayoutGrid className="w-8 h-8 opacity-20" />
                                        </div>
                                        <p className="font-bold">You've added all available widgets!</p>
                                    </div>
                                ) : (
                                    availableWidgets.map((id) => (
                                        <button
                                            key={id}
                                            onClick={() => onAdd(id)}
                                            className="flex flex-col items-start gap-1 p-4 rounded-2xl border border-border/50 bg-card hover:bg-muted/50 hover:border-primary/50 transition-all text-left shadow-sm hover:shadow-md group active:scale-[0.98]"
                                        >
                                            <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                                                {WIDGET_LABELS[id] || id}
                                            </span>
                                            <span className="text-xs text-muted-foreground line-clamp-2">
                                                {WIDGET_DESCRIPTIONS[id] || 'Add this widget to your dashboard.'}
                                            </span>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                );
            }}
        </BaseSheet>
    );
}

