package io.frog.tasks;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.RingtoneManager;
import android.net.Uri;
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
    public static final String ALARM_CHANNEL_ID = "frogodoro_alarm";
    public static final int ALARM_NOTIF_ID = 770002;

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
        nm.cancel(ALARM_NOTIF_ID);

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

        if (isRunning) {
            b.addAction(0, "Pause",
                    actionIntent(ctx, "pause", phase, endTime, timeLeft, taskName, 11));
        } else {
            b.addAction(0, "Resume",
                    actionIntent(ctx, "resume", phase, endTime, timeLeft, taskName, 12));
        }
        b.addAction(0, "Stop",
                actionIntent(ctx, "stop", phase, endTime, timeLeft, taskName, 13));

        try {
            nm.notify(NOTIF_ID, b.build());
        } catch (Exception ignored) {
        }
    }

    private static Uri alarmSound() {
        Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (uri == null) {
            uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        }
        return uri;
    }

    private static void ensureAlarmChannel(NotificationManager nm) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (nm.getNotificationChannel(ALARM_CHANNEL_ID) == null) {
                NotificationChannel ch = new NotificationChannel(
                        ALARM_CHANNEL_ID,
                        "Frogodoro alarm",
                        NotificationManager.IMPORTANCE_HIGH);
                ch.setDescription("Focus / break finished alarm");
                ch.setShowBadge(false);
                ch.enableVibration(true);
                ch.setVibrationPattern(new long[]{0, 500, 250, 500, 250, 500});
                AudioAttributes attrs = new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build();
                ch.setSound(alarmSound(), attrs);
                nm.createNotificationChannel(ch);
            }
        }
    }

    public static void showAlarm(Context ctx, String phase) {
        NotificationManager nm =
                (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) {
            return;
        }
        ensureAlarmChannel(nm);

        boolean isFocus = !"break".equals(phase);
        String title = isFocus ? "Focus finished" : "Break finished";
        String body = isFocus
                ? "Time for a break. You earned it!"
                : "Ready to focus whenever you are.";
        int color = isFocus ? Color.parseColor("#16a34a") : Color.parseColor("#0ea5e9");

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, ALARM_CHANNEL_ID)
                .setSmallIcon(resolveSmallIcon(ctx))
                .setColor(color)
                .setColorized(true)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setAutoCancel(true)
                .setVibrate(new long[]{0, 500, 250, 500, 250, 500});

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            b.setSound(alarmSound(), AudioManager.STREAM_ALARM);
        }

        PendingIntent contentPI = buildLaunchIntent(ctx);
        if (contentPI != null) {
            b.setContentIntent(contentPI);
        }

        b.addAction(0, "Done", actionIntent(ctx, "done", phase, 0L, 0, "", 14));

        nm.cancel(NOTIF_ID);
        try {
            nm.notify(ALARM_NOTIF_ID, b.build());
        } catch (Exception ignored) {
        }
    }

    public static void cancel(Context ctx) {
        NotificationManager nm =
                (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancel(NOTIF_ID);
            nm.cancel(ALARM_NOTIF_ID);
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

    private static PendingIntent actionIntent(
            Context ctx,
            String action,
            String phase,
            long endTime,
            int timeLeft,
            String taskName,
            int requestCode) {
        Intent intent = new Intent(ctx, FrogTimerActionReceiver.class);
        intent.setAction("io.frog.tasks.TIMER_ACTION_" + action);
        intent.putExtra(FrogTimerActionReceiver.EXTRA_ACTION, action);
        intent.putExtra(FrogTimerActionReceiver.EXTRA_PHASE, phase);
        intent.putExtra(FrogTimerActionReceiver.EXTRA_END_TIME, endTime);
        intent.putExtra(FrogTimerActionReceiver.EXTRA_TIME_LEFT, timeLeft);
        intent.putExtra(FrogTimerActionReceiver.EXTRA_TASK_NAME, taskName);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getBroadcast(ctx, requestCode, intent, flags);
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
