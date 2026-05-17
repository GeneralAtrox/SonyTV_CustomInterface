package com.svjkr.sonytvlauncher;

import android.Manifest;
import android.app.Activity;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;

import java.util.Locale;

public class VisualizerActivity extends Activity {
    private static final String TAG = "BRAVIAVisualizer";
    private static final int REQUEST_RECORD_AUDIO = 42;
    private static final String PREFS_NAME = "launcher_preferences";
    private static final String PREF_VISUALIZER_ENGINE = "visualizer_engine";
    private static final String DEBUG_RENDER_SCALE_SETTING = "bravia_visualizer_render_scale";
    private static final String ENGINE_LEGACY = "legacy";
    private static final String ENGINE_BUTTERCHURN = "butterchurn";
    private static final String ENGINE_TUNNEL_3D = "tunnel3d";
    private static final String ENGINE_PROJECTM = "projectm";
    private static final String TUNNEL_START_URL = "https://bravia.visualizer.local/visualizer/tunnel.html";

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

        String engine = requestedEngine();
        if (ENGINE_TUNNEL_3D.equals(engine)
                && !ButterchurnVisualizerHost.isDisabledForProcess()) {
            butterchurnHost = new ButterchurnVisualizerHost(this, tunnelStartUrl(), ENGINE_TUNNEL_3D);
            setContentView(butterchurnHost);
            butterchurnHost.start();
        } else if (ENGINE_BUTTERCHURN.equals(engine)
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
                && event.getAction() == KeyEvent.ACTION_DOWN) {
            if (isPauseToggleKey(event.getKeyCode())) {
                if (event.getRepeatCount() > 0) {
                    return true;
                }
                toggleVisualizerPaused();
                return true;
            }
            if (isPresetSelectionKey(event.getKeyCode())) {
                if (event.getRepeatCount() > 0) {
                    return true;
                }
                selectVisualizerPreset(event.getKeyCode());
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            finish();
            return true;
        }
        if (keyCode == KeyEvent.KEYCODE_DPAD_CENTER
                || keyCode == KeyEvent.KEYCODE_ENTER) {
            toggleVisualizerPaused();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    private String requestedEngine() {
        String defaultEngine = isDebugBuild() ? ENGINE_TUNNEL_3D : ENGINE_LEGACY;
        String engine = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                .getString(PREF_VISUALIZER_ENGINE, defaultEngine);
        if (ENGINE_PROJECTM.equals(engine)) {
            Log.i(TAG, "projectm engine requested before native support exists; using legacy");
            return ENGINE_LEGACY;
        }
        if (ENGINE_TUNNEL_3D.equals(engine)
                || ENGINE_BUTTERCHURN.equals(engine)
                || ENGINE_LEGACY.equals(engine)) {
            return engine;
        }
        return defaultEngine;
    }

    private boolean isDebugBuild() {
        return (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    private String tunnelStartUrl() {
        float renderScale = requestedRenderScale();
        if (renderScale <= 0f) {
            return TUNNEL_START_URL;
        }
        return TUNNEL_START_URL + String.format(Locale.US, "?renderScale=%.2f", renderScale);
    }

    private float requestedRenderScale() {
        if (!isDebugBuild()) {
            return 0f;
        }
        try {
            float scale = Settings.Global.getFloat(
                    getContentResolver(),
                    DEBUG_RENDER_SCALE_SETTING,
                    0f
            );
            if (scale <= 0f) {
                return 0f;
            }
            return Math.max(0.5f, Math.min(2f, scale));
        } catch (Exception exception) {
            Log.w(TAG, "Ignoring render scale override", exception);
            return 0f;
        }
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

    private boolean isPauseToggleKey(int keyCode) {
        return keyCode == KeyEvent.KEYCODE_DPAD_CENTER
                || keyCode == KeyEvent.KEYCODE_ENTER;
    }

    private void toggleVisualizerPaused() {
        if (butterchurnHost != null && butterchurnHost.togglePaused()) {
            return;
        }
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
