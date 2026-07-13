package io.frog.tasks;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Fires exactly at the phase's end (scheduled via setAlarmClock): swap the
 * live-timer notification for the ringing alarm and start the looping sound.
 * setAlarmClock broadcasts are exempt from background-start restrictions, so
 * the foreground sound service is allowed to start from here.
 */
public class FrogTimerAlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        Context ctx = context.getApplicationContext();
        FrogTimerState state = FrogTimerState.load(ctx);
        if (!state.active) return;

        state.isRunning = false;
        state.timeLeft = 0;
        state.save(ctx);

        FrogTimerNotification.showAlarm(ctx, state);
        if (!FrogAppState.isInForeground()) {
            FrogAlarmSoundService.start(ctx, state.sound);
        }
    }
}
