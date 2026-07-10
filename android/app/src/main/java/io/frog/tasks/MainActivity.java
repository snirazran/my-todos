package io.frog.tasks;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    public static final String PUSH_CHANNEL_ID = "push_default";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FrogTimerPlugin.class);
        super.onCreate(savedInstanceState);
        createBadgelessChannels();
    }

    @Override
    public void onResume() {
        super.onResume();
        FrogAppState.setInForeground(true);
    }

    @Override
    public void onPause() {
        FrogAppState.setInForeground(false);
        super.onPause();
    }

    /**
     * Pre-creates the notification channels that plugins/Firebase would
     * otherwise create with launcher badges enabled. Channel behaviors are
     * locked in at creation, so registering them first (with badges off) is
     * the only way to keep numbers off the app icon.
     */
    private void createBadgelessChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) {
            return;
        }
        if (nm.getNotificationChannel("default") == null) {
            NotificationChannel ch = new NotificationChannel(
                    "default",
                    "Default",
                    NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("Default");
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        if (nm.getNotificationChannel(PUSH_CHANNEL_ID) == null) {
            NotificationChannel ch = new NotificationChannel(
                    PUSH_CHANNEL_ID,
                    "Updates & reminders",
                    NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("Messages from Frogress");
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
    }
}
