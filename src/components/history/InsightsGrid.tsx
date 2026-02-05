'use client';

import React, { useState, useEffect } from 'react';
import { LayoutGrid, Plus, Check, Pencil } from 'lucide-react';
import { WidgetBase, WidgetProps } from './widgets/WidgetBase';
import { CompletionRateWidget } from './widgets/CompletionRateWidget';
import { TotalDoneWidget } from './widgets/TotalDoneWidget';
import { BestDayWidget } from './widgets/BestDayWidget';
import { ActiveDaysWidget } from './widgets/ActiveDaysWidget';
import { AverageWidget } from './widgets/AverageWidget';
import { StreakWidget } from './widgets/StreakWidget';
import { TagDistributionWidget } from './widgets/TagDistributionWidget';
import { ProductivityTrendWidget } from './widgets/ProductivityTrendWidget';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { SortableTile } from './SortableTile';
import { AddWidgetDrawer } from './AddWidgetDrawer';
import { cn } from '@/lib/utils';

// dnd-kit imports
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    defaultDropAnimationSideEffects,
    TouchSensor,
    MouseSensor,
    MeasuringStrategy
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    rectSortingStrategy,
} from '@dnd-kit/sortable';
import { createPortal } from 'react-dom';

// Map of all available widgets
const WIDGET_REGISTRY: Record<string, React.ComponentType<WidgetProps>> = {
    'completion-rate': CompletionRateWidget,
    'total-done': TotalDoneWidget,
    'best-day': BestDayWidget,
    'average': AverageWidget,
    'active-days': ActiveDaysWidget,
    'streak': StreakWidget,
    'tag-distribution': TagDistributionWidget,
    'productivity-trend': ProductivityTrendWidget,
};

const DEFAULT_LAYOUT = [
    'completion-rate',
    'streak',
    'total-done',
    'best-day',
    'productivity-trend',
    'tag-distribution'
];

type InsightsGridProps = {
    historyData: any[];
    stats: any;
    dateRange: any;
};

export default function InsightsGrid({ historyData, stats, dateRange }: InsightsGridProps) {
    const [widgets, setWidgets] = useState<string[]>(DEFAULT_LAYOUT);
    const [editMode, setEditMode] = useState(false);
    const [isAddDrawerOpen, setIsAddDrawerOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [activeItemMetrics, setActiveItemMetrics] = useState<{ width: number; height: number } | null>(null);

    // Precise sensors
    const sensors = useSensors(
        useSensor(MouseSensor, {
            activationConstraint: {
                distance: 5, 
            },
        }),
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: 200, // Longer delay for ease of scrolling
                tolerance: 5,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // Load/Save Logic
    useEffect(() => {
        setMounted(true);
        const saved = localStorage.getItem('frog-insights-layout');
        if (saved) {
            try {
                setWidgets(JSON.parse(saved));
            } catch (e) { console.error(e); }
        }
    }, []);

    useEffect(() => {
        if (mounted) {
            localStorage.setItem('frog-insights-layout', JSON.stringify(widgets));
        }
    }, [widgets, mounted]);

    const handleRemove = (id: string) => {
        setWidgets(prev => prev.filter(w => w !== id));
    };

    const handleAdd = (id: string) => {
        if (!widgets.includes(id)) {
            setWidgets(prev => [...prev, id]);
        }
        setIsAddDrawerOpen(false);
        // Maybe scroll to bottom?
    };

    const handleDragStart = (event: any) => {
        if (!editMode) return;
        const { active } = event;
        setActiveId(active.id);
        
        // Capture exact dimensions for the ghost overlay
        const node = document.getElementById(active.id);
        if (node) {
            const rect = node.getBoundingClientRect();
            setActiveItemMetrics({
                width: rect.width,
                height: rect.height
            });
        }
    };

    const handleDragEnd = (event: any) => {
        setActiveId(null);
        setActiveItemMetrics(null);
        const { active, over } = event;

        if (over && active.id !== over.id) {
            setWidgets((items) => {
                const oldIndex = items.indexOf(active.id);
                const newIndex = items.indexOf(over.id);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    };

    const availableWidgets = Object.keys(WIDGET_REGISTRY).filter(id => !widgets.includes(id));

    if (!mounted) return null;

    return (
        <div className="space-y-4 pb-20"> {/* pb-20 for safe area if we add floating button */}
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                     <h3 className="text-sm font-black uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                        <LayoutGrid className="w-4 h-4" />
                        Dashboard
                    </h3>
                </div>
                <div className="flex items-center gap-2">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setEditMode(!editMode)}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider transition-all border",
                            editMode 
                                ? "bg-primary text-primary-foreground border-primary shadow-sm hover:bg-primary/90" 
                                : "bg-transparent text-muted-foreground border-transparent hover:bg-muted"
                        )}
                    >
                        {editMode ? (
                            <>
                                <Check className="w-3.5 h-3.5" strokeWidth={3} />
                                Done
                            </>
                        ) : (
                            <>
                                <Pencil className="w-3.5 h-3.5" />
                                Customize
                            </>
                        )}
                    </button>
                    {/* Only show Add button in header if NOT in edit mode? Or always? 
                        User wants simple. The bottom drawer add button is effectively only visible in edit mode currently.
                        Let's keep the logic simple.
                    */}
                </div>
                </div>
            </div>

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                measuring={{
                    droppable: {
                        strategy: MeasuringStrategy.Always,
                    },
                }}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
            >
                <SortableContext 
                    items={widgets} 
                    strategy={rectSortingStrategy}
                >
                    <div className="grid grid-cols-2 gap-3 sm:gap-4 relative select-none">
                        {widgets.map((widgetId) => {
                            const Component = WIDGET_REGISTRY[widgetId];
                            if (!Component) return null;

                            // Handle specific spans if needed, for now all 1x1 or handled by component internals?
                            // To be "Strict Grid", let's force col-span based on ID if we want specific layout,
                            // OR just let them flow. 
                            // The problem with "Ghost far right" was likely col-span mismatch in overlay.
                            // Let's assume all are col-span-1 for stability, OR be explicit.
                            // Previously: completion-rate and productivity-trend were potentially span-2?
                            // Let's enforce col-span-1 for ALL for 100% stability initially, or carefully map.
                            return (
                                <SortableTile
                                    key={widgetId}
                                    id={widgetId}
                                    editMode={editMode}
                                    onRemove={handleRemove}
                                    className="col-span-1 h-[160px]" // Fixed height for uniformity
                                >
                                    <Component
                                        id={widgetId}
                                        historyData={historyData}
                                        stats={stats}
                                        dateRange={dateRange}
                                    />
                                </SortableTile>
                            );
                        })}
                    </div>
                </SortableContext>

                {/* Portal Drag Overlay for absolute stability */}
                {createPortal(
                    <DragOverlay
                        zIndex={9999}
                        dropAnimation={{
                            sideEffects: defaultDropAnimationSideEffects({
                                styles: {
                                    active: {
                                        opacity: '0.3', // Fade the placeholder
                                    },
                                },
                            }),
                        }}
                    >
                        {activeId ? (
                            (() => {
                                const Component = WIDGET_REGISTRY[activeId];
                                if (!Component || !activeItemMetrics) return null;
                                
                                return (
                                    <div 
                                        style={{ 
                                            width: activeItemMetrics.width,
                                            height: activeItemMetrics.height,
                                        }}
                                        className="cursor-grabbing select-none"
                                    >
                                        {/* Render simplified Card for drag - reuse the Tile styling without sortable logic */}
                                        <div className="h-full w-full overflow-hidden rounded-[24px] border border-border/50 bg-card shadow-2xl ring-2 ring-primary rotate-3 transition-transform">
                                            <div className="absolute inset-0 z-10 bg-transparent" /> {/* Block clicks */}
                                            <Component
                                                id={activeId}
                                                historyData={historyData}
                                                stats={stats}
                                                dateRange={dateRange}
                                            />
                                        </div>
                                    </div>
                                )
                            })()
                        ) : null}
                    </DragOverlay>,
                    document.body
                )}
            </DndContext>

            {/* Floating Add Button logic specific to edit mode? Or always? */}
            {editMode && (
                <div className="fixed bottom-6 left-0 right-0 z-50 flex justify-center pointer-events-none">
                    <button
                        onClick={() => setIsAddDrawerOpen(true)}
                        className="pointer-events-auto flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-full font-bold shadow-xl hover:scale-105 active:scale-95 transition-all animate-in slide-in-from-bottom"
                    >
                        <Plus className="w-5 h-5 stroke-[3]" />
                        Add Widget
                    </button>
                </div>
            )}

            <AddWidgetDrawer 
                open={isAddDrawerOpen} 
                onOpenChange={setIsAddDrawerOpen} 
                availableWidgets={availableWidgets}
                onAdd={handleAdd}
            />
        </div>
    );
}


