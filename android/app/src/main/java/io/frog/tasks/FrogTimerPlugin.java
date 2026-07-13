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
 * time, plus a native setAlarmClock finish alarm so the ring is exact and
 * Doze-proof. SystemUI ticks the chronometer itself, so it keeps counting even
 * when the app is backgrounded or killed — no foreground service required for
 * the countdown.
 *
 * The notification building lives in {@link FrogTimerNotification} so the same
 * code path serves this (foreground, JS-driven) plugin and
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
        FrogTimerState.clear(getContext());
        FrogTimerAlarm.cancel(getContext());
        FrogAlarmSoundService.stop(getContext());
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
        FrogTimerState state = FrogTimerState.load(getContext());
        state.phase = call.getString("phase", "focus");
        state.isRunning = Boolean.TRUE.equals(call.getBoolean("isRunning", false));
        Double endTimeD = call.getDouble("endTime", 0.0);
        state.endTime = endTimeD == null ? 0L : endTimeD.longValue();
        Integer timeLeftI = call.getInt("timeLeft", 0);
        state.timeLeft = timeLeftI == null ? 0 : timeLeftI;
        state.taskName = call.getString("taskName", "");
        Integer caught = call.getInt("fliesCaught", 0);
        state.fliesCaught = caught == null ? 0 : caught;
        Integer potential = call.getInt("fliesPotential", 0);
        state.fliesPotential = potential == null ? 0 : potential;
        state.deepFocus = Boolean.TRUE.equals(call.getBoolean("deepFocus", false));
        String sound = call.getString("sound", "");
        if (sound != null && !sound.isEmpty()) {
            state.sound = sound;
        }
        state.active = true;
        state.save(getContext());

        FrogAlarmSoundService.stop(getContext());
        FrogTimerAlarm.sync(getContext(), state.isRunning ? state.endTime : 0L);
        FrogTimerNotification.show(getContext(), state, false);
        call.resolve();
    }
}
