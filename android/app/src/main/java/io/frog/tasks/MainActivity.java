package io.frog.tasks;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FrogTimerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
