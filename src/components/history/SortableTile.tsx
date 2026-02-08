'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

interface SortableTileProps {
    id: string;
    children: React.ReactNode;
    editMode: boolean;
    onRemove?: (id: string) => void;
    // Helper to determine span
    className?: string; // For col-span classes
}

export function SortableTile({ id, children, editMode, onRemove, className }: SortableTileProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id });

    // Apply rigorous transform style
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 1,
        opacity: isDragging ? 0.25 : 1, // Show ghost placeholder when dragging
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "relative h-full", // Removed touch-none to allow scrolling
                className,
                // Shake animation when in edit mode, but NOT when dragging
                editMode && !isDragging && "",
                editMode && "cursor-grab active:cursor-grabbing"
            )}
            {...(editMode ? attributes : {})}
            {...(editMode ? listeners : {})}
        >
            {/* Delete Badge - Top Left (Shopify style) */}
            {editMode && onRemove && (
                <button
                    onPointerDown={(e) => e.stopPropagation()} 
                    onClick={(e) => {
                        e.stopPropagation();
                        onRemove(id);
                    }}
                    className="absolute -top-2 -right-2 z-50 flex h-7 w-7 items-center justify-center rounded-full bg-background border border-border shadow-sm text-muted-foreground hover:text-destructive hover:border-destructive/30 hover:scale-110 hover:bg-destructive/10 transition-all active:scale-95"
                >
                    <X className="w-3.5 h-3.5" strokeWidth={3} />
                </button>
            )}

            {/* Content Container */}
            <div className={cn(
                "h-full w-full overflow-hidden rounded-[24px] border border-border/50 bg-card transition-transform",
                editMode && "scale-95 ring-2 ring-primary/20" // Shrink slightly in edit mode
            )}>
                {/* Pointer events disabler in edit mode to prevent interacting with widget contents */}
                {editMode && <div className="absolute inset-0 z-10 bg-transparent" />}
                {children}
            </div>
        </div>
    );
}

// Add shake animation through Tailwind config or inline style later. 
// For now, I'll rely on the scale-95 to indicate edit mode clearly.
