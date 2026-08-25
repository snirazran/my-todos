package io.frog.tasks;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.TypedValue;
import android.text.SpannableString;
import android.text.style.StrikethroughSpan;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Today's list on the home screen, in three sizes: the count and today's
 * progress, a fly to tap on every row, the frog of the day, and — on the
 * largest — a word of the day.
 *
 * Built with RemoteViews rather than Glance on purpose — this module is
 * otherwise pure Java, and pulling Kotlin plus the Compose compiler into a
 * Capacitor app to draw a dozen views would cost more than it returns. Light
 * and dark come from res/values and res/values-night, so the launcher's theme
 * picks the card colour without any of it being decided here.
 */
public class FrogWidgetProvider extends AppWidgetProvider {

    public static final String ACTION_TOGGLE = "io.frog.tasks.WIDGET_TOGGLE";
    public static final String ACTION_REFRESH = "io.frog.tasks.WIDGET_REFRESH";
    public static final String EXTRA_TASK_ID = "taskId";
    public static final String EXTRA_DONE = "done";

    private static final int[] ROW_IDS = {
            R.id.widget_row_0, R.id.widget_row_1, R.id.widget_row_2, R.id.widget_row_3,
            R.id.widget_row_4, R.id.widget_row_5, R.id.widget_row_6
    };
    private static final int[] ROW_CHECK_IDS = {
            R.id.widget_check_0, R.id.widget_check_1, R.id.widget_check_2, R.id.widget_check_3,
            R.id.widget_check_4, R.id.widget_check_5, R.id.widget_check_6
    };
    private static final int[] ROW_TEXT_IDS = {
            R.id.widget_text_0, R.id.widget_text_1, R.id.widget_text_2, R.id.widget_text_3,
            R.id.widget_text_4, R.id.widget_text_5, R.id.widget_text_6
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
        if (minWidth < 220) return R.layout.frog_widget_small;
        // Tall enough for the list to be worth the word of the day underneath.
        if (minHeight >= 220) return R.layout.frog_widget_large;
        return R.layout.frog_widget_medium;
    }

    private static int rowsFor(int layout) {
        if (layout == R.layout.frog_widget_small) return 3;
        if (layout == R.layout.frog_widget_large) return 7;
        return 4;
    }

    private static RemoteViews build(Context context, AppWidgetManager manager, int appWidgetId) {
        int layout = layoutFor(manager, appWidgetId);
        RemoteViews views = new RemoteViews(context.getPackageName(), layout);
        JSONObject state = FrogWidgetStore.state(context);

        views.setOnClickPendingIntent(R.id.widget_add, quickAddIntent(context));

        if (state == null || !state.optBoolean("signedIn", false)) {
            renderSignedOut(context, views, layout);
            return views;
        }

        int total = state.optInt("totalCount", 0);
        int done = state.optInt("doneCount", 0);
        renderCount(context, views, layout, total - done);
        renderProgress(views, done, total);
        if (layout != R.layout.frog_widget_small) {
            renderArt(views, state.optString("art", "skater"));
        }
        if (layout == R.layout.frog_widget_large) {
            renderWord(views, state.optJSONObject("word"));
        }

        applyScale(context, views, manager, appWidgetId, layout);

        JSONArray tasks = state.optJSONArray("tasks");
        int rows = rowsFor(layout);
        int count = tasks == null ? 0 : Math.min(tasks.length(), rows);
        renderRows(context, views, tasks, count, rows);
        views.setViewVisibility(R.id.widget_empty, count == 0 ? View.VISIBLE : View.GONE);
        if (count == 0) {
            views.setTextViewText(R.id.widget_empty,
                    context.getString(R.string.widget_empty));
        }
        return views;
    }

    /**
     * Holds the sheet's proportions on a launcher that hands out a wider cell
     * than the 158/338dp the design was drawn against — the same reason the
     * iOS side scales off its measured width. Without it the contents keep
     * their size while the card grows and the whole card reads small.
     *
     * Android 12 is the floor because resizing a view at runtime needs
     * setViewLayout*, which arrived there. Below it the widget renders at the
     * sizes the layout was authored with, which is coherent, just not scaled.
     */
    private static void applyScale(Context context, RemoteViews views, AppWidgetManager manager,
                                   int appWidgetId, int layout) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return;

        Bundle options = manager.getAppWidgetOptions(appWidgetId);
        int width = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
        float reference = layout == R.layout.frog_widget_small ? 158f : 338f;
        if (width <= 0) return;
        // Clamped so an unusual launcher grid can't blow the card apart.
        float scale = Math.max(0.85f, Math.min(1.3f, width / reference));
        if (Math.abs(scale - 1f) < 0.02f) return;

        text(views, R.id.widget_count, 30f, scale);
        text(views, R.id.widget_empty, 13f, scale);
        size(views, R.id.widget_add,
                layout == R.layout.frog_widget_small ? 23.5f : 31.9f, scale);

        if (layout == R.layout.frog_widget_medium) {
            text(views, R.id.widget_tasks_left, 15.5f, scale);
            size(views, R.id.widget_art, 113f, 82f, scale);
        } else if (layout == R.layout.frog_widget_large) {
            text(views, R.id.widget_word_term, 13f, scale);
            text(views, R.id.widget_word_meaning, 10f, scale);
            size(views, R.id.widget_art, 169f, 122f, scale);
        }

        for (int i = 0; i < rowsFor(layout); i++) {
            text(views, ROW_TEXT_IDS[i], 13f, scale);
            size(views, ROW_CHECK_IDS[i], 23.74f, scale);
        }
        scaleReserves(context, views, layout, scale);
    }

    /** The trailing gaps that keep long titles off the add button and the frog. */
    private static void scaleReserves(Context context, RemoteViews views, int layout, float scale) {
        if (layout == R.layout.frog_widget_medium) {
            padEnd(context, views, ROW_TEXT_IDS[3], 40f, scale);
        } else if (layout == R.layout.frog_widget_large) {
            padEnd(context, views, ROW_TEXT_IDS[5], 158f, scale);
            padEnd(context, views, ROW_TEXT_IDS[6], 158f, scale);
        }
    }

    private static void text(RemoteViews views, int id, float sp, float scale) {
        views.setTextViewTextSize(id, TypedValue.COMPLEX_UNIT_SP, sp * scale);
    }

    private static void size(RemoteViews views, int id, float dp, float scale) {
        size(views, id, dp, dp, scale);
    }

    private static void size(RemoteViews views, int id, float wDp, float hDp, float scale) {
        views.setViewLayoutWidth(id, wDp * scale, TypedValue.COMPLEX_UNIT_DIP);
        views.setViewLayoutHeight(id, hDp * scale, TypedValue.COMPLEX_UNIT_DIP);
    }

    /**
     * setViewPadding takes pixels and is absolute — there is no relative
     * variant on RemoteViews — so the side has to be chosen by hand. The app
     * ships Hebrew, where the reserve belongs on the left.
     */
    private static void padEnd(Context context, RemoteViews views, int id, float dp, float scale) {
        int px = Math.round(dp * scale * context.getResources().getDisplayMetrics().density);
        boolean rtl = context.getResources().getConfiguration().getLayoutDirection()
                == View.LAYOUT_DIRECTION_RTL;
        views.setViewPadding(id, rtl ? px : 0, 0, rtl ? 0 : px, 0);
    }

    private static void renderSignedOut(Context context, RemoteViews views, int layout) {
        views.setTextViewText(R.id.widget_count, "");
        if (layout == R.layout.frog_widget_large) {
            views.setViewVisibility(R.id.widget_word_term, View.GONE);
            views.setViewVisibility(R.id.widget_word_meaning, View.GONE);
        }
        views.setViewVisibility(R.id.widget_empty, View.VISIBLE);
        views.setTextViewText(R.id.widget_empty,
                context.getString(R.string.widget_signed_out));
        for (int i = 0; i < rowsFor(layout); i++) {
            views.setViewVisibility(ROW_IDS[i], View.GONE);
        }
        // Never leave a signed-out widget pointing at a personal view.
        PendingIntent signIn = openAppIntent(context, "/login");
        views.setOnClickPendingIntent(R.id.widget_add, signIn);
        views.setOnClickPendingIntent(R.id.widget_root, signIn);
    }

    /**
     * Large has room to spell the whole sentence on one line. Medium carries a
     * static "tasks left" label under the number, and small shows the number
     * alone — so both of those only need the figure.
     */
    private static void renderCount(Context context, RemoteViews views, int layout, int remaining) {
        int safe = Math.max(0, remaining);
        if (layout == R.layout.frog_widget_large) {
            views.setTextViewText(R.id.widget_count,
                    context.getString(R.string.widget_tasks_left_count, safe));
        } else {
            views.setTextViewText(R.id.widget_count, String.valueOf(safe));
        }
    }

    private static void renderProgress(RemoteViews views, int done, int total) {
        int percent = total <= 0 ? 0 : Math.round((done * 100f) / total);
        views.setProgressBar(R.id.widget_progress, 100, Math.min(100, percent), false);
    }

    private static void renderArt(RemoteViews views, String art) {
        int drawable;
        switch (art) {
            case "astronaut":
                drawable = R.drawable.frog_art_astronaut;
                break;
            case "laptop":
                drawable = R.drawable.frog_art_laptop;
                break;
            default:
                drawable = R.drawable.frog_art_skater;
                break;
        }
        views.setImageViewResource(R.id.widget_art, drawable);
    }

    private static void renderWord(RemoteViews views, JSONObject word) {
        if (word == null) {
            views.setViewVisibility(R.id.widget_word_term, View.GONE);
            views.setViewVisibility(R.id.widget_word_meaning, View.GONE);
            return;
        }
        views.setViewVisibility(R.id.widget_word_term, View.VISIBLE);
        views.setViewVisibility(R.id.widget_word_meaning, View.VISIBLE);
        views.setTextViewText(R.id.widget_word_term, word.optString("term"));
        views.setTextViewText(R.id.widget_word_meaning, word.optString("meaning"));
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
