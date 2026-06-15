package io.frog.tasks;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Android equivalent of the iOS Live Activity: an ongoing notification with a
 * live chronometer that counts the Frogodoro focus/break timer down to its end
 * time. SystemUI ticks the chronometer itself, so it keeps counting even when
 * the app is backgrounded or killed — no foreground service required.
 *
 * The timer-end *alert* is handled separately by the scheduled local
 * notification; this notification is purely the live counter.
 */
@CapacitorPlugin(name = "FrogTimer")
public class FrogTimerPlugin extends Plugin {
    private static final String CHANNEL_ID = "frogodoro_live_timer";
    private static final int NOTIF_ID = 770001;

    private void ensureChannel(NotificationManager nm) {
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
        Context ctx = getContext();
        NotificationManager nm =
                (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancel(NOTIF_ID);
        }
        call.resolve();
    }

    private void showOrUpdate(PluginCall call) {
        Context ctx = getContext();
        NotificationManager nm =
                (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) {
            call.resolve();
            return;
        }
        ensureChannel(nm);

        String phase = call.getString("phase", "focus");
        boolean isRunning = Boolean.TRUE.equals(call.getBoolean("isRunning", false));
        Double endTimeD = call.getDouble("endTime", 0.0);
        long endTime = endTimeD == null ? 0L : endTimeD.longValue();
        Integer timeLeftI = call.getInt("timeLeft", 0);
        int timeLeft = timeLeftI == null ? 0 : timeLeftI;
        String taskName = call.getString("taskName", "");

        boolean isFocus = "focus".equals(phase);
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
            // Live, self-ticking countdown to endTime.
            b.setUsesChronometer(true);
            b.setShowWhen(true);
            b.setWhen(endTime);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                b.setChronometerCountDown(true);
            }
            b.setContentText(label + " in progress");
        } else {
            // Paused — show a static remaining time.
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
        call.resolve();
    }

    private PendingIntent buildLaunchIntent(Context ctx) {
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

    private int resolveSmallIcon(Context ctx) {
        int id = ctx.getResources().getIdentifier("ic_notification", "drawable", ctx.getPackageName());
        if (id != 0) {
            return id;
        }
        id = ctx.getResources().getIdentifier("ic_launcher", "mipmap", ctx.getPackageName());
        return id != 0 ? id : android.R.drawable.ic_dialog_info;
    }
}
