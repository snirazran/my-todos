package io.frog.tasks;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Handles the Frogodoro notification action buttons (Pause / Resume / Stop /
 * Done / +5). Runs even when the app is minimized or killed: it updates the
 * notification + native alarm immediately for instant feedback, then POSTs
 * the action to the server's /control endpoint (authenticated with the FCM
 * token the plugin stashed in SharedPreferences, ordered by a monotonically
 * increasing controlSeq, retried with backoff) so every other surface stays
 * in sync.
 *
 * Deep-focus guard: while the +1 pledge is live, the first Pause tap re-shows
 * the notification with a "tap again" warning instead of pausing — pausing
 * forfeits the bonus fly, and that must never happen on a mis-tap.
 */
public class FrogTimerActionReceiver extends BroadcastReceiver {
    static final String EXTRA_ACTION = "action";
    private static final long ARM_WINDOW_MS = 3000L;

    @Override
    public void onReceive(Context context, Intent intent) {
        final String action = intent.getStringExtra(EXTRA_ACTION);
        if (action == null) {
            return;
        }
        final Context ctx = context.getApplicationContext();
        final SharedPreferences control =
                ctx.getSharedPreferences("frog_timer_control", Context.MODE_PRIVATE);
        final FrogTimerState state = FrogTimerState.load(ctx);
        final long now = System.currentTimeMillis();

        // Two-tap pause while the deep-focus pledge is live.
        if ("pause".equals(action) && state.isRunning && state.deepFocus
                && "focus".equals(state.phase)) {
            long armedUntil = control.getLong("pauseArmUntil", 0L);
            if (now > armedUntil) {
                control.edit().putLong("pauseArmUntil", now + ARM_WINDOW_MS).apply();
                FrogTimerNotification.show(ctx, state, true);
                return;
            }
            control.edit().remove("pauseArmUntil").apply();
        }

        applyLocally(ctx, action, state, now);

        final int controlSeq = control.getInt("controlSeq", 0) + 1;
        control.edit().putInt("controlSeq", controlSeq).apply();
        final String origin = control.getString("origin", null);
        final String token = control.getString("token", null);

        final PendingResult pending = goAsync();
        new Thread(() -> {
            try {
                postControlWithRetries(origin, token, action, controlSeq);
            } finally {
                pending.finish();
            }
        }).start();
    }

    private void applyLocally(Context ctx, String action, FrogTimerState state, long now) {
        switch (action) {
            case "pause": {
                int remaining = state.endTime > 0
                        ? (int) Math.max(0, (state.endTime - now) / 1000)
                        : state.timeLeft;
                state.isRunning = false;
                state.endTime = 0L;
                state.timeLeft = remaining;
                // Pausing breaks the pledge — drop the +1 badge immediately.
                state.deepFocus = false;
                state.save(ctx);
                FrogTimerAlarm.cancel(ctx);
                FrogAlarmSoundService.stop(ctx);
                FrogTimerNotification.show(ctx, state, false);
                break;
            }
            case "resume": {
                state.isRunning = true;
                state.endTime = now + (long) state.timeLeft * 1000L;
                state.save(ctx);
                FrogTimerAlarm.sync(ctx, state.endTime);
                FrogTimerNotification.show(ctx, state, false);
                break;
            }
            case "more5": {
                state.phase = "focus";
                state.isRunning = true;
                state.timeLeft = 5 * 60;
                state.endTime = now + 5L * 60L * 1000L;
                state.save(ctx);
                FrogAlarmSoundService.stop(ctx);
                FrogTimerAlarm.sync(ctx, state.endTime);
                FrogTimerNotification.show(ctx, state, false);
                break;
            }
            case "stop":
            case "done":
                FrogTimerState.clear(ctx);
                FrogTimerAlarm.cancel(ctx);
                FrogAlarmSoundService.stop(ctx);
                FrogTimerNotification.cancel(ctx);
                break;
            default:
                break;
        }
    }

    private void postControlWithRetries(
            String origin, String token, String action, int controlSeq) {
        for (int attempt = 1; attempt <= 3; attempt++) {
            try {
                postControl(origin, token, action, controlSeq);
                return;
            } catch (Exception e) {
                if (attempt < 3) {
                    try {
                        Thread.sleep(attempt * 1500L);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        return;
                    }
                }
            }
        }
    }

    private void postControl(String origin, String token, String action, int controlSeq)
            throws Exception {
        if (origin == null || origin.isEmpty() || token == null || token.isEmpty()) {
            return;
        }
        URL url = new URL(origin + "/api/frogodoro/control");
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        try {
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);
            JSONObject body = new JSONObject();
            body.put("action", action);
            body.put("token", token);
            body.put("controlSeq", controlSeq);
            byte[] bytes = body.toString().getBytes("UTF-8");
            try (OutputStream os = conn.getOutputStream()) {
                os.write(bytes);
            }
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) {
                throw new IllegalStateException("control POST " + action + " -> " + code);
            }
        } finally {
            conn.disconnect();
        }
    }
}
