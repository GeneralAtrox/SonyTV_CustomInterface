package com.svjkr.sonytvlauncher;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.Shader;
import android.media.audiofx.Visualizer;
import android.os.SystemClock;
import android.view.View;

public class WinampVisualizerView extends View {
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path wavePath = new Path();
    private final float[] fallbackBars = new float[64];
    private byte[] fftData;
    private byte[] waveformData;
    private Visualizer visualizer;
    private int signalSeed = 9;
    private boolean running;
    private boolean playing = true;
    private boolean audioLinked;
    private int progressPercent;

    public WinampVisualizerView(Context context) {
        super(context);
        setWillNotDraw(false);
    }

    public void setRunning(boolean running) {
        this.running = running;
        if (running) {
            startAudioCapture();
            invalidate();
        } else {
            stopAudioCapture();
        }
    }

    public void setSignal(String signal, boolean playing, int progressPercent) {
        this.signalSeed = Math.abs((signal == null ? "visualizer" : signal).hashCode());
        this.playing = playing;
        this.progressPercent = Math.max(0, Math.min(100, progressPercent));
        invalidate();
    }

    public boolean isAudioLinked() {
        return audioLinked;
    }

    private void startAudioCapture() {
        if (visualizer != null || !hasRecordAudioPermission()) {
            return;
        }

        try {
            visualizer = new Visualizer(0);
            visualizer.setCaptureSize(Visualizer.getCaptureSizeRange()[1]);
            visualizer.setDataCaptureListener(new Visualizer.OnDataCaptureListener() {
                @Override
                public void onWaveFormDataCapture(Visualizer visualizer, byte[] waveform, int samplingRate) {
                    waveformData = waveform;
                    audioLinked = true;
                    postInvalidate();
                }

                @Override
                public void onFftDataCapture(Visualizer visualizer, byte[] fft, int samplingRate) {
                    fftData = fft;
                    audioLinked = true;
                    postInvalidate();
                }
            }, Visualizer.getMaxCaptureRate() / 2, true, true);
            visualizer.setEnabled(true);
            audioLinked = true;
        } catch (RuntimeException exception) {
            stopAudioCapture();
            audioLinked = false;
        }
    }

    private boolean hasRecordAudioPermission() {
        return getContext().checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED;
    }

    private void stopAudioCapture() {
        if (visualizer == null) {
            return;
        }

        try {
            visualizer.setEnabled(false);
            visualizer.release();
        } catch (RuntimeException ignored) {
            // The platform visualizer can throw if the audio session vanished mid-frame.
        }
        visualizer = null;
        audioLinked = false;
    }

    @Override
    protected void onDetachedFromWindow() {
        stopAudioCapture();
        super.onDetachedFromWindow();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        int width = getWidth();
        int height = getHeight();
        if (width <= 0 || height <= 0) {
            return;
        }

        drawBackground(canvas, width, height);
        drawPerspectiveGrid(canvas, width, height);
        drawTunnel(canvas, width, height);
        drawSpectrum(canvas, width, height);
        drawWave(canvas, width, height);
        drawProgress(canvas, width, height);

        if (running) {
            postInvalidateDelayed(33);
        }
    }

    private void drawBackground(Canvas canvas, int width, int height) {
        paint.setStyle(Paint.Style.FILL);
        paint.setShader(new LinearGradient(
                0f,
                0f,
                width,
                height,
                0xFF050612,
                0xFF062C2E,
                Shader.TileMode.CLAMP
        ));
        canvas.drawRect(0f, 0f, width, height, paint);
        paint.setShader(new RadialGradient(
                width * 0.52f,
                height * 0.48f,
                Math.max(width, height) * 0.55f,
                0x6640008C,
                0x00000000,
                Shader.TileMode.CLAMP
        ));
        canvas.drawRect(0f, 0f, width, height, paint);
        paint.setShader(null);
    }

    private void drawPerspectiveGrid(Canvas canvas, int width, int height) {
        float horizon = height * 0.58f;
        float bottom = height;
        float centerX = width * 0.5f;
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(Math.max(1f, width / 900f));
        paint.setColor(0x2235FFB0);

        for (int index = -12; index <= 12; index++) {
            float x = centerX + index * width * 0.075f;
            canvas.drawLine(centerX, horizon, x, bottom, paint);
        }

        for (int index = 0; index < 16; index++) {
            float t = index / 15f;
            float y = horizon + (bottom - horizon) * t * t;
            canvas.drawLine(0f, y, width, y, paint);
        }
        paint.setStyle(Paint.Style.FILL);
    }

    private void drawTunnel(Canvas canvas, int width, int height) {
        float time = SystemClock.uptimeMillis() / 1000f;
        float centerX = width * 0.5f;
        float centerY = height * 0.42f;
        float maxRadius = Math.min(width, height) * 0.44f;

        paint.setStyle(Paint.Style.STROKE);
        for (int index = 0; index < 9; index++) {
            float t = ((time * 0.28f) + index / 9f) % 1f;
            float radius = maxRadius * t;
            int alpha = Math.round(120 * (1f - t));
            paint.setColor((alpha << 24) | 0x00FF42C9);
            paint.setStrokeWidth(Math.max(2f, width / 420f) * (1f - t * 0.35f));
            canvas.drawCircle(centerX, centerY, radius, paint);
        }
        paint.setStyle(Paint.Style.FILL);
    }

    private void drawSpectrum(Canvas canvas, int width, int height) {
        int barCount = Math.min(64, Math.max(28, width / 30));
        float gap = Math.max(2f, width * 0.006f);
        float barWidth = (width - gap * (barCount + 1)) / barCount;
        float baseline = height * 0.78f;
        float maxBarHeight = height * 0.48f;
        float time = SystemClock.uptimeMillis() / 170f;

        for (int index = 0; index < barCount; index++) {
            float amount = spectrumAmount(index, barCount, time);
            float barHeight = Math.max(height * 0.035f, maxBarHeight * amount);
            float left = gap + index * (barWidth + gap);
            float top = baseline - barHeight;

            paint.setShader(new LinearGradient(
                    0f,
                    top,
                    0f,
                    baseline,
                    0xFFFFEA52,
                    0xFF36FFC6,
                    Shader.TileMode.CLAMP
            ));
            canvas.drawRoundRect(left, top, left + barWidth, baseline, barWidth / 2f, barWidth / 2f, paint);
        }
        paint.setShader(null);
    }

    private float spectrumAmount(int index, int barCount, float time) {
        if (fftData != null && fftData.length > 4) {
            int bin = 2 + Math.round((fftData.length / 2f - 3f) * index / Math.max(1, barCount - 1));
            int real = fftData[Math.min(fftData.length - 1, bin * 2)];
            int imag = fftData[Math.min(fftData.length - 1, bin * 2 + 1)];
            float magnitude = (float) Math.hypot(real, imag) / 128f;
            return Math.max(0.04f, Math.min(1f, magnitude * 1.55f));
        }

        float phase = time + index * 0.43f + (signalSeed % 37) * 0.13f;
        float wave = Math.abs((float) Math.sin(phase) * (float) Math.cos(phase * 0.31f));
        float pulse = Math.abs((float) Math.sin(time * 0.47f + index * 0.19f));
        float energy = playing ? 1f : 0.36f;
        fallbackBars[index % fallbackBars.length] = 0.18f + wave * 0.62f + pulse * 0.20f;
        return fallbackBars[index % fallbackBars.length] * energy;
    }

    private void drawWave(Canvas canvas, int width, int height) {
        wavePath.reset();
        float middle = height * 0.36f;
        float amplitude = height * (playing ? 0.10f : 0.04f);
        float time = SystemClock.uptimeMillis() / 220f;
        int step = Math.max(3, width / 140);

        for (int x = 0; x <= width; x += step) {
            float y;
            if (waveformData != null && waveformData.length > 0) {
                int index = Math.min(waveformData.length - 1, Math.round((waveformData.length - 1) * (x / (float) width)));
                y = middle + ((waveformData[index] & 0xFF) - 128) * height / 760f;
            } else {
                float phase = x * 0.024f + time + (signalSeed % 17);
                y = middle
                        + (float) Math.sin(phase) * amplitude
                        + (float) Math.sin(phase * 0.41f) * amplitude * 0.60f;
            }

            if (x == 0) {
                wavePath.moveTo(x, y);
            } else {
                wavePath.lineTo(x, y);
            }
        }

        paint.setShader(null);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(Math.max(2f, width / 420f));
        paint.setColor(0xB8FFFFFF);
        canvas.drawPath(wavePath, paint);
        paint.setStyle(Paint.Style.FILL);
    }

    private void drawProgress(Canvas canvas, int width, int height) {
        if (progressPercent <= 0) {
            return;
        }

        float trackHeight = Math.max(3f, height * 0.008f);
        float top = height - trackHeight;
        paint.setShader(null);
        paint.setColor(0x33FFFFFF);
        canvas.drawRect(0f, top, width, height, paint);
        paint.setColor(0xFFFFFFFF);
        canvas.drawRect(0f, top, width * (progressPercent / 100f), height, paint);
    }
}
