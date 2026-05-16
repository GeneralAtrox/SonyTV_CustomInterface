package com.svjkr.sonytvlauncher;

import android.Manifest;
import android.app.Activity;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;

public class VisualizerActivity extends Activity {
    private static final String TAG = "BRAVIAVisualizer";
    private static final int REQUEST_RECORD_AUDIO = 42;
    private static final String PREFS_NAME = "launcher_preferences";
    private static final String PREF_VISUALIZER_ENGINE = "visualizer_engine";
    private static final String ENGINE_LEGACY = "legacy";
    private static final String ENGINE_BUTTERCHURN = "butterchurn";
    private static final String ENGINE_PROJECTM = "projectm";

    private WinampVisualizerView legacyVisualizerView;
    private ButterchurnVisualizerHost butterchurnHost;
    private int legacySelectionIndex;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );

        if (ENGINE_BUTTERCHURN.equals(requestedEngine())
                && !ButterchurnVisualizerHost.isDisabledForProcess()) {
            butterchurnHost = new ButterchurnVisualizerHost(this);
            setContentView(butterchurnHost);
            butterchurnHost.start();
        } else {
            showLegacyVisualizer();
        }

        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQUEST_RECORD_AUDIO);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (butterchurnHost != null) {
            butterchurnHost.resume();
        }
        if (legacyVisualizerView != null) {
            legacyVisualizerView.setRunning(true);
        }
    }

    @Override
    protected void onPause() {
        if (butterchurnHost != null) {
            butterchurnHost.pause();
        }
        if (legacyVisualizerView != null) {
            legacyVisualizerView.setRunning(false);
        }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (butterchurnHost != null) {
            butterchurnHost.destroy();
            butterchurnHost = null;
        }
        if (legacyVisualizerView != null) {
            legacyVisualizerView.setRunning(false);
            legacyVisualizerView = null;
        }
        super.onDestroy();
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode,
            String[] permissions,
            int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_RECORD_AUDIO && butterchurnHost != null) {
            butterchurnHost.onRecordAudioPermissionChanged();
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event != null
                && event.getAction() == KeyEvent.ACTION_DOWN
                && isPresetSelectionKey(event.getKeyCode())) {
            if (event.getRepeatCount() > 0) {
                return true;
            }
            selectVisualizerPreset(event.getKeyCode());
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK
                || keyCode == KeyEvent.KEYCODE_DPAD_CENTER
                || keyCode == KeyEvent.KEYCODE_ENTER) {
            finish();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    private String requestedEngine() {
        String defaultEngine = isDebugBuild() ? ENGINE_BUTTERCHURN : ENGINE_LEGACY;
        String engine = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                .getString(PREF_VISUALIZER_ENGINE, defaultEngine);
        if (ENGINE_PROJECTM.equals(engine)) {
            Log.i(TAG, "projectm engine requested before native support exists; using legacy");
            return ENGINE_LEGACY;
        }
        if (ENGINE_BUTTERCHURN.equals(engine) || ENGINE_LEGACY.equals(engine)) {
            return engine;
        }
        return defaultEngine;
    }

    private boolean isDebugBuild() {
        return (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    private void showLegacyVisualizer() {
        legacyVisualizerView = new WinampVisualizerView(this);
        legacyVisualizerView.setSignal("preview", true, 0);
        setContentView(legacyVisualizerView);
    }

    private boolean isPresetSelectionKey(int keyCode) {
        return keyCode == KeyEvent.KEYCODE_DPAD_UP
                || keyCode == KeyEvent.KEYCODE_DPAD_DOWN
                || keyCode == KeyEvent.KEYCODE_DPAD_LEFT
                || keyCode == KeyEvent.KEYCODE_DPAD_RIGHT;
    }

    private void selectVisualizerPreset(int keyCode) {
        String direction;
        if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT) {
            direction = "previous";
        } else if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) {
            direction = "next";
        } else {
            direction = "random";
        }

        if (butterchurnHost != null && butterchurnHost.selectPreset(direction)) {
            return;
        }

        if (legacyVisualizerView != null) {
            if ("previous".equals(direction)) {
                legacySelectionIndex--;
            } else if ("next".equals(direction)) {
                legacySelectionIndex++;
            } else {
                legacySelectionIndex = (int) (System.currentTimeMillis() % Integer.MAX_VALUE);
            }
            legacyVisualizerView.setSignal("legacy-" + legacySelectionIndex, true, 0);
        }
    }
}
