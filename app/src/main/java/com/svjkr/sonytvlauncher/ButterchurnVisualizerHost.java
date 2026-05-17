package com.svjkr.sonytvlauncher;

import android.Manifest;
import android.app.ActivityManager;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.audiofx.Visualizer;
import android.net.Uri;
import android.os.Debug;
import android.os.Handler;
import android.os.Looper;
import android.os.Process;
import android.util.Base64;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class ButterchurnVisualizerHost extends FrameLayout {
    private static final String TAG = "BRAVIAVisualizer";
    private static final String LOCAL_SCHEME = "https";
    private static final String LOCAL_HOST = "bravia.visualizer.local";
    private static final String DEFAULT_START_URL = "https://bravia.visualizer.local/visualizer/index.html";
    private static final String DEFAULT_ENGINE_NAME = "butterchurn";
    private static final int AUDIO_PUSH_INTERVAL_MS = 33;
    private static final int MEMORY_LOG_INTERVAL_MS = 5000;
    private static final int MAX_AUDIO_FRAME_BYTES = 4096;
    private static final long LOW_RMS_SYNTHETIC_AFTER_MS = 10000;
    private static final double NON_TRIVIAL_RMS = 0.020;
    private static boolean disabledForProcess;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Object audioLock = new Object();
    private final ActivityManager activityManager;
    private final String startUrl;
    private final String engineName;
    private final Runnable audioPushRunnable = new Runnable() {
        @Override
        public void run() {
            pushAudioFrame();
        }
    };
    private final Runnable memoryLogRunnable = new Runnable() {
        @Override
        public void run() {
            logMemoryMetric();
            if (running && !destroyed) {
                mainHandler.postDelayed(this, MEMORY_LOG_INTERVAL_MS);
            }
        }
    };

    private WebView webView;
    private WinampVisualizerView fallbackView;
    private Visualizer visualizer;
    private byte[] latestWaveform;
    private long latestAudioTimestampMs;
    private long lowRmsStartedMs = -1;
    private long lastAudioDelayLogMs;
    private int nonTrivialFrameCount;
    private int baselinePssKb = -1;
    private int peakPssDeltaKb;
    private boolean running;
    private boolean loaded;
    private boolean jsReady;
    private boolean destroyed;
    private boolean usingSynthetic = true;
    private boolean missingMetadataLogged;

    public ButterchurnVisualizerHost(Context context) {
        this(context, DEFAULT_START_URL, DEFAULT_ENGINE_NAME);
    }

    public ButterchurnVisualizerHost(Context context, String startUrl, String engineName) {
        super(context);
        setBackgroundColor(Color.BLACK);
        setClipChildren(false);
        setClipToPadding(false);
        this.startUrl = startUrl;
        this.engineName = engineName;
        activityManager = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
    }

    public static boolean isDisabledForProcess() {
        return disabledForProcess;
    }

    public void start() {
        if (destroyed) {
            return;
        }
        running = true;
        if (disabledForProcess) {
            fallbackToLegacy("process_disabled", false);
            return;
        }

        try {
            ensureWebView();
            WebView.setWebContentsDebuggingEnabled(isDebugBuild());
            webView.onResume();
            if (!loaded) {
                loaded = true;
                logEvent("engine_select", engineName);
                webView.loadUrl(startUrl);
            }
            startAudioCaptureOrSynthetic();
            startMemoryLogging();
            scheduleAudioPush();
        } catch (RuntimeException exception) {
            Log.e(TAG, "Butterchurn start failed", exception);
            fallbackToLegacy("start_exception:" + sanitize(exception.getMessage()), true);
        }
    }

    public void resume() {
        if (destroyed) {
            return;
        }
        if (running && (webView != null || fallbackView != null)) {
            return;
        }
        running = true;
        if (fallbackView != null) {
            fallbackView.setRunning(true);
            return;
        }
        if (webView == null) {
            start();
            return;
        }
        if (webView != null) {
            webView.onResume();
        }
        startAudioCaptureOrSynthetic();
        startMemoryLogging();
        scheduleAudioPush();
    }

    public void pause() {
        running = false;
        mainHandler.removeCallbacks(audioPushRunnable);
        mainHandler.removeCallbacks(memoryLogRunnable);
        stopAudioCapture();
        if (webView != null) {
            webView.onPause();
        }
        if (fallbackView != null) {
            fallbackView.setRunning(false);
        }
    }

    public void stop() {
        pause();
    }

    public void destroy() {
        destroyed = true;
        pause();
        removeAllViews();
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidVisualizer");
            webView.destroy();
            webView = null;
        }
        fallbackView = null;
        latestWaveform = null;
        jsReady = false;
        loaded = false;
    }

    public void onRecordAudioPermissionChanged() {
        if (running && fallbackView == null) {
            startAudioCaptureOrSynthetic();
            scheduleAudioPush();
        }
    }

    public boolean selectPreset(String direction) {
        if (destroyed || webView == null || fallbackView != null || !jsReady) {
            return false;
        }
        if (!"previous".equals(direction)
                && !"next".equals(direction)
                && !"random".equals(direction)) {
            return false;
        }
        logEvent("visualizer_preset_select", direction);
        webView.evaluateJavascript(
                "window.braviaVisualizer&&window.braviaVisualizer.selectPreset('"
                        + direction
                        + "');",
                null
        );
        return true;
    }

    public boolean togglePaused() {
        if (destroyed || webView == null || fallbackView != null || !jsReady) {
            return false;
        }
        logEvent("visualizer_pause_toggle", "center");
        webView.evaluateJavascript(
                "window.braviaVisualizer&&window.braviaVisualizer.togglePaused&&window.braviaVisualizer.togglePaused();",
                null
        );
        return true;
    }

    private void ensureWebView() {
        if (webView != null) {
            return;
        }

        webView = new WebView(getContext());
        webView.setBackgroundColor(Color.BLACK);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
        webView.addJavascriptInterface(new Bridge(), "AndroidVisualizer");
        configureWebSettings(webView.getSettings());
        webView.setWebViewClient(new LocalAssetClient());
        addView(webView, new LayoutParams(
                LayoutParams.MATCH_PARENT,
                LayoutParams.MATCH_PARENT
        ));
    }

    private void configureWebSettings(WebSettings settings) {
        settings.setJavaScriptEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setDomStorageEnabled(false);
        settings.setDatabaseEnabled(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
    }

    private void startAudioCaptureOrSynthetic() {
        if (visualizer != null) {
            return;
        }
        if (!missingMetadataLogged) {
            logEvent("visualizer_metadata", "unavailable_rms_only_fallback");
            missingMetadataLogged = true;
        }
        if (getContext().checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            setSyntheticMode("missing_record_audio_permission");
            return;
        }

        try {
            visualizer = new Visualizer(0);
            int[] range = Visualizer.getCaptureSizeRange();
            visualizer.setCaptureSize(range[1]);
            visualizer.setDataCaptureListener(new Visualizer.OnDataCaptureListener() {
                @Override
                public void onWaveFormDataCapture(Visualizer visualizer, byte[] waveform, int samplingRate) {
                    handleWaveform(waveform);
                }

                @Override
                public void onFftDataCapture(Visualizer visualizer, byte[] fft, int samplingRate) {
                    // Butterchurn only needs time-domain samples; it computes FFT internally.
                }
            }, Visualizer.getMaxCaptureRate() / 2, true, false);
            visualizer.setEnabled(true);
        } catch (RuntimeException exception) {
            Log.w(TAG, "Unable to start Android Visualizer capture", exception);
            stopAudioCapture();
            setSyntheticMode("visualizer_init_failed:" + sanitize(exception.getMessage()));
        }
    }

    private void handleWaveform(byte[] waveform) {
        if (waveform == null || waveform.length == 0) {
            return;
        }

        byte[] copy = waveform.length > MAX_AUDIO_FRAME_BYTES
                ? trimWaveform(waveform)
                : waveform.clone();
        long now = System.currentTimeMillis();
        double rms = rms(copy);
        synchronized (audioLock) {
            latestWaveform = copy;
            latestAudioTimestampMs = now;
        }

        if (rms < NON_TRIVIAL_RMS) {
            nonTrivialFrameCount = 0;
            if (lowRmsStartedMs < 0) {
                lowRmsStartedMs = now;
            } else if (now - lowRmsStartedMs >= LOW_RMS_SYNTHETIC_AFTER_MS) {
                setSyntheticMode("low_rms_10s");
            }
            return;
        }

        lowRmsStartedMs = -1;
        nonTrivialFrameCount++;
        if (usingSynthetic && nonTrivialFrameCount >= 2) {
            usingSynthetic = false;
            logEvent("visualizer_audio_mode", "real");
        }
    }

    private byte[] trimWaveform(byte[] waveform) {
        byte[] trimmed = new byte[MAX_AUDIO_FRAME_BYTES];
        for (int index = 0; index < trimmed.length; index++) {
            int sourceIndex = Math.min(waveform.length - 1,
                    Math.round(index * (waveform.length - 1f) / Math.max(1, trimmed.length - 1)));
            trimmed[index] = waveform[sourceIndex];
        }
        return trimmed;
    }

    private double rms(byte[] waveform) {
        long sum = 0;
        for (byte value : waveform) {
            int sample = (value & 0xFF) - 128;
            sum += (long) sample * sample;
        }
        return Math.sqrt(sum / (double) waveform.length) / 128.0;
    }

    private void setSyntheticMode(String reason) {
        if (!usingSynthetic) {
            usingSynthetic = true;
            nonTrivialFrameCount = 0;
            logEvent("visualizer_audio_mode", "synthetic:" + reason);
        } else {
            logEvent("visualizer_audio_mode", "synthetic_ready:" + reason);
        }
    }

    private void stopAudioCapture() {
        if (visualizer == null) {
            return;
        }
        try {
            visualizer.setEnabled(false);
            visualizer.release();
        } catch (RuntimeException ignored) {
            // Audio sessions can disappear while callbacks are still being drained.
        }
        visualizer = null;
    }

    private void scheduleAudioPush() {
        mainHandler.removeCallbacks(audioPushRunnable);
        if (running && jsReady && fallbackView == null && !destroyed) {
            mainHandler.post(audioPushRunnable);
        }
    }

    private void pushAudioFrame() {
        if (!running || destroyed || !jsReady || webView == null || fallbackView != null) {
            return;
        }

        byte[] waveform = null;
        long timestampMs;
        boolean synthetic;
        synchronized (audioLock) {
            timestampMs = latestAudioTimestampMs;
            synthetic = usingSynthetic || latestWaveform == null;
            if (!synthetic) {
                waveform = latestWaveform.clone();
            }
        }

        String script;
        if (waveform != null) {
            String encoded = Base64.encodeToString(waveform, Base64.NO_WRAP);
            script = "window.braviaVisualizer&&window.braviaVisualizer.consumeAudio("
                    + timestampMs
                    + ",'"
                    + encoded
                    + "','real');";
        } else {
            script = "window.braviaVisualizer&&window.braviaVisualizer.consumeAudio("
                    + System.currentTimeMillis()
                    + ",'','synthetic');";
        }
        webView.evaluateJavascript(script, null);
        mainHandler.postDelayed(audioPushRunnable, AUDIO_PUSH_INTERVAL_MS);
    }

    private void startMemoryLogging() {
        mainHandler.removeCallbacks(memoryLogRunnable);
        logMemoryMetric();
        if (running && !destroyed) {
            mainHandler.postDelayed(memoryLogRunnable, MEMORY_LOG_INTERVAL_MS);
        }
    }

    private void logMemoryMetric() {
        if (activityManager == null) {
            return;
        }
        Debug.MemoryInfo[] infos = activityManager.getProcessMemoryInfo(new int[]{Process.myPid()});
        if (infos == null || infos.length == 0) {
            return;
        }
        int pssKb = infos[0].getTotalPss();
        if (baselinePssKb < 0) {
            baselinePssKb = pssKb;
        }
        int deltaKb = Math.max(0, pssKb - baselinePssKb);
        peakPssDeltaKb = Math.max(peakPssDeltaKb, deltaKb);
        logEvent("visualizer_memory_pss_kb",
                "current=" + pssKb + ",delta=" + deltaKb + ",peak_delta=" + peakPssDeltaKb);
    }

    private void fallbackToLegacy(String reason, boolean disableButterchurnForProcess) {
        if (disableButterchurnForProcess) {
            disabledForProcess = true;
        }
        logEvent("visualizer_fallback_reason", reason);
        stopAudioCapture();
        mainHandler.removeCallbacks(audioPushRunnable);
        mainHandler.removeCallbacks(memoryLogRunnable);
        jsReady = false;

        removeAllViews();
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidVisualizer");
            webView.destroy();
            webView = null;
        }

        fallbackView = new WinampVisualizerView(getContext());
        fallbackView.setSignal(engineName + "-fallback", true, 0);
        addView(fallbackView, new LayoutParams(
                LayoutParams.MATCH_PARENT,
                LayoutParams.MATCH_PARENT
        ));
        fallbackView.setRunning(running);
    }

    private WebResourceResponse responseFor(Uri uri) {
        if (uri == null
                || !LOCAL_SCHEME.equals(uri.getScheme())
                || !LOCAL_HOST.equals(uri.getHost())) {
            return blockedResponse();
        }

        String path = uri.getPath();
        if (path == null || !path.startsWith("/visualizer/")) {
            return blockedResponse();
        }

        String assetPath = path.substring(1);
        if (assetPath.contains("..") || assetPath.contains("\\")) {
            return blockedResponse();
        }

        try {
            InputStream stream = getContext().getAssets().open(assetPath);
            return new WebResourceResponse(mimeType(assetPath), "UTF-8", stream);
        } catch (IOException exception) {
            return new WebResourceResponse("text/plain", "UTF-8",
                    new ByteArrayInputStream(new byte[0]));
        }
    }

    private WebResourceResponse blockedResponse() {
        return new WebResourceResponse("text/plain", "UTF-8",
                new ByteArrayInputStream(new byte[0]));
    }

    private String mimeType(String assetPath) {
        if (assetPath.endsWith(".html")) {
            return "text/html";
        }
        if (assetPath.endsWith(".js")) {
            return "application/javascript";
        }
        if (assetPath.endsWith(".css")) {
            return "text/css";
        }
        if (assetPath.endsWith(".txt")) {
            return "text/plain";
        }
        return "application/octet-stream";
    }

    private boolean isLocalVisualizerUrl(Uri uri) {
        return uri != null
                && LOCAL_SCHEME.equals(uri.getScheme())
                && LOCAL_HOST.equals(uri.getHost())
                && uri.getPath() != null
                && uri.getPath().startsWith("/visualizer/");
    }

    private void logEvent(String key, String value) {
        Log.i(TAG, nowStamp() + " " + key + "=" + sanitize(value));
    }

    private String sanitize(String value) {
        if (value == null) {
            return "";
        }
        String cleaned = value.replaceAll("[\\r\\n\\t]", " ");
        return cleaned.length() > 160 ? cleaned.substring(0, 160) : cleaned;
    }

    private String nowStamp() {
        return new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ", Locale.US)
                .format(new Date());
    }

    private boolean isDebugBuild() {
        return (getContext().getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    private class LocalAssetClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return !isLocalVisualizerUrl(request == null ? null : request.getUrl());
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return responseFor(request == null ? null : request.getUrl());
        }

        @Override
        public void onReceivedError(
                WebView view,
                WebResourceRequest request,
                WebResourceError error
        ) {
            if (request != null && request.isForMainFrame()) {
                String description = error == null ? "unknown" : String.valueOf(error.getDescription());
                fallbackToLegacy("webview_main_frame_error:" + sanitize(description), true);
            }
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            String reason = "render_process_gone";
            if (detail != null) {
                reason += detail.didCrash() ? ":crashed" : ":killed";
                reason += ":priority=" + detail.rendererPriorityAtExit();
            }
            fallbackToLegacy(reason, true);
            return true;
        }
    }

    private class Bridge {
        @JavascriptInterface
        public void reportReady() {
            mainHandler.post(new Runnable() {
                @Override
                public void run() {
                    if (destroyed || fallbackView != null) {
                        return;
                    }
                    jsReady = true;
                    logEvent("visualizer_engine_ready", engineName);
                    scheduleAudioPush();
                }
            });
        }

        @JavascriptInterface
        public void reportWebGl(final boolean supported) {
            mainHandler.post(new Runnable() {
                @Override
                public void run() {
                    logEvent("webgl2_supported", String.valueOf(supported));
                }
            });
        }

        @JavascriptInterface
        public void reportError(final String message) {
            mainHandler.post(new Runnable() {
                @Override
                public void run() {
                    fallbackToLegacy("js_error:" + sanitize(message), true);
                }
            });
        }

        @JavascriptInterface
        public void reportEvent(final String eventName) {
            mainHandler.post(new Runnable() {
                @Override
                public void run() {
                    logEvent("visualizer_event", sanitize(eventName));
                }
            });
        }

        @JavascriptInterface
        public void reportFps(final double meanFps, final double p95FrameMs) {
            if (!Double.isFinite(meanFps)
                    || !Double.isFinite(p95FrameMs)
                    || meanFps < 0
                    || meanFps > 240
                    || p95FrameMs < 0
                    || p95FrameMs > 1000) {
                return;
            }
            mainHandler.post(new Runnable() {
                @Override
                public void run() {
                    logEvent("visualizer_fps",
                            "mean=" + Math.round(meanFps * 10.0) / 10.0
                                    + ",p95_ms=" + Math.round(p95FrameMs * 10.0) / 10.0);
                }
            });
        }

        @JavascriptInterface
        public void reportAudioFrameConsumed(final long frameTimestampMs) {
            if (frameTimestampMs <= 0) {
                return;
            }
            long now = System.currentTimeMillis();
            final long delay = now - frameTimestampMs;
            if (delay < 0 || delay > 10000 || now - lastAudioDelayLogMs < MEMORY_LOG_INTERVAL_MS) {
                return;
            }
            lastAudioDelayLogMs = now;
            mainHandler.post(new Runnable() {
                @Override
                public void run() {
                    logEvent("visualizer_audio_bridge_delay_ms", String.valueOf(delay));
                }
            });
        }
    }
}
