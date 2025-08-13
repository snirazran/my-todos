'use client';

import * as React from 'react';
import * as RD from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';

export const Dialog = RD.Root;
export const DialogTrigger = RD.Trigger;
export const DialogClose = RD.Close;

export function DialogContent({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof RD.Content>) {
  return (
    <RD.Portal>
      <RD.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm" />
      <RD.Content
        {...props}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:p-6',
          className
        )}
      >
        {children}
      </RD.Content>
    </RD.Portal>
  );
}

export function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-3 space-y-1', className)} {...props} />;
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof RD.Title>) {
  return (
    <RD.Title
      className={cn(
        'text-lg font-semibold leading-none tracking-tight',
        className
      )}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof RD.Description>) {
  return (
    <RD.Description
      className={cn('text-sm text-slate-500 dark:text-slate-400', className)}
      {...props}
    />
  );
}
