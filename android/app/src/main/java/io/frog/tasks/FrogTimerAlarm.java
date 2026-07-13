package io.frog.tasks;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/**
 * The finish alarm, scheduled natively with {@link AlarmManager#setAlarmClock}
 * so it fires exactly at the phase's end — through Doze, with the app killed,
 * with no network. FCM pushes only reconcile it; they are never the thing
 * that rings.
 */
public final class FrogTimerAlarm {
    private static final int REQUEST_CODE = 771001;

    private FrogTimerAlarm() {}

    /** Schedule (or move) the alarm to endTime (epoch ms); past/0 cancels. */
    public static void sync(Context ctx, long endTimeMs) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent pi = pendingIntent(ctx);
        am.cancel(pi);
        if (endTimeMs <= System.currentTimeMillis() + 1000) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms()) {
            // USE_EXACT_ALARM should grant this for a timer app; if revoked,
            // the FCM finished-push remains the fallback ring.
            return;
        }
        AlarmManager.AlarmClockInfo info =
                new AlarmManager.AlarmClockInfo(endTimeMs, launchIntent(ctx));
        am.setAlarmClock(info, pi);
    }

    public static void cancel(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null) {
            am.cancel(pendingIntent(ctx));
        }
    }

    private static PendingIntent pendingIntent(Context ctx) {
        Intent intent = new Intent(ctx, FrogTimerAlarmReceiver.class);
        intent.setAction("io.frog.tasks.TIMER_ALARM_FIRE");
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getBroadcast(ctx, REQUEST_CODE, intent, flags);
    }

    private static PendingIntent launchIntent(Context ctx) {
        Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getActivity(ctx, REQUEST_CODE + 1, launch, flags);
    }
}
