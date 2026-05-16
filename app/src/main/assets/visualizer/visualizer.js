(function () {
    var bridge = window.AndroidVisualizer || null;
    var canvas = document.getElementById("visualizer");
    var visualizer = null;
    var running = false;
    var audioSize = 1024;
    var currentAudio = makeSilence();
    var lastAudioTimestampMs = 0;
    var lastFrameAt = 0;
    var metricsStartAt = 0;
    var warmupUntil = 0;
    var frameTimes = [];
    var presetIndex = 0;

    function safeBridge(method) {
        try {
            if (bridge && typeof bridge[method] === "function") {
                var args = Array.prototype.slice.call(arguments, 1);
                bridge[method].apply(bridge, args);
            }
        } catch (ignored) {
        }
    }

    function makeSilence() {
        var audio = {
            timeByteArray: new Uint8Array(audioSize),
            timeByteArrayL: new Uint8Array(audioSize),
            timeByteArrayR: new Uint8Array(audioSize)
        };
        audio.timeByteArray.fill(128);
        audio.timeByteArrayL.fill(128);
        audio.timeByteArrayR.fill(128);
        return audio;
    }

    function makeSynthetic(now) {
        var t = now * 0.001;
        for (var i = 0; i < audioSize; i++) {
            var phase = i / audioSize;
            var sample = 128
                + 54 * Math.sin(i * 0.055 + t * 4.1)
                + 30 * Math.sin(i * 0.017 + t * 7.4)
                + 18 * Math.sin(i * 0.133 + Math.sin(t * 0.7) * 2.0);
            var left = Math.max(0, Math.min(255, sample + 12 * Math.sin(phase * 8.0 + t)));
            var right = Math.max(0, Math.min(255, sample - 12 * Math.cos(phase * 7.0 + t * 1.2)));
            currentAudio.timeByteArray[i] = Math.max(0, Math.min(255, sample));
            currentAudio.timeByteArrayL[i] = left;
            currentAudio.timeByteArrayR[i] = right;
        }
    }

    function applyWaveform(bytes) {
        if (!bytes || bytes.length === 0 || bytes.length > 4096) {
            return false;
        }
        for (var i = 0; i < audioSize; i++) {
            var sourceIndex = Math.min(bytes.length - 1, Math.floor(i * bytes.length / audioSize));
            var value = bytes[sourceIndex] & 255;
            currentAudio.timeByteArray[i] = value;
            currentAudio.timeByteArrayL[i] = value;
            currentAudio.timeByteArrayR[i] = value;
        }
        return true;
    }

    function decodeBase64(base64) {
        if (!base64 || base64.length > 8192) {
            return null;
        }
        var raw = window.atob(base64);
        if (raw.length > 4096) {
            return null;
        }
        var bytes = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) {
            bytes[i] = raw.charCodeAt(i) & 255;
        }
        return bytes;
    }

    function resize() {
        var ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        var width = Math.max(320, Math.floor(window.innerWidth * ratio));
        var height = Math.max(180, Math.floor(window.innerHeight * ratio));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
            if (visualizer) {
                visualizer.setRendererSize(width, height);
            }
        }
    }

    function reportMetrics(now) {
        if (now < warmupUntil || now - metricsStartAt < 5000 || frameTimes.length === 0) {
            return;
        }
        var sorted = frameTimes.slice().sort(function (a, b) { return a - b; });
        var sum = 0;
        for (var i = 0; i < frameTimes.length; i++) {
            sum += frameTimes[i];
        }
        var meanFrameMs = sum / frameTimes.length;
        var meanFps = meanFrameMs > 0 ? 1000 / meanFrameMs : 0;
        var p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
        safeBridge("reportFps", meanFps, sorted[p95Index]);
        metricsStartAt = now;
        frameTimes = [];
    }

    function render(now) {
        if (!running || !visualizer) {
            return;
        }
        resize();
        if (lastFrameAt > 0) {
            frameTimes.push(now - lastFrameAt);
        }
        lastFrameAt = now;
        try {
            visualizer.render({ audioLevels: currentAudio });
        } catch (exception) {
            running = false;
            safeBridge("reportError", "render_failed:" + exception.message);
            return;
        }
        reportMetrics(now);
        window.requestAnimationFrame(render);
    }

    function loadPreset(index, blendSeconds) {
        var presets = window.BRAVIA_PRESETS || [];
        if (!visualizer || presets.length === 0) {
            return;
        }
        presetIndex = ((index % presets.length) + presets.length) % presets.length;
        visualizer.loadPreset(presets[presetIndex], blendSeconds || 0);
    }

    function randomPresetIndex() {
        var presets = window.BRAVIA_PRESETS || [];
        if (presets.length <= 1) {
            return presetIndex;
        }
        var next = presetIndex;
        while (next === presetIndex) {
            next = Math.floor(Math.random() * presets.length);
        }
        return next;
    }

    function checkWebGl2() {
        try {
            var gl = canvas.getContext("webgl2", {
                alpha: false,
                antialias: false,
                depth: false,
                stencil: false,
                premultipliedAlpha: false
            });
            return !!gl;
        } catch (ignored) {
            return false;
        }
    }

    function init() {
        try {
            if (!checkWebGl2()) {
                safeBridge("reportWebGl", false);
                safeBridge("reportError", "webgl2_unavailable");
                return;
            }
            safeBridge("reportWebGl", true);
            resize();

            var api = window.butterchurn && (window.butterchurn.default || window.butterchurn);
            if (!api || typeof api.createVisualizer !== "function") {
                safeBridge("reportError", "butterchurn_missing");
                return;
            }

            visualizer = api.createVisualizer(null, canvas, {
                width: canvas.width,
                height: canvas.height,
                pixelRatio: Math.max(1, Math.min(2, window.devicePixelRatio || 1)),
                textureRatio: 1
            });
            visualizer.setRendererSize(canvas.width, canvas.height);
            loadPreset(0, 0);

            running = true;
            var now = performance.now();
            metricsStartAt = now;
            warmupUntil = now + 10000;
            lastFrameAt = 0;
            makeSynthetic(now);
            window.requestAnimationFrame(render);
            safeBridge("reportReady");
        } catch (exception) {
            safeBridge("reportError", "init_failed:" + exception.message);
        }
    }

    window.braviaVisualizer = {
        consumeAudio: function (timestampMs, base64, mode) {
            var applied = false;
            if (mode === "real" && base64) {
                applied = applyWaveform(decodeBase64(base64));
            }
            if (!applied) {
                makeSynthetic(performance.now());
            }
            lastAudioTimestampMs = Math.max(0, Number(timestampMs) || 0);
            if (lastAudioTimestampMs > 0) {
                safeBridge("reportAudioFrameConsumed", lastAudioTimestampMs);
            }
        },
        selectPreset: function (direction) {
            if (direction === "previous") {
                loadPreset(presetIndex - 1, 1.0);
            } else if (direction === "next") {
                loadPreset(presetIndex + 1, 1.0);
            } else if (direction === "random") {
                loadPreset(randomPresetIndex(), 1.0);
            }
        }
    };

    window.addEventListener("resize", resize);
    init();
}());
