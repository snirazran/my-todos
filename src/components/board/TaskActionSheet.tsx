'use client';

import React from 'react';
import {
  CheckCircle2,
  Pencil,
  Tag,
  CalendarClock,
  Clock,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import Fly from '@/components/ui/fly';
import type { Task } from './helpers';

type Action = {
  key: string;
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  destructive?: boolean;
  active?: boolean;
};

export default function TaskActionSheet({
  open,
  onOpenChange,
  task,
  isCompleted,
  isWeekly,
  onComplete,
  onEdit,
  onAddTags,
  onSchedule,
  onToggleRepeat,
  onDoLater,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | null;
  isCompleted: boolean;
  isWeekly: boolean;
  onComplete?: () => void;
  onEdit?: () => void;
  onAddTags?: () => void;
  onSchedule?: () => void;
  onToggleRepeat?: () => void;
  onDoLater?: () => void;
  onDelete?: () => void;
}) {
  if (!task) return null;

  const actions: Action[] = [];
  if (onComplete)
    actions.push({
      key: 'complete',
      label: isCompleted ? 'Mark as incomplete' : 'Mark as complete',
      icon: CheckCircle2,
      onClick: onComplete,
    });
  if (onEdit)
    actions.push({
      key: 'edit',
      label: 'Edit task',
      icon: Pencil,
      onClick: onEdit,
    });
  if (onAddTags)
    actions.push({
      key: 'tags',
      label: 'Add tags',
      icon: Tag,
      onClick: onAddTags,
    });
  if (onSchedule)
    actions.push({
      key: 'schedule',
      label: 'Time',
      icon: Clock,
      onClick: onSchedule,
    });
  if (onToggleRepeat)
    actions.push({
      key: 'repeat',
      label: 'Repeat weekly',
      icon: RotateCcw,
      onClick: onToggleRepeat,
      active: isWeekly,
    });
  if (onDoLater && !isCompleted)
    actions.push({
      key: 'doLater',
      label: 'Do later',
      icon: CalendarClock,
      onClick: onDoLater,
    });

  const close = () => onOpenChange(false);
  const run = (fn: () => void) => () => {
    fn();
    close();
  };

  return (
    <BaseSheet
      open={open}
      onOpenChange={onOpenChange}
      className="sm:max-w-md"
    >
      {() => (
        <div className="flex flex-col">
          {/* Header */}
          <div className="px-5 pt-4 pb-3 flex items-center justify-between">
            <button
              onClick={close}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/60 text-muted-foreground hover:bg-muted"
              aria-label="Close"
            >
              <X size={18} />
            </button>

            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/50 ring-1 ring-border/60">
              {isCompleted ? (
                <CheckCircle2 className="h-7 w-7 text-green-500" />
              ) : (
                <Fly size={36} y={-3} />
              )}
            </div>

            {onDelete ? (
              <button
                onClick={run(onDelete)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100/70 dark:bg-red-500/15 text-red-600 hover:bg-red-200/70 dark:hover:bg-red-500/25"
                aria-label="Delete"
              >
                <Trash2 size={18} />
              </button>
            ) : (
              <span className="h-9 w-9" />
            )}
          </div>

          <h2 className="px-5 pb-4 text-center text-lg font-black tracking-tight text-foreground">
            {task.text}
          </h2>

          {/* Actions */}
          <div className="px-3 pb-[calc(env(safe-area-inset-bottom)+16px)] space-y-2">
            {actions.map((a) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.key}
                  onClick={run(a.onClick)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-card border border-border/50 hover:bg-accent/60 transition-colors ${
                    a.active ? 'ring-1 ring-primary/40 bg-primary/5' : ''
                  }`}
                >
                  <Icon
                    className={`h-5 w-5 ${
                      a.active ? 'text-primary' : 'text-muted-foreground'
                    }`}
                  />
                  <span
                    className={`text-sm font-bold ${
                      a.active ? 'text-primary' : 'text-foreground'
                    }`}
                  >
                    {a.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </BaseSheet>
  );
}
