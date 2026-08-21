package io.frog.tasks;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Fires when the launcher actually places the widget after requestPinAppWidget.
 * Painting it immediately means the user's first sight of it has their real
 * tasks in it, not the preview.
 */
public class FrogWidgetPinnedReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        FrogWidgetProvider.refreshAll(context);
    }
}
