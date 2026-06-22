package io.frog.tasks;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Android equivalent of the iOS Live Activity: an ongoing notification with a
 * live chronometer that counts the Frogodoro focus/break timer down to its end
 * time. SystemUI ticks the chronometer itself, so it keeps counting even when
 * the app is backgrounded or killed — no foreground service required.
 *
 * The timer-end *alert* is handled separately by the scheduled local
 * notification; this notification is purely the live counter. The actual
 * notification building lives in {@link FrogTimerNotification} so the same code
 * path serves both this (foreground, JS-driven) plugin and
 * {@link FrogTimerMessagingService} (background data push from the server).
 */
@CapacitorPlugin(name = "FrogTimer")
public class FrogTimerPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        showOrUpdate(call);
    }

    @PluginMethod
    public void update(PluginCall call) {
        showOrUpdate(call);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        FrogTimerNotification.cancel(getContext());
        call.resolve();
    }

    @PluginMethod
    public void setControlConfig(PluginCall call) {
        String origin = call.getString("origin", "");
        String token = call.getString("token", "");
        SharedPreferences prefs =
                getContext().getSharedPreferences("frog_timer_control", Context.MODE_PRIVATE);
        SharedPreferences.Editor ed = prefs.edit();
        if (origin != null && !origin.isEmpty()) {
            ed.putString("origin", origin);
        }
        if (token != null && !token.isEmpty()) {
            ed.putString("token", token);
        }
        ed.apply();
        call.resolve();
    }

    private void showOrUpdate(PluginCall call) {
        String phase = call.getString("phase", "focus");
        boolean isRunning = Boolean.TRUE.equals(call.getBoolean("isRunning", false));
        Double endTimeD = call.getDouble("endTime", 0.0);
        long endTime = endTimeD == null ? 0L : endTimeD.longValue();
        Integer timeLeftI = call.getInt("timeLeft", 0);
        int timeLeft = timeLeftI == null ? 0 : timeLeftI;
        String taskName = call.getString("taskName", "");

        FrogTimerNotification.show(getContext(), phase, isRunning, endTime, timeLeft, taskName);
        call.resolve();
    }
}
