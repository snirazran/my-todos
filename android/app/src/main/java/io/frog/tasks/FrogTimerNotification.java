package io.frog.tasks;

import android.app.Notification;
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
 * equivalent of the iOS Live Activity). Used by {@link FrogTimerPlugin}
 * (foreground, JS-driven), {@link FrogTimerMessagingService} (background /
 * killed, driven by a data push from the server), {@link FrogTimerAlarmReceiver}
 * and {@link FrogBootReceiver}, so a state change made anywhere renders the
 * same notification regardless of which path posts it.
 *
 * Carries the hunt: flies caught / reachable this session and the deep-focus
 * +1 pledge, mirroring the in-app chip. On Android 16+ the live notification
 * requests promoted-ongoing status (status-bar chip / lock-screen prominence).
 */
public final class FrogTimerNotification {
    public static final String CHANNEL_ID = "frogodoro_live_timer";
    public static final int NOTIF_ID = 770001;
    public static final String ALARM_CHANNEL_ID = "frogodoro_alarm_v2";
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

    private static String huntText(FrogTimerState s) {
        if (!"focus".equals(s.phase) || s.fliesPotential <= 0) return null;
        String text = "🪰 " + s.fliesCaught + "/" + s.fliesPotential;
        if (s.deepFocus) text += " · ⚡+1";
        return text;
    }

    public static void show(Context ctx, FrogTimerState s, boolean pauseArmed) {
        NotificationManager nm =
                (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) {
            return;
        }
        ensureChannel(nm);

        boolean isFocus = !"break".equals(s.phase);
        String label = isFocus ? "Focus" : "Break";
        int color = isFocus ? Color.parseColor("#16a34a") : Color.parseColor("#0ea5e9");

        String title = label;
        if (s.taskName != null && !s.taskName.isEmpty()) {
            title = label + " · " + s.taskName;
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

        String hunt = huntText(s);
        if (hunt != null) {
            b.setSubText(hunt);
        }

        // Android 16+ promoted ongoing (status-bar chip, AOD). Reflection so
        // the code builds against older androidx.core too.
        requestPromotedOngoing(b);

        PendingIntent contentPI = buildLaunchIntent(ctx);
        if (contentPI != null) {
            b.setContentIntent(contentPI);
        }

        if (s.isRunning && s.endTime > 0) {
            b.setUsesChronometer(true);
            b.setShowWhen(true);
            b.setWhen(s.endTime);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                b.setChronometerCountDown(true);
            }
            b.setContentText(
                    pauseArmed
                            ? "Pausing loses the ⚡+1 fly — tap Pause again"
                            : label + " in progress");
        } else {
            b.setUsesChronometer(false);
            b.setShowWhen(false);
            int m = s.timeLeft / 60;
            int sec = s.timeLeft % 60;
            b.setContentText(String.format("Paused · %d:%02d left", m, sec));
        }

        if (s.isRunning) {
            b.addAction(0, pauseArmed ? "Pause anyway" : "Pause", actionIntent(ctx, "pause", 11));
        } else {
            b.addAction(0, "Resume", actionIntent(ctx, "resume", 12));
        }
        b.addAction(0, "Stop", actionIntent(ctx, "stop", 13));

        nm.cancel(ALARM_NOTIF_ID);
        try {
            nm.notify(NOTIF_ID, b.build());
        } catch (Exception ignored) {
        }
    }

    private static void requestPromotedOngoing(NotificationCompat.Builder b) {
        try {
            b.getClass()
                    .getMethod("setRequestPromotedOngoing", boolean.class)
                    .invoke(b, true);
        } catch (Throwable ignored) {
            // androidx.core < 1.17 or OS < 16 — plain ongoing notification.
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
                // The looping ring comes from FrogAlarmSoundService (user's
                // chosen sound on the ALARM stream); the channel itself stays
                // silent so the two never overlap.
                ch.setSound(null, null);
                nm.createNotificationChannel(ch);
            }
        }
    }

    /** The ringing notification — also used by the sound service's startForeground. */
    public static Notification buildAlarm(Context ctx, FrogTimerState s) {
        boolean isFocus = !"break".equals(s.phase);
        String title = isFocus ? "Focus finished" : "Break finished";
        String body;
        if (isFocus && s.fliesCaught > 0) {
            body = s.fliesCaught == 1
                    ? "1 fly caught — tap Done to collect."
                    : s.fliesCaught + " flies caught — tap Done to collect.";
        } else {
            body = isFocus
                    ? "Time for a break. You earned it!"
                    : "Ready to focus whenever you are.";
        }
        int color = isFocus ? Color.parseColor("#16a34a") : Color.parseColor("#0ea5e9");

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, ALARM_CHANNEL_ID)
                .setSmallIcon(resolveSmallIcon(ctx))
                .setColor(color)
                .setColorized(true)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setAutoCancel(false)
                .setOngoing(true)
                .setVibrate(new long[]{0, 500, 250, 500, 250, 500});

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            b.setSound(alarmSound(), AudioManager.STREAM_ALARM);
        }

        PendingIntent contentPI = buildLaunchIntent(ctx);
        if (contentPI != null) {
            b.setContentIntent(contentPI);
            // Real alarm behaviour: light the screen / show over the lock
            // screen while ringing (alarm-category apps hold this right).
            b.setFullScreenIntent(contentPI, true);
        }

        if (isFocus) {
            b.addAction(0, "+5 more", actionIntent(ctx, "more5", 15));
        }
        b.addAction(0, "Done", actionIntent(ctx, "done", 14));
        return b.build();
    }

    public static void showAlarm(Context ctx, FrogTimerState s) {
        NotificationManager nm =
                (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) {
            return;
        }
        ensureAlarmChannel(nm);
        nm.cancel(NOTIF_ID);
        try {
            nm.notify(ALARM_NOTIF_ID, buildAlarm(ctx, s));
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

    private static PendingIntent actionIntent(Context ctx, String action, int requestCode) {
        Intent intent = new Intent(ctx, FrogTimerActionReceiver.class);
        intent.setAction("io.frog.tasks.TIMER_ACTION_" + action);
        intent.putExtra(FrogTimerActionReceiver.EXTRA_ACTION, action);
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
