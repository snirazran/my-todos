'use client';

import React, { useEffect, useState } from 'react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { NotifyView } from './quick-add/NotifyView';
import { nowHm, pad } from './quick-add/utils';
import { useNotificationStatus } from '@/hooks/useNotificationStatus';

interface Props {
  open: boolean;
  taskName: string;
  initialStartTime?: string;
  initialReminder?: string;
  busy?: boolean;
  onClose: () => void;
  onSave: (data: {
    startTime: string;
    endTime: string;
    reminder: string;
  }) => void | Promise<void>;
}

export function TimePopup({
  open,
  taskName,
  initialStartTime = '',
  initialReminder = '',
  busy,
  onClose,
  onSave,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [startTime, setStartTime] = useState(initialStartTime || nowHm());
  // Opening Notify means you want a reminder, so the picker is always ready.
  const hasExisting = !!initialReminder;
  const { canEnable: canEnableNotifs, enableOrConfigure } = useNotificationStatus();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    setStartTime(initialStartTime || nowHm());
  }, [open, initialStartTime]);

  if (!mounted) return null;

  const [hour24, minute] = startTime.split(':').map(Number);

  const setTimeParts = (h: number, m: number) => {
    setStartTime(`${pad(h)}:${pad(m)}`);
  };

  const handleSave = async () => {
    await onSave({ startTime, endTime: '', reminder: 'at_time' });
    // A reminder is useless if the OS won't let us deliver it — nudge the user
    // to switch notifications on right after they save one.
    if (canEnableNotifs) {
      await enableOrConfigure();
    }
  };

  const handleRemove = async () => {
    await onSave({ startTime: '', endTime: '', reminder: '' });
  };

  return (
    <BaseSheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      zIndex={1500}
      className="bg-background ring-1 ring-border/70 sm:max-w-[440px]"
    >
      {() => (
        <div className="w-full px-5 pb-[calc(env(safe-area-inset-bottom)+22px)] pt-1 sm:pb-6">
              <div className="mx-auto w-full">
                <NotifyView
                  reminderHour24={hour24}
                  reminderMinute={minute}
                  setReminderTimeParts={setTimeParts}
                  onSave={handleSave}
                  saveLabel={busy ? 'Saving...' : 'Save reminder'}
                  saveDisabled={busy || !startTime}
                  canRemove={hasExisting}
                  onRemove={handleRemove}
                />
              </div>
        </div>
      )}
    </BaseSheet>
  );
}
