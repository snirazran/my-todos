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
 * Done). Runs even when the app is minimized or killed: it updates the
 * notification immediately for instant feedback, then POSTs the action to the
 * server's /control endpoint (authenticated with the FCM token the plugin
 * stashed in SharedPreferences) so every other surface stays in sync.
 */
public class FrogTimerActionReceiver extends BroadcastReceiver {
    static final String EXTRA_ACTION = "action";
    static final String EXTRA_PHASE = "phase";
    static final String EXTRA_END_TIME = "endTime";
    static final String EXTRA_TIME_LEFT = "timeLeft";
    static final String EXTRA_TASK_NAME = "taskName";

    @Override
    public void onReceive(Context context, Intent intent) {
        final String action = intent.getStringExtra(EXTRA_ACTION);
        if (action == null) {
            return;
        }
        final Context ctx = context.getApplicationContext();

        applyLocally(ctx, action, intent);

        final PendingResult pending = goAsync();
        final SharedPreferences prefs =
                ctx.getSharedPreferences("frog_timer_control", Context.MODE_PRIVATE);
        final String origin = prefs.getString("origin", null);
        final String token = prefs.getString("token", null);

        new Thread(() -> {
            try {
                postControl(origin, token, action);
            } catch (Exception ignored) {
            } finally {
                pending.finish();
            }
        }).start();
    }

    private void applyLocally(Context ctx, String action, Intent intent) {
        String phase = intent.getStringExtra(EXTRA_PHASE);
        if (phase == null) {
            phase = "focus";
        }
        long endTime = intent.getLongExtra(EXTRA_END_TIME, 0L);
        int timeLeft = intent.getIntExtra(EXTRA_TIME_LEFT, 0);
        String taskName = intent.getStringExtra(EXTRA_TASK_NAME);
        if (taskName == null) {
            taskName = "";
        }

        long now = System.currentTimeMillis();
        switch (action) {
            case "pause": {
                int remaining = endTime > 0
                        ? (int) Math.max(0, (endTime - now) / 1000)
                        : timeLeft;
                FrogTimerNotification.show(ctx, phase, false, 0L, remaining, taskName);
                break;
            }
            case "resume": {
                long newEnd = now + (long) timeLeft * 1000L;
                FrogTimerNotification.show(ctx, phase, true, newEnd, timeLeft, taskName);
                break;
            }
            case "stop":
            case "done":
                FrogTimerNotification.cancel(ctx);
                break;
            default:
                break;
        }
    }

    private void postControl(String origin, String token, String action) throws Exception {
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
            byte[] bytes = body.toString().getBytes("UTF-8");
            try (OutputStream os = conn.getOutputStream()) {
                os.write(bytes);
            }
            conn.getResponseCode();
        } finally {
            conn.disconnect();
        }
    }
}
