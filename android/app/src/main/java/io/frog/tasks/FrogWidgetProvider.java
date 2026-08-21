package io.frog.tasks;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.text.SpannableString;
import android.text.style.StrikethroughSpan;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Today's list on the home screen: up to four rows, a tap-to-tick target on
 * each, a permanent add bar, and the frog reacting to hunger and streak.
 *
 * Built with RemoteViews rather than Glance on purpose — this module is
 * otherwise pure Java, and pulling Kotlin plus the Compose compiler into a
 * Capacitor app to draw eight views would cost more than it returns. The
 * quality bar Google publishes is about the output (grid fill, contrast,
 * previews, themes, zero states), all of which this hits.
 */
public class FrogWidgetProvider extends AppWidgetProvider {

    public static final String ACTION_TOGGLE = "io.frog.tasks.WIDGET_TOGGLE";
    public static final String ACTION_REFRESH = "io.frog.tasks.WIDGET_REFRESH";
    public static final String EXTRA_TASK_ID = "taskId";
    public static final String EXTRA_DONE = "done";

    private static final int MAX_ROWS = 4;
    private static final int[] ROW_IDS = {
            R.id.widget_row_0, R.id.widget_row_1, R.id.widget_row_2, R.id.widget_row_3
    };
    private static final int[] ROW_CHECK_IDS = {
            R.id.widget_check_0, R.id.widget_check_1, R.id.widget_check_2, R.id.widget_check_3
    };
    private static final int[] ROW_TEXT_IDS = {
            R.id.widget_text_0, R.id.widget_text_1, R.id.widget_text_2, R.id.widget_text_3
    };

    /** Repaints every placed widget. */
    public static void refreshAll(Context context) {
        Context app = context.getApplicationContext();
        AppWidgetManager manager = AppWidgetManager.getInstance(app);
        int[] ids = manager.getAppWidgetIds(
                new ComponentName(app, FrogWidgetProvider.class));
        if (ids == null) return;
        for (int id : ids) {
            manager.updateAppWidget(id, build(app, manager, id));
        }
    }

    /** True once the user has at least one Frogress widget on a home screen. */
    public static boolean isPinned(Context context) {
        Context app = context.getApplicationContext();
        AppWidgetManager manager = AppWidgetManager.getInstance(app);
        int[] ids = manager.getAppWidgetIds(
                new ComponentName(app, FrogWidgetProvider.class));
        return ids != null && ids.length > 0;
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            manager.updateAppWidget(id, build(context, manager, id));
        }
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager,
                                          int appWidgetId, Bundle newOptions) {
        manager.updateAppWidget(appWidgetId, build(context, manager, appWidgetId));
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (ACTION_TOGGLE.equals(action)) {
            String taskId = intent.getStringExtra(EXTRA_TASK_ID);
            boolean done = intent.getBooleanExtra(EXTRA_DONE, true);
            if (taskId != null && !taskId.isEmpty()) {
                FrogWidgetStore.applyLocalToggle(context, taskId, done);
                FrogWidgetStore.queueToggle(context, taskId, done);
            }
            refreshAll(context);
            return;
        }
        if (ACTION_REFRESH.equals(action)) {
            refreshAll(context);
            return;
        }
        super.onReceive(context, intent);
    }

    // --- rendering --------------------------------------------------------

    private static int layoutFor(AppWidgetManager manager, int appWidgetId) {
        Bundle options = manager.getAppWidgetOptions(appWidgetId);
        int minWidth = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250);
        int minHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 110);
        if (minHeight < 100) return R.layout.frog_widget_bar;
        if (minWidth < 220) return R.layout.frog_widget_small;
        return R.layout.frog_widget;
    }

    private static int rowsFor(int layout) {
        if (layout == R.layout.frog_widget_bar) return 0;
        if (layout == R.layout.frog_widget_small) return 2;
        return MAX_ROWS;
    }

    private static RemoteViews build(Context context, AppWidgetManager manager, int appWidgetId) {
        int layout = layoutFor(manager, appWidgetId);
        RemoteViews views = new RemoteViews(context.getPackageName(), layout);
        JSONObject state = FrogWidgetStore.state(context);

        views.setOnClickPendingIntent(R.id.widget_add, quickAddIntent(context));
        views.setOnClickPendingIntent(R.id.widget_frog, openAppIntent(context, "/"));

        if (state == null || !state.optBoolean("signedIn", false)) {
            renderSignedOut(context, views, layout);
            return views;
        }

        renderFrog(views, state.optString("mood", "neutral"));
        renderStreak(views, state.optInt("streak", 0));

        int rows = rowsFor(layout);
        if (rows == 0) return views;

        JSONArray tasks = state.optJSONArray("tasks");
        int count = tasks == null ? 0 : Math.min(tasks.length(), rows);
        renderRows(context, views, tasks, count, rows);
        views.setViewVisibility(R.id.widget_empty, count == 0 ? View.VISIBLE : View.GONE);
        if (count == 0) {
            views.setTextViewText(R.id.widget_empty,
                    context.getString(R.string.widget_empty));
        }
        return views;
    }

    private static void renderSignedOut(Context context, RemoteViews views, int layout) {
        views.setViewVisibility(R.id.widget_streak, View.GONE);
        views.setImageViewResource(R.id.widget_frog, R.drawable.frog_widget_neutral);
        int rows = rowsFor(layout);
        if (rows > 0) {
            views.setViewVisibility(R.id.widget_empty, View.VISIBLE);
            views.setTextViewText(R.id.widget_empty,
                    context.getString(R.string.widget_signed_out));
            for (int i = 0; i < rows; i++) {
                views.setViewVisibility(ROW_IDS[i], View.GONE);
            }
        }
        // Never leave a signed-out widget pointing at a personal view.
        PendingIntent signIn = openAppIntent(context, "/login");
        views.setOnClickPendingIntent(R.id.widget_add, signIn);
        views.setOnClickPendingIntent(R.id.widget_root, signIn);
        views.setOnClickPendingIntent(R.id.widget_frog, signIn);
    }

    private static void renderFrog(RemoteViews views, String mood) {
        int drawable;
        switch (mood) {
            case "hungry":
                drawable = R.drawable.frog_widget_hungry;
                break;
            case "happy":
                drawable = R.drawable.frog_widget_happy;
                break;
            case "asleep":
                drawable = R.drawable.frog_widget_asleep;
                break;
            default:
                drawable = R.drawable.frog_widget_neutral;
                break;
        }
        views.setImageViewResource(R.id.widget_frog, drawable);
    }

    private static void renderStreak(RemoteViews views, int streak) {
        if (streak > 0) {
            views.setViewVisibility(R.id.widget_streak, View.VISIBLE);
            views.setTextViewText(R.id.widget_streak, String.valueOf(streak));
        } else {
            views.setViewVisibility(R.id.widget_streak, View.GONE);
        }
    }

    private static void renderRows(Context context, RemoteViews views, JSONArray tasks,
                                   int count, int rows) {
        for (int i = 0; i < rows; i++) {
            if (i >= count) {
                views.setViewVisibility(ROW_IDS[i], View.GONE);
                continue;
            }
            JSONObject task = tasks.optJSONObject(i);
            if (task == null) {
                views.setViewVisibility(ROW_IDS[i], View.GONE);
                continue;
            }
            String id = task.optString("id");
            String text = task.optString("text");
            boolean done = task.optBoolean("done", false);

            views.setViewVisibility(ROW_IDS[i], View.VISIBLE);
            views.setTextViewText(ROW_TEXT_IDS[i], done ? struckThrough(text) : text);
            views.setImageViewResource(ROW_CHECK_IDS[i],
                    done ? R.drawable.widget_check_on : R.drawable.widget_check_off);
            views.setTextColor(ROW_TEXT_IDS[i], context.getColor(
                    done ? R.color.widget_text_muted : R.color.widget_text));
            views.setContentDescription(ROW_IDS[i], done
                    ? context.getString(R.string.widget_row_done, text)
                    : context.getString(R.string.widget_row_todo, text));

            // A row captured on the home screen has no server id yet, so it
            // can't be ticked here — tapping it opens the app instead.
            if (id.startsWith(FrogWidgetStore.PENDING_PREFIX)) {
                views.setOnClickPendingIntent(ROW_IDS[i], openAppIntent(context, "/"));
            } else {
                // The whole row is the tick target, so it clears 48dp comfortably.
                views.setOnClickPendingIntent(ROW_IDS[i], toggleIntent(context, id, !done));
            }
        }
    }

    /**
     * A span rather than setPaintFlags: RemoteViews only permits methods marked
     * remotable, and setPaintFlags is not one of them on current Android.
     */
    private static CharSequence struckThrough(String text) {
        SpannableString span = new SpannableString(text);
        span.setSpan(new StrikethroughSpan(), 0, text.length(), 0);
        return span;
    }

    // --- intents ----------------------------------------------------------

    private static PendingIntent toggleIntent(Context context, String taskId, boolean done) {
        Intent intent = new Intent(context, FrogWidgetProvider.class);
        intent.setAction(ACTION_TOGGLE);
        intent.putExtra(EXTRA_TASK_ID, taskId);
        intent.putExtra(EXTRA_DONE, done);
        // Distinct data keeps these PendingIntents from collapsing into one.
        intent.setData(Uri.parse("frogress://toggle/" + taskId + "/" + done));
        return PendingIntent.getBroadcast(context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent quickAddIntent(Context context) {
        Intent intent = new Intent(context, FrogQuickAddActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(context, 1, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent openAppIntent(Context context, String path) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.setData(Uri.parse("https://frogress.com" + path));
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, 2, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
