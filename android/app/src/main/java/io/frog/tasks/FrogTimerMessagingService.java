package io.frog.tasks;

import androidx.annotation.NonNull;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import io.capawesome.capacitorjs.plugins.firebase.messaging.FirebaseMessagingPlugin;

import java.util.Map;

/**
 * Replaces the @capacitor-firebase/messaging service so timer-control data
 * pushes from the server update the live notification natively — even when the
 * app is killed and no JS is running. Every other message is forwarded to the
 * Capacitor Firebase plugin unchanged, so regular push handling is preserved.
 *
 * The plugin's own MessagingService is removed in AndroidManifest.xml; this one
 * owns the MESSAGING_EVENT intent so delivery is deterministic.
 */
public class FrogTimerMessagingService extends FirebaseMessagingService {

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        FirebaseMessagingPlugin.onNewToken(token);
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        Map<String, String> data = remoteMessage.getData();
        if ("timer_control".equals(data.get("type"))) {
            handleTimerControl(data);
            return;
        }
        if ("timer_finished".equals(data.get("type"))) {
            String phase = data.get("phase");
            FrogTimerNotification.showAlarm(
                    getApplicationContext(), phase == null ? "focus" : phase);
            return;
        }

        FirebaseMessagingPlugin.onMessageReceived(remoteMessage);
    }

    private void handleTimerControl(Map<String, String> data) {
        String action = data.get("action");
        if ("stop".equals(action)) {
            FrogTimerNotification.cancel(getApplicationContext());
            return;
        }

        String phase = data.get("phase");
        boolean isRunning = !"pause".equals(action);
        long endTime = parseLong(data.get("endTime"));
        int timeLeft = (int) parseLong(data.get("timeLeft"));
        String taskName = data.get("taskName");

        FrogTimerNotification.show(
                getApplicationContext(),
                phase == null ? "focus" : phase,
                isRunning,
                endTime,
                timeLeft,
                taskName == null ? "" : taskName);
    }

    private long parseLong(String value) {
        if (value == null) {
            return 0L;
        }
        try {
            return Long.parseLong(value.trim());
        } catch (NumberFormatException e) {
            return 0L;
        }
    }
}
