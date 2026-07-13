package io.frog.tasks;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Last-known timer state, persisted so the alarm receiver, boot receiver and
 * notification actions can rebuild the exact notification (and re-arm the
 * exact alarm) without the webview running.
 */
public final class FrogTimerState {
    private static final String PREFS = "frog_timer_state";

    public String phase = "focus";
    public boolean isRunning = false;
    public long endTime = 0L;
    public int timeLeft = 0;
    public String taskName = "";
    public String sound = "";
    public int fliesCaught = 0;
    public int fliesPotential = 0;
    public boolean deepFocus = false;
    public long rev = 0L;
    public boolean active = false;

    private FrogTimerState() {}

    public static FrogTimerState load(Context ctx) {
        SharedPreferences p = prefs(ctx);
        FrogTimerState s = new FrogTimerState();
        s.phase = p.getString("phase", "focus");
        s.isRunning = p.getBoolean("isRunning", false);
        s.endTime = p.getLong("endTime", 0L);
        s.timeLeft = p.getInt("timeLeft", 0);
        s.taskName = p.getString("taskName", "");
        s.sound = p.getString("sound", "");
        s.fliesCaught = p.getInt("fliesCaught", 0);
        s.fliesPotential = p.getInt("fliesPotential", 0);
        s.deepFocus = p.getBoolean("deepFocus", false);
        s.rev = p.getLong("rev", 0L);
        s.active = p.getBoolean("active", false);
        return s;
    }

    public void save(Context ctx) {
        prefs(ctx).edit()
                .putString("phase", phase)
                .putBoolean("isRunning", isRunning)
                .putLong("endTime", endTime)
                .putInt("timeLeft", timeLeft)
                .putString("taskName", taskName)
                .putString("sound", sound)
                .putInt("fliesCaught", fliesCaught)
                .putInt("fliesPotential", fliesPotential)
                .putBoolean("deepFocus", deepFocus)
                .putLong("rev", rev)
                .putBoolean("active", active)
                .apply();
    }

    public static void clear(Context ctx) {
        prefs(ctx).edit().putBoolean("active", false).putBoolean("isRunning", false).apply();
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
