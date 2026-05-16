package com.svjkr.sonytvlauncher;

import android.service.dreams.DreamService;
import android.view.View;

public class WinampDreamService extends DreamService {
    private WinampVisualizerView visualizerView;

    @Override
    public void onAttachedToWindow() {
        super.onAttachedToWindow();
        setInteractive(false);
        setFullscreen(true);
        setScreenBright(true);

        visualizerView = new WinampVisualizerView(this);
        visualizerView.setSignal("dream", true, 0);
        setContentView(visualizerView);
    }

    @Override
    public void onDreamingStarted() {
        super.onDreamingStarted();
        if (visualizerView != null) {
            visualizerView.setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            );
            visualizerView.setRunning(true);
        }
    }

    @Override
    public void onDreamingStopped() {
        if (visualizerView != null) {
            visualizerView.setRunning(false);
        }
        super.onDreamingStopped();
    }

    @Override
    public void onDetachedFromWindow() {
        if (visualizerView != null) {
            visualizerView.setRunning(false);
        }
        super.onDetachedFromWindow();
    }
}
