package io.frog.tasks;

import android.app.Activity;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextUtils;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;

/**
 * The whole point of the widget: catching a task before it slips your mind.
 *
 * This is a native dialog, not the webview. The app loads frogress.com over the
 * network, so routing a capture through it would mean watching a splash screen
 * for a second or two — long enough that people go back to not writing things
 * down. Here the keyboard is up immediately, the text lands in SharedPreferences,
 * and the webview replays it through the normal task endpoints next time it runs
 * (see FrogWidgetStore and src/lib/widget/sync.ts). Fly caps, the ledger and
 * quest counters all stay on their usual path.
 */
public class FrogQuickAddActivity extends Activity {

    private EditText input;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        setContentView(R.layout.frog_quick_add);

        Window window = getWindow();
        if (window != null) {
            window.setSoftInputMode(
                    WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE
                            | WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        }

        input = findViewById(R.id.quick_add_input);
        input.setOnEditorActionListener((v, actionId, event) -> {
            boolean isDone = actionId == EditorInfo.IME_ACTION_DONE
                    || actionId == EditorInfo.IME_ACTION_GO
                    || (event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER);
            if (isDone) {
                save();
                return true;
            }
            return false;
        });
        input.requestFocus();

        View save = findViewById(R.id.quick_add_save);
        save.setOnClickListener(v -> save());

        View cancel = findViewById(R.id.quick_add_cancel);
        cancel.setOnClickListener(v -> finish());

        TextView title = findViewById(R.id.quick_add_title);
        title.setText(R.string.widget_quick_add_title);
    }

    private void save() {
        Editable editable = input.getText();
        String text = editable == null ? "" : editable.toString().trim();
        if (TextUtils.isEmpty(text)) {
            finish();
            return;
        }
        if (text.length() > 200) {
            text = text.substring(0, 200);
        }
        FrogWidgetStore.queueAdd(getApplicationContext(), text);
        FrogWidgetStore.applyLocalAdd(getApplicationContext(), text);
        FrogWidgetProvider.refreshAll(getApplicationContext());
        Toast.makeText(this, R.string.widget_quick_add_saved, Toast.LENGTH_SHORT).show();
        finish();
    }

    @Override
    public void finish() {
        super.finish();
        overridePendingTransition(0, 0);
    }
}
