package io.frog.tasks;

import androidx.annotation.NonNull;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import io.capawesome.capacitorjs.plugins.firebase.messaging.FirebaseMessagingPlugin;

import java.util.Map;

/**
 * Replaces the @capacitor-firebase/messaging service so timer-control data
 * pushes from the server update the live notification + native finish alarm
 * natively — even when the app is killed and no JS is running. Every other
 * message is forwarded to the Capacitor Firebase plugin unchanged.
 *
 * Pushes carry the timer's server revision; anything not newer than the last
 * applied rev is dropped, so two reordered pushes can't leave the
 * notification showing stale state.
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
            handleTimerFinished(data);
            return;
        }

        FirebaseMessagingPlugin.onMessageReceived(remoteMessage);
    }

    private void handleTimerControl(Map<String, String> data) {
        FrogTimerState state = FrogTimerState.load(getApplicationContext());
        long rev = parseLong(data.get("rev"));
        if (rev > 0 && state.active && rev <= state.rev) {
            return;
        }

        String action = data.get("action");
        if ("stop".equals(action)) {
            FrogTimerState.clear(getApplicationContext());
            FrogTimerAlarm.cancel(getApplicationContext());
            FrogAlarmSoundService.stop(getApplicationContext());
            FrogTimerNotification.cancel(getApplicationContext());
            return;
        }

        String phase = data.get("phase");
        state.phase = phase == null ? "focus" : phase;
        state.isRunning = !"pause".equals(action);
        state.endTime = parseLong(data.get("endTime"));
        state.timeLeft = (int) parseLong(data.get("timeLeft"));
        String taskName = data.get("taskName");
        state.taskName = taskName == null ? "" : taskName;
        state.fliesCaught = (int) parseLong(data.get("fliesCaught"));
        state.fliesPotential = (int) parseLong(data.get("fliesPotential"));
        state.deepFocus = "1".equals(data.get("deepFocus"));
        String sound = data.get("sound");
        if (sound != null && !sound.isEmpty()) {
            state.sound = sound;
        }
        if (rev > 0) {
            state.rev = rev;
        }
        state.active = true;
        state.save(getApplicationContext());

        // A state change from another surface also ends any local ringing.
        FrogAlarmSoundService.stop(getApplicationContext());
        FrogTimerAlarm.sync(
                getApplicationContext(),
                state.isRunning ? state.endTime : 0L);
        FrogTimerNotification.show(getApplicationContext(), state, false);
    }

    private void handleTimerFinished(Map<String, String> data) {
        // The local setAlarmClock normally rings first; this push is the
        // cross-device / fallback ring (e.g. alarm permission revoked).
        if (FrogAppState.isInForeground()) {
            return;
        }
        FrogTimerState state = FrogTimerState.load(getApplicationContext());
        String phase = data.get("phase");
        if (phase != null) {
            state.phase = phase;
        }
        String sound = data.get("sound");
        if (sound != null && !sound.isEmpty()) {
            state.sound = sound;
        }
        state.isRunning = false;
        state.save(getApplicationContext());
        FrogTimerAlarm.cancel(getApplicationContext());
        FrogTimerNotification.showAlarm(getApplicationContext(), state);
        FrogAlarmSoundService.start(getApplicationContext(), state.sound);
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
