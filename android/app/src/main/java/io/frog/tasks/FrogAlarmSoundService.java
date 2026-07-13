package io.frog.tasks;

import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.IBinder;

/**
 * Loops the user's chosen alarm sound on the ALARM stream until the user
 * acknowledges the finished session (Done / open app) — the Android
 * equivalent of a real alarm-clock ring. Started by the alarm receiver /
 * finished-push; stopped by the Done action, any timer state change, or a
 * 2-minute safety timeout.
 */
public class FrogAlarmSoundService extends Service {
    public static final String ACTION_START = "io.frog.tasks.ALARM_SOUND_START";
    public static final String ACTION_STOP = "io.frog.tasks.ALARM_SOUND_STOP";
    public static final String EXTRA_SOUND = "sound";
    private static final long TIMEOUT_MS = 2 * 60 * 1000L;

    private MediaPlayer player;
    private final android.os.Handler handler = new android.os.Handler(android.os.Looper.getMainLooper());
    private final Runnable timeout = this::stopSelf;

    public static void start(Context ctx, String sound) {
        Intent i = new Intent(ctx, FrogAlarmSoundService.class);
        i.setAction(ACTION_START);
        i.putExtra(EXTRA_SOUND, sound);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(i);
            } else {
                ctx.startService(i);
            }
        } catch (Exception ignored) {
        }
    }

    public static void stop(Context ctx) {
        try {
            Intent i = new Intent(ctx, FrogAlarmSoundService.class);
            i.setAction(ACTION_STOP);
            ctx.startService(i);
        } catch (Exception ignored) {
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_STOP.equals(action)) {
            stopSelf();
            return START_NOT_STICKY;
        }

        // The alarm notification (ALARM_NOTIF_ID) is already showing; attach to
        // it so the service is legally foreground while it rings.
        try {
            startForeground(
                    FrogTimerNotification.ALARM_NOTIF_ID,
                    FrogTimerNotification.buildAlarm(this, FrogTimerState.load(this)));
        } catch (Exception ignored) {
        }

        String sound = intent != null ? intent.getStringExtra(EXTRA_SOUND) : null;
        playLoop(resolveRes(sound));
        handler.removeCallbacks(timeout);
        handler.postDelayed(timeout, TIMEOUT_MS);
        return START_NOT_STICKY;
    }

    private int resolveRes(String sound) {
        String id = sound == null ? "" : sound;
        String res;
        switch (id) {
            case "frog": res = "alarm_frog"; break;
            case "classic": res = "alarm_classic"; break;
            case "lofi": res = "alarm_lofi"; break;
            case "stardust": res = "alarm_stardust"; break;
            case "none": return 0;
            default: res = "alarm_dreamscape"; break;
        }
        return getResources().getIdentifier(res, "raw", getPackageName());
    }

    private void playLoop(int resId) {
        stopPlayer();
        if (resId == 0) return;
        try {
            player = MediaPlayer.create(
                    this,
                    resId,
                    new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ALARM)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build(),
                    0);
            if (player == null) return;
            player.setLooping(true);
            player.start();
        } catch (Exception ignored) {
        }
    }

    private void stopPlayer() {
        if (player != null) {
            try {
                player.stop();
                player.release();
            } catch (Exception ignored) {
            }
            player = null;
        }
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(timeout);
        stopPlayer();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
