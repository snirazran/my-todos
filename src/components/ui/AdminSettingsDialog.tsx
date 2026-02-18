'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Trash2,
  DollarSign,
  Sparkles,
  AlertTriangle,
  Gift,
  Wind,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createPortal } from 'react-dom';

interface AdminSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdminSettingsDialog({
  open,
  onOpenChange,
}: AdminSettingsDialogProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);

  const handleResetTasks = async () => {
    if (confirmAction !== 'reset-tasks') {
      setConfirmAction('reset-tasks');
      return;
    }

    setLoading('reset-tasks');
    try {
      const res = await fetch('/api/admin/reset-tasks', {
        method: 'POST',
      });

      if (res.ok) {
        window.location.reload();
      } else {
        alert('Failed to reset tasks');
      }
    } catch (error) {
      alert('Error resetting tasks');
    } finally {
      setLoading(null);
      setConfirmAction(null);
    }
  };

  const handleResetCash = async () => {
    if (confirmAction !== 'reset-cash') {
      setConfirmAction('reset-cash');
      return;
    }

    setLoading('reset-cash');
    try {
      const res = await fetch('/api/admin/reset-cash', {
        method: 'POST',
      });

      if (res.ok) {
        window.location.reload();
      } else {
        alert('Failed to reset cash');
      }
    } catch (error) {
      alert('Error resetting cash');
    } finally {
      setLoading(null);
      setConfirmAction(null);
    }
  };

  const handleResetDaily = async () => {
    if (confirmAction !== 'reset-daily') {
      setConfirmAction('reset-daily');
      return;
    }

    setLoading('reset-daily');
    try {
      const res = await fetch('/api/admin/reset-daily-reward', {
        method: 'POST',
      });

      if (res.ok) {
        window.location.reload();
      } else {
        alert('Failed to reset daily reward');
      }
    } catch (error) {
      alert('Error resetting daily reward');
    } finally {
      setLoading(null);
      setConfirmAction(null);
    }
  };

  const handleResetFlies = async () => {
    setLoading('reset-flies');
    try {
      const res = await fetch('/api/admin/reset-flies');

      if (res.ok) {
        window.location.reload();
      } else {
        alert('Failed to reset flies');
      }
    } catch (error) {
      alert('Error resetting flies');
    } finally {
      setLoading(null);
    }
  };

  const handleAddFlies = async () => {
    setLoading('add-flies');
    try {
      const res = await fetch('/api/admin/add-flies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 100000 }),
      });

      if (res.ok) {
        window.location.reload();
      } else {
        alert('Failed to add flies');
      }
    } catch (error) {
      alert('Error adding flies');
    } finally {
      setLoading(null);
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
            className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-md"
          />

          {/* Dialog */}
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-full max-w-md bg-background border border-border rounded-3xl shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="relative px-6 py-5 border-b border-border/40 bg-gradient-to-br from-amber-500/10 to-orange-500/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <h2 className="text-xl font-black tracking-tight text-foreground">
                      Admin Settings
                    </h2>
                  </div>
                  <button
                    onClick={() => onOpenChange(false)}
                    className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-muted transition-colors"
                  >
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Testing utilities for development
                </p>
              </div>

              {/* Content */}
              <div className="p-6 space-y-4">
                {/* Reset Tasks & Statistics */}
                <div className="space-y-2">
                  <Button
                    onClick={handleResetTasks}
                    disabled={loading !== null}
                    variant={
                      confirmAction === 'reset-tasks'
                        ? 'destructive'
                        : 'outline'
                    }
                    className="w-full justify-start gap-3 h-auto py-4 px-4"
                  >
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
                      <Trash2 className="w-5 h-5" />
                    </div>
                    <div className="flex-1 text-left">
                      <div className="font-bold text-sm">
                        Reset Tasks & Statistics
                      </div>
                      <div className="text-xs text-muted-foreground font-normal">
                        Clear all tasks, history, and milestones
                      </div>
                    </div>
                    {loading === 'reset-tasks' && (
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    )}
                  </Button>
                  {confirmAction === 'reset-tasks' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-xl"
                    >
                      <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                      <div className="text-xs text-red-600 dark:text-red-400">
                        <strong>Warning:</strong> This will permanently delete
                        all your tasks and progress. Click again to confirm.
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Reset Cash */}
                <div className="space-y-2">
                  <Button
                    onClick={handleResetCash}
                    disabled={loading !== null}
                    variant={
                      confirmAction === 'reset-cash' ? 'destructive' : 'outline'
                    }
                    className="w-full justify-start gap-3 h-auto py-4 px-4"
                  >
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400">
                      <DollarSign className="w-5 h-5" />
                    </div>
                    <div className="flex-1 text-left">
                      <div className="font-bold text-sm">Reset Cash</div>
                      <div className="text-xs text-muted-foreground font-normal">
                        Set flies balance to 0
                      </div>
                    </div>
                    {loading === 'reset-cash' && (
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    )}
                  </Button>
                  {confirmAction === 'reset-cash' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="flex items-start gap-2 p-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900 rounded-xl"
                    >
                      <AlertTriangle className="w-4 h-4 text-orange-600 dark:text-orange-400 mt-0.5 shrink-0" />
                      <div className="text-xs text-orange-600 dark:text-orange-400">
                        <strong>Warning:</strong> This will reset your flies to
                        0. Click again to confirm.
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Reset Daily Reward */}
                <div className="space-y-2">
                  <Button
                    onClick={handleResetDaily}
                    disabled={loading !== null}
                    variant={
                      confirmAction === 'reset-daily'
                        ? 'destructive'
                        : 'outline'
                    }
                    className="w-full justify-start gap-3 h-auto py-4 px-4"
                  >
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400">
                      <Gift className="w-5 h-5" />
                    </div>
                    <div className="flex-1 text-left">
                      <div className="font-bold text-sm">
                        Reset Daily Reward
                      </div>
                      <div className="text-xs text-muted-foreground font-normal">
                        Allow claiming today's reward again
                      </div>
                    </div>
                    {loading === 'reset-daily' && (
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    )}
                  </Button>
                  {confirmAction === 'reset-daily' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="flex items-start gap-2 p-3 bg-teal-50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-900 rounded-xl"
                    >
                      <AlertTriangle className="w-4 h-4 text-teal-600 dark:text-teal-400 mt-0.5 shrink-0" />
                      <div className="text-xs text-teal-600 dark:text-teal-400">
                        <strong>Confirm:</strong> This will reset today's reward
                        claim status. Click again to maximize testing.
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Reset Flies */}
                <Button
                  onClick={handleResetFlies}
                  disabled={loading !== null}
                  variant="outline"
                  className="w-full justify-start gap-3 h-auto py-4 px-4"
                >
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                    <Wind className="w-5 h-5" />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-bold text-sm">Reset Flies</div>
                    <div className="text-xs text-muted-foreground font-normal">
                      Reset collected flies to 0 for today
                    </div>
                  </div>
                  {loading === 'reset-flies' && (
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  )}
                </Button>

                {/* Add Flies */}
                <Button
                  onClick={handleAddFlies}
                  disabled={loading !== null}
                  variant="default"
                  className="w-full justify-start gap-3 h-auto py-4 px-4 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-white/20">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-bold text-sm">Add 100,000 Flies</div>
                    <div className="text-xs text-emerald-100 font-normal">
                      Instant currency boost for testing
                    </div>
                  </div>
                  {loading === 'add-flies' && (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                </Button>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-muted/30 border-t border-border/40">
                <p className="text-xs text-muted-foreground text-center">
                  These actions are for testing purposes only
                </p>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
