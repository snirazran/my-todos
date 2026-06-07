'use client';

import React, { useEffect, useRef } from 'react';
import {
  Check,
  CheckCircle2,
  Pencil,
  Bell,
  Trash2,
  X,
} from 'lucide-react';
import { Icon as AppIcon, type IconName } from '@/components/ui/Icon';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { useSheetOverscrollDrag } from '@/components/ui/useSheetOverscrollDrag';
import Fly from '@/components/ui/fly';
import type { Task } from './helpers';

type Action = {
  key: string;
  label: string;
  icon?: React.ElementType;
  iconName?: IconName;
  iconClassName?: string;
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
  const overscrollDrag = useSheetOverscrollDrag();
  // Keep the last task around so the slide-down exit animation can still
  // render content after the parent clears `task` on close.
  const lastTaskRef = useRef<Task | null>(task);
  useEffect(() => {
    if (task) lastTaskRef.current = task;
  }, [task]);
  const displayTask = task ?? lastTaskRef.current;

  if (!displayTask) return null;

  const actions: Action[] = [];
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
      iconName: 'filter',
      onClick: onAddTags,
    });
  if (onSchedule)
    actions.push({
      key: 'schedule',
      label: 'Notify',
      icon: Bell,
      iconClassName: 'text-amber-500',
      onClick: onSchedule,
    });
  if (onToggleRepeat)
    actions.push({
      key: 'repeat',
      label: 'Repeat weekly',
      iconName: 'repeat',
      onClick: onToggleRepeat,
      active: isWeekly,
    });
  if (onDoLater && !isCompleted)
    actions.push({
      key: 'doLater',
      label: 'Save for later',
      iconName: 'saved',
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
      className="sm:max-w-md max-h-[92vh]"
      zIndex={1400}
      mobileTransition={{
        type: 'tween',
        ease: [0.32, 0.72, 0, 1],
        duration: 0.32,
      }}
    >
      {({ isDesktop, dragControls }) => {
        overscrollDrag.setContext(dragControls, !isDesktop);
        return (
        <div
          ref={overscrollDrag.bind}
          className="flex flex-1 min-h-0 flex-col overflow-y-auto overscroll-none"
        >
          {/* Identity */}
          <div className="relative flex flex-col items-center px-5 pt-2 pb-5 text-center">
            <button
              onClick={close}
              className="absolute right-4 top-1 flex h-9 w-9 items-center justify-center rounded-full bg-muted/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close"
            >
              <X size={18} />
            </button>
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted/60 ring-1 ring-border/60">
              {isCompleted ? (
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              ) : (
                <Fly size={44} y={-3} />
              )}
            </div>
            <h2 className="mt-3 max-w-full truncate px-2 text-lg font-black tracking-tight text-foreground">
              {displayTask.text}
            </h2>
          </div>

          {/* Actions — grouped list */}
          <div className="px-4">
            <div className="divide-y divide-border/50 overflow-hidden rounded-3xl border border-border/50 bg-card">
              {actions.map((a) => {
                const Icon = a.icon;
                return (
                  <button
                    key={a.key}
                    onClick={run(a.onClick)}
                    className={`flex w-full items-center gap-3.5 px-3.5 py-3 text-left transition-colors active:bg-accent/70 ${
                      a.active ? 'bg-primary/5' : 'hover:bg-accent/50'
                    }`}
                  >
                    <span
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
                        a.active ? 'bg-primary/15' : 'bg-muted'
                      }`}
                    >
                      {a.iconName ? (
                        <AppIcon
                          name={a.iconName}
                          label={a.label}
                          className="h-5 w-5"
                        />
                      ) : Icon ? (
                        <Icon
                          className={`h-5 w-5 ${
                            a.iconClassName ??
                            (a.active ? 'text-primary' : 'text-foreground/80')
                          }`}
                        />
                      ) : null}
                    </span>
                    <span
                      className={`flex-1 text-[15px] font-bold ${
                        a.active ? 'text-primary' : 'text-foreground'
                      }`}
                    >
                      {a.label}
                    </span>
                    {a.active && <Check className="h-5 w-5 text-primary" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Delete — separated destructive action */}
          {onDelete && (
            <div className="px-4 pt-3">
              <button
                onClick={run(onDelete)}
                className="flex w-full items-center gap-3.5 rounded-3xl border border-border/50 bg-card px-3.5 py-3 text-left transition-colors hover:bg-red-50/60 active:bg-red-50 dark:hover:bg-red-500/10 dark:active:bg-red-500/15"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-100/80 dark:bg-red-500/15">
                  <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
                </span>
                <span className="flex-1 text-[15px] font-bold text-red-600 dark:text-red-400">
                  Delete task
                </span>
              </button>
            </div>
          )}

          <div className="pb-[calc(env(safe-area-inset-bottom)+16px)]" />
        </div>
        );
      }}
    </BaseSheet>
  );
}
