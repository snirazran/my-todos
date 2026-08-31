'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeftRight, Check, ChevronRight, Loader2 } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { Icon } from '@/components/ui/Icon';
import AppleCalendarSheet from '@/components/ui/AppleCalendarSheet';
import { SyncDirectionPicker } from '@/components/ui/SyncDirectionPicker';
import {
  useCalendarConnections,
  useGoogleConnectFlow,
  type CalendarConnectionInfo,
  type CalendarProvider,
  type SyncDirection,
} from '@/hooks/useCalendarSync';
import { hapticSelect, hapticSuccess } from '@/lib/haptics';

const SUCCESS_HOLD_MS = 2200;
const GLOW_STRONG = 'rgba(79,145,73,0.28)';
const GLOW_SOFT = 'rgba(79,145,73,0.09)';

function providerLabel(provider: CalendarProvider) {
  return provider === 'google' ? 'Google Calendar' : 'Apple Calendar';
}

/** Connected-but-unhealthy connections are the ones worth re-offering. */
function needsAttention(connection?: CalendarConnectionInfo) {
  return (
    connection?.status === 'reauth_required' ||
    connection?.status === 'disconnected' ||
    connection?.status === 'paused'
  );
}

function ProviderButton({
  provider,
  connection,
  busy,
  onClick,
}: {
  provider: CalendarProvider;
  connection?: CalendarConnectionInfo;
  busy: boolean;
  onClick: () => void;
}) {
  const connected = connection?.status === 'active' || connection?.status === 'error';
  const label = providerLabel(provider);
  const action = connected ? 'Connected' : needsAttention(connection) ? 'Reconnect' : 'Connect';

  return (
    <button
      type="button"
      disabled={busy || connected}
      onClick={() => {
        hapticSelect();
        onClick();
      }}
      aria-label={`${action} ${label}`}
      className="group flex w-full items-center gap-3.5 rounded-2xl border border-border/70 bg-card px-4 py-3.5 text-left shadow-sm transition-all hover:-translate-y-px hover:border-primary/50 hover:shadow-md active:translate-y-0 disabled:translate-y-0 disabled:shadow-sm disabled:hover:border-border/70"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-muted/50">
        <Icon name={provider === 'google' ? 'googleCalendar' : 'appleCalendar'} className="h-7 w-7" />
      </span>
      <span className="min-w-0 flex-1 text-[16px] font-black tracking-tight text-foreground">
        {label}
      </span>
      {connected ? (
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-500 text-white">
          <Check className="h-4 w-4" strokeWidth={3.5} />
        </span>
      ) : busy ? (
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/70 transition-transform group-hover:translate-x-0.5" />
      )}
    </button>
  );
}

/**
 * The one place calendar sync is offered outside settings: a self-contained
 * connect flow that works the same from the planner's calendar and from the
 * post-tour nudge.
 */
export default function CalendarConnectSheet({
  open,
  onOpenChange,
  onConnected,
  dismissLabel = 'Not now',
  eyebrow,
  title = 'Sync your calendar',
  blurb = 'Your events become tasks. Your tasks become events.',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired once a provider is actually connected (not on dismiss). */
  onConnected?: () => void;
  dismissLabel?: string;
  eyebrow?: string;
  title?: string;
  blurb?: string;
}) {
  const { connections, available, mutate } = useCalendarConnections();
  const [appleOpen, setAppleOpen] = useState(false);
  const [connected, setConnected] = useState<CalendarProvider | null>(null);
  const [direction, setDirection] = useState<SyncDirection>('two_way');

  const google = connections.find((c) => c.provider === 'google');
  const apple = connections.find((c) => c.provider === 'apple');

  const succeed = useCallback(
    (provider: CalendarProvider) => {
      hapticSuccess();
      setConnected(provider);
      onConnected?.();
    },
    [onConnected],
  );

  const {
    connecting,
    error,
    connect: connectGoogle,
    cancel: cancelGoogle,
    clearError,
  } = useGoogleConnectFlow({
    mutate,
    onConnected: () => succeed('google'),
  });

  // The success state is a beat, not a screen — it confirms the connection
  // landed and then gets out of the way on its own.
  useEffect(() => {
    if (!connected) return;
    const timer = window.setTimeout(() => onOpenChange(false), SUCCESS_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [connected, onOpenChange]);

  useEffect(() => {
    if (open) return;
    cancelGoogle();
    clearError();
    setConnected(null);
    setDirection('two_way');
  }, [open, cancelGoogle, clearError]);

  const providers = useMemo(
    () =>
      (['google', 'apple'] as CalendarProvider[]).filter((p) => {
        const existing = p === 'google' ? google : apple;
        return available?.[p] !== false || !!existing;
      }),
    [available, google, apple],
  );

  const reconnecting = needsAttention(google) || needsAttention(apple);

  return (
    <>
      <BaseSheet
        open={open && !appleOpen}
        onOpenChange={onOpenChange}
        zIndex={1360}
        closeAriaLabel={dismissLabel}
        className="sm:max-w-md"
      >
        {({ entered, bindScroll }) => (
          <>
            {/* Sibling of the scroller, not a child of it — inside, the wash
                would start below the drag handle instead of the panel edge. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-52"
              style={{
                background: `radial-gradient(115% 85% at 50% 0%, ${GLOW_STRONG} 0%, ${GLOW_SOFT} 42%, transparent 72%)`,
              }}
            />
            <div
              ref={bindScroll}
              className="relative flex max-h-[100dvh] flex-col overflow-y-auto overscroll-contain px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-8 sm:max-h-[calc(100dvh-3rem)]"
            >

            <AnimatePresence mode="wait" initial={false}>
              {connected ? (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="relative flex flex-col items-center py-6 text-center"
                >
                  <motion.span
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 22 }}
                    className="grid h-16 w-16 place-items-center rounded-full bg-emerald-500 text-white shadow-[0_6px_0_#2f7d47]"
                  >
                    <Check className="h-8 w-8" strokeWidth={3.5} />
                  </motion.span>
                  <h2 className="mt-4 text-[22px] font-black tracking-tight text-foreground">
                    {providerLabel(connected)} is in
                  </h2>
                  <p className="mt-1.5 max-w-[17rem] text-[14px] font-bold text-muted-foreground">
                    {direction === 'export_only'
                      ? 'Your tasks are on their way over.'
                      : 'Your events are on their way.'}
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="offer"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="relative"
                >
                  <div className="flex flex-col items-center text-center">
                    {entered && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.94 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                        className="mb-4 grid w-full max-w-[300px] grid-cols-[1fr_auto_1fr] items-center gap-3"
                      >
                        <span className="flex justify-end -space-x-3">
                          <span className="grid h-14 w-14 place-items-center rounded-[18px] border border-border/60 bg-card shadow-md">
                            <Icon name="googleCalendar" className="h-8 w-8" />
                          </span>
                          <span className="grid h-14 w-14 place-items-center rounded-[18px] border border-border/60 bg-card shadow-md">
                            <Icon name="appleCalendar" className="h-8 w-8" />
                          </span>
                        </span>
                        <motion.span
                          animate={{ scale: [1, 1.1, 1] }}
                          transition={{
                            duration: 2.4,
                            repeat: Infinity,
                            ease: 'easeInOut',
                            delay: 0.6,
                          }}
                          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_3px_0_#34631f]"
                        >
                          <ArrowLeftRight className="h-[18px] w-[18px]" strokeWidth={3} />
                        </motion.span>
                        <span className="grid h-14 w-14 shrink-0 place-items-center justify-self-start overflow-hidden rounded-[18px] border border-border/60 bg-card shadow-md">
                          <img
                            src="/frogress-icon.png"
                            alt="Frogress"
                            className="h-full w-full object-cover"
                          />
                        </span>
                      </motion.div>
                    )}

                    {eyebrow && (
                      <p className="mb-1.5 text-[11.5px] font-black uppercase tracking-[0.08em] text-primary">
                        {eyebrow}
                      </p>
                    )}
                    <h2 className="text-[25px] font-black leading-[1.1] tracking-tight text-foreground">
                      {reconnecting ? 'Reconnect your calendar' : title}
                    </h2>
                    <p className="mx-auto mt-2 max-w-[19rem] text-[14.5px] font-bold leading-snug text-muted-foreground">
                      {reconnecting
                        ? 'Sign in again to pick sync back up. Nothing was lost.'
                        : blurb}
                    </p>
                  </div>

                  <div className="mt-5">
                    <p className="mb-1.5 px-0.5 text-[11.5px] font-black uppercase tracking-[0.07em] text-muted-foreground">
                      How it syncs
                    </p>
                    <SyncDirectionPicker
                      value={direction}
                      onChange={setDirection}
                      variant="collapsed"
                      disabled={connecting}
                    />
                  </div>

                  <div className="mt-3 grid gap-2.5">
                    {providers.length === 0 && (
                      <p className="rounded-2xl bg-muted/60 px-4 py-3 text-center text-[12.5px] font-bold text-muted-foreground">
                        Calendar sync isn’t switched on yet. Check back soon.
                      </p>
                    )}
                    {providers.map((provider) => (
                      <ProviderButton
                        key={provider}
                        provider={provider}
                        connection={provider === 'google' ? google : apple}
                        busy={provider === 'google' && connecting}
                        onClick={() =>
                          provider === 'google'
                            ? void connectGoogle(direction)
                            : setAppleOpen(true)
                        }
                      />
                    ))}
                  </div>

                  <div className="min-h-[1.5rem] pt-2">
                    {connecting && (
                      <p className="text-center text-[12px] font-bold text-muted-foreground">
                        Finish signing in, then come back here.
                      </p>
                    )}
                    {error && (
                      <p className="text-center text-[12px] font-bold text-red-500">{error}</p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className="mt-1 h-11 w-full rounded-2xl text-[15px] font-black tracking-tight text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {dismissLabel}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
            </div>
          </>
        )}
      </BaseSheet>

      <AppleCalendarSheet
        open={appleOpen}
        onOpenChange={setAppleOpen}
        direction={direction}
        onConnected={() => {
          void mutate();
          window.dispatchEvent(new Event('board-refresh'));
          succeed('apple');
        }}
      />
    </>
  );
}
