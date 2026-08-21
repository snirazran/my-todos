package io.frog.tasks;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridge between the webview and the home screen widget. The webview pushes a
 * snapshot of today; the widget pushes back anything the user did while the app
 * was closed. See {@link FrogWidgetStore} for the contract.
 */
@CapacitorPlugin(name = "FrogWidget")
public class FrogWidgetPlugin extends Plugin {

    @PluginMethod
    public void setState(PluginCall call) {
        String payload = call.getString("payload");
        if (payload == null) {
            call.reject("payload is required");
            return;
        }
        FrogWidgetStore.setState(getContext(), payload);
        FrogWidgetProvider.refreshAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        FrogWidgetStore.clearState(getContext());
        FrogWidgetProvider.refreshAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void drainQueue(PluginCall call) {
        JSObject result = new JSObject();
        result.put("actions", FrogWidgetStore.drainQueue(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void getPinState(PluginCall call) {
        JSObject result = new JSObject();
        result.put("state", pinState(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void requestPin(PluginCall call) {
        Context context = getContext();
        JSObject result = new JSObject();

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            result.put("requested", false);
            call.resolve(result);
            return;
        }

        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        if (!manager.isRequestPinAppWidgetSupported()) {
            result.put("requested", false);
            call.resolve(result);
            return;
        }

        ComponentName provider = new ComponentName(context, FrogWidgetProvider.class);
        // The launcher fires this back once the widget is actually placed, which
        // is the only trustworthy "they added it" signal we get.
        Intent placed = new Intent(context, FrogWidgetPinnedReceiver.class);
        PendingIntent callback = PendingIntent.getBroadcast(
                context, 0, placed,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        boolean requested = manager.requestPinAppWidget(provider, null, callback);
        result.put("requested", requested);
        call.resolve(result);
    }

    private static String pinState(Context context) {
        if (FrogWidgetProvider.isPinned(context)) return "pinned";
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return "unsupported";
        return AppWidgetManager.getInstance(context).isRequestPinAppWidgetSupported()
                ? "available"
                : "unsupported";
    }
}
