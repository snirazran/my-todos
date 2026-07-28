package io.frog.tasks;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Notifications and alarms don't survive a reboot; the timer server-side
 * does. Rebuild the live notification and re-arm the finish alarm from the
 * persisted state so a restart mid-session doesn't silently lose the ring.
 */
public class FrogBootReceiver extends BroadcastReceiver {
    /**
     * How long after a phase ended a boot-time nudge is still worth showing.
     * Past this the session is history — and it may well have been stopped from
     * another device while this phone was off, so ringing would be a phantom.
     */
    private static final long RING_GRACE_MS = 2 * 60 * 1000L;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        Context ctx = context.getApplicationContext();
        FrogTimerState state = FrogTimerState.load(ctx);
        if (!state.active) return;

        long now = System.currentTimeMillis();
        if (state.isRunning && state.endTime > now) {
            FrogTimerNotification.show(ctx, state, false);
            FrogTimerAlarm.sync(ctx, state.endTime);
        } else if (state.isRunning && state.endTime > 0) {
            state.isRunning = false;
            state.save(ctx);
            if (now - state.endTime <= RING_GRACE_MS) {
                // Just finished while the phone was off — a nudge, no loop.
                FrogTimerNotification.showAlarm(ctx, state);
            } else {
                FrogTimerState.clear(ctx);
                FrogTimerNotification.cancel(ctx);
            }
        } else {
            FrogTimerNotification.show(ctx, state, false);
        }
    }
}
