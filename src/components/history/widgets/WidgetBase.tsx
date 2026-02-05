'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface WidgetProps {
    id: string;
    // editMode and drag props removed - handled by parent Tile
    children?: React.ReactNode;
    className?: string;
    // Data props common to most widgets
    historyData?: any[];
    stats?: {
        total: number;
        completed: number;
        completionRate: number;
    };
    dateRange?: any;
}

export function WidgetBase({ 
    children, 
    className
}: WidgetProps) {
    return (
        <div className={cn("h-full", className)}>
             <Card className="h-full w-full overflow-hidden border-none bg-transparent shadow-none relative">
                {children}
            </Card>
        </div>
    );
}
