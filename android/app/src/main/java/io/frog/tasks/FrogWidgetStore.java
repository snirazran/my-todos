package io.frog.tasks;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.UUID;

/**
 * The only thing the native side and the webview share.
 *
 * The webview writes a rendered snapshot of today (state) whenever app state
 * changes; the widget reads it. Actions taken on the home screen while the
 * webview is not running go the other way, into a queue the webview drains and
 * replays through the normal task endpoints. Nothing here talks to the network
 * — the native side has no session cookie and no idea who is signed in.
 */
public final class FrogWidgetStore {

    private static final String PREFS = "frog_widget";
    private static final String KEY_STATE = "state";
    private static final String KEY_QUEUE = "queue";
    private static final int MAX_QUEUE = 50;

    private static final Object LOCK = new Object();

    private FrogWidgetStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext()
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // --- state (webview -> widget) ---------------------------------------

    public static void setState(Context context, String json) {
        prefs(context).edit().putString(KEY_STATE, json).apply();
    }

    public static void clearState(Context context) {
        prefs(context).edit().remove(KEY_STATE).apply();
    }

    public static String rawState(Context context) {
        return prefs(context).getString(KEY_STATE, null);
    }

    public static JSONObject state(Context context) {
        String raw = rawState(context);
        if (raw == null) return null;
        try {
            return new JSONObject(raw);
        } catch (JSONException e) {
            return null;
        }
    }

    /** Marks a row the webview has not seen yet; it cannot be ticked. */
    public static final String PENDING_PREFIX = "pending:";

    /**
     * Shows a just-captured task straight away, before the webview has had a
     * chance to create it. The id is local-only, so the row renders as pending
     * until the real snapshot replaces it.
     */
    public static void applyLocalAdd(Context context, String text) {
        synchronized (LOCK) {
            JSONObject state = state(context);
            if (state == null) return;
            JSONArray tasks = state.optJSONArray("tasks");
            if (tasks == null) tasks = new JSONArray();
            try {
                JSONObject row = new JSONObject();
                row.put("id", PENDING_PREFIX + UUID.randomUUID());
                row.put("text", text);
                row.put("done", false);
                JSONArray next = new JSONArray();
                next.put(row);
                for (int i = 0; i < tasks.length(); i++) {
                    next.put(tasks.get(i));
                }
                state.put("tasks", next);
                state.put("totalCount", state.optInt("totalCount", 0) + 1);
                setState(context, state.toString());
            } catch (JSONException ignored) {
                // Values are all primitives; cannot throw in practice.
            }
        }
    }

    /** Flips a row locally so the widget reacts instantly, before any sync. */
    public static void applyLocalToggle(Context context, String taskId, boolean done) {
        synchronized (LOCK) {
            JSONObject state = state(context);
            if (state == null) return;
            JSONArray tasks = state.optJSONArray("tasks");
            if (tasks == null) return;
            int doneCount = 0;
            for (int i = 0; i < tasks.length(); i++) {
                JSONObject task = tasks.optJSONObject(i);
                if (task == null) continue;
                if (taskId.equals(task.optString("id"))) {
                    try {
                        task.put("done", done);
                    } catch (JSONException ignored) {
                        // Not reachable for a boolean value.
                    }
                }
                if (task.optBoolean("done")) doneCount++;
            }
            try {
                state.put("doneCount", doneCount);
            } catch (JSONException ignored) {
                // Not reachable for an int value.
            }
            setState(context, state.toString());
        }
    }

    // --- queue (widget -> webview) ---------------------------------------

    private static String currentUid(Context context) {
        JSONObject state = state(context);
        return state == null ? "" : state.optString("uid", "");
    }

    private static boolean currentGuest(Context context) {
        JSONObject state = state(context);
        return state != null && state.optBoolean("guest", false);
    }

    private static void enqueue(Context context, JSONObject action) {
        synchronized (LOCK) {
            SharedPreferences p = prefs(context);
            JSONArray queue;
            try {
                queue = new JSONArray(p.getString(KEY_QUEUE, "[]"));
            } catch (JSONException e) {
                queue = new JSONArray();
            }
            queue.put(action);
            // Drop the oldest rather than growing without bound if the app is
            // never opened again.
            while (queue.length() > MAX_QUEUE) {
                queue.remove(0);
            }
            p.edit().putString(KEY_QUEUE, queue.toString()).apply();
        }
    }

    public static void queueAdd(Context context, String text) {
        try {
            JSONObject action = new JSONObject();
            action.put("kind", "add");
            action.put("clientId", UUID.randomUUID().toString());
            action.put("text", text);
            action.put("uid", currentUid(context));
            action.put("guest", currentGuest(context));
            action.put("at", System.currentTimeMillis());
            enqueue(context, action);
        } catch (JSONException ignored) {
            // Only string/boolean/long values; cannot throw in practice.
        }
    }

    public static void queueToggle(Context context, String taskId, boolean done) {
        try {
            JSONObject action = new JSONObject();
            action.put("kind", "toggle");
            action.put("clientId", UUID.randomUUID().toString());
            action.put("taskId", taskId);
            action.put("done", done);
            action.put("uid", currentUid(context));
            action.put("guest", currentGuest(context));
            action.put("at", System.currentTimeMillis());
            enqueue(context, action);
        } catch (JSONException ignored) {
            // As above.
        }
    }

    /** Reads and empties the queue in one step, so nothing replays twice. */
    public static String drainQueue(Context context) {
        synchronized (LOCK) {
            SharedPreferences p = prefs(context);
            String queue = p.getString(KEY_QUEUE, "[]");
            p.edit().remove(KEY_QUEUE).apply();
            return queue;
        }
    }
}
