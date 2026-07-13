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
            // Finished while the phone was off — ring now (no loop; the
            // moment has passed, a nudge is enough).
            state.isRunning = false;
            state.save(ctx);
            FrogTimerNotification.showAlarm(ctx, state);
        } else {
            FrogTimerNotification.show(ctx, state, false);
        }
    }
}
