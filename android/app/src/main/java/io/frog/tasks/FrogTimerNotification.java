package io.frog.tasks;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;

import androidx.core.app.NotificationCompat;

/**
 * Shared builder for the Frogodoro live-timer notification (the Android
 * equivalent of the iOS Live Activity). Used both by {@link FrogTimerPlugin}
 * (foreground, JS-driven) and {@link FrogTimerMessagingService} (background /
 * killed, driven by a data push from the server), so a state change made on
 * any device renders the same notification regardless of which path posts it.
 */
public final class FrogTimerNotification {
    public static final String CHANNEL_ID = "frogodoro_live_timer";
    public static final int NOTIF_ID = 770001;

    private FrogTimerNotification() {}

    private static void ensureChannel(NotificationManager nm) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (nm.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel ch = new NotificationChannel(
                        CHANNEL_ID,
                        "Frogodoro timer",
                        NotificationManager.IMPORTANCE_LOW);
                ch.setDescription("Live focus / break timer");
                ch.setShowBadge(false);
                ch.enableVibration(false);
                ch.setSound(null, null);
                nm.createNotificationChannel(ch);
            }
        }
    }

    public static void show(
            Context ctx,
            String phase,
            boolean isRunning,
            long endTime,
            int timeLeft,
            String taskName) {
        NotificationManager nm =
                (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) {
            return;
        }
        ensureChannel(nm);

        boolean isFocus = !"break".equals(phase);
        String label = isFocus ? "Focus" : "Break";
        int color = isFocus ? Color.parseColor("#16a34a") : Color.parseColor("#0ea5e9");

        String title = label;
        if (taskName != null && !taskName.isEmpty()) {
            title = label + " · " + taskName;
        }

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setSmallIcon(resolveSmallIcon(ctx))
                .setColor(color)
                .setColorized(true)
                .setContentTitle(title)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_STOPWATCH);

        PendingIntent contentPI = buildLaunchIntent(ctx);
        if (contentPI != null) {
            b.setContentIntent(contentPI);
        }

        if (isRunning && endTime > 0) {
            b.setUsesChronometer(true);
            b.setShowWhen(true);
            b.setWhen(endTime);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                b.setChronometerCountDown(true);
            }
            b.setContentText(label + " in progress");
        } else {
            b.setUsesChronometer(false);
            b.setShowWhen(false);
            int m = timeLeft / 60;
            int s = timeLeft % 60;
            b.setContentText(String.format("Paused · %d:%02d left", m, s));
        }

        try {
            nm.notify(NOTIF_ID, b.build());
        } catch (Exception ignored) {
        }
    }

    public static void cancel(Context ctx) {
        NotificationManager nm =
                (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancel(NOTIF_ID);
        }
    }

    private static PendingIntent buildLaunchIntent(Context ctx) {
        Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (launch == null) {
            return null;
        }
        launch.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getActivity(ctx, 0, launch, flags);
    }

    private static int resolveSmallIcon(Context ctx) {
        int id = ctx.getResources().getIdentifier("ic_notification", "drawable", ctx.getPackageName());
        if (id != 0) {
            return id;
        }
        id = ctx.getResources().getIdentifier("ic_launcher", "mipmap", ctx.getPackageName());
        return id != 0 ? id : android.R.drawable.ic_dialog_info;
    }
}
