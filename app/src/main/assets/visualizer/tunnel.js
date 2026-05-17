(function () {
    var bridge = window.AndroidVisualizer || null;
    var canvas = document.getElementById("tunnel");
    var coasterCanvas = document.getElementById("coaster");
    var coasterContext = coasterCanvas ? coasterCanvas.getContext("2d") : null;
    var presetOverlay = document.getElementById("presetOverlay");
    var presetName = document.getElementById("presetName");
    var avsPresetDefinitions = window.braviaAvsPresetDefinitions || {};
    var neonCoasterDefinition = avsPresetDefinitions.neonCoaster || null;
    var avsEel = window.braviaAvsEel || null;
    var avsNeonRuntime = null;
    var avsNeonEelScope = null;
    var avsNeonRuntimeFailed = false;
    var gl = null;
    var program = null;
    var quadBuffer = null;
    var quadPositionLocation = -1;
    var lineProgram = null;
    var lineBuffer = null;
    var lineLocations = {};
    var running = false;
    var paused = false;
    var lastFrameAt = 0;
    var metricsStartAt = 0;
    var warmupUntil = 0;
    var frameTimes = [];
    var presetIndex = 0;
    var audioSize = 1024;
    var lastAudioTimestampMs = 0;
    var transitionDurationMs = 950;
    var maxVisualDeltaMs = 50;
    var globalTimeScale = 0.74;
    var visualTimeSeconds = 0;
    var audio = {
        rms: 0.10,
        bass: 0.10,
        mid: 0.10,
        treb: 0.10,
        targetRms: 0.10,
        targetBass: 0.10,
        targetMid: 0.10,
        targetTreb: 0.10
    };
    var waveformSamples = new Float32Array(audioSize);
    var avsNeonState = null;
    var avsNeonSampleCount = neonCoasterDefinition && neonCoasterDefinition.superScope
            && neonCoasterDefinition.superScope.sampleCount
            ? neonCoasterDefinition.superScope.sampleCount
            : 480;
    var avsNeonLineWidthPx = neonCoasterDefinition && neonCoasterDefinition.lineMode
            && neonCoasterDefinition.lineMode.lineWidth
            ? neonCoasterDefinition.lineMode.lineWidth
            : 3;
    var avsFastBrightnessFadeAlpha = neonCoasterDefinition && neonCoasterDefinition.fastBrightness
            && neonCoasterDefinition.fastBrightness.operation === "halve"
            ? 0.50
            : 0;
    var avsNeonBlendMode = neonCoasterDefinition && neonCoasterDefinition.lineMode
            ? neonCoasterDefinition.lineMode.blendMode
            : "maximum";
    // The BRAVIA WebView cannot interpret all 480 SuperScope points at 60 FPS yet.
    var avsNeonInterpretedSampleCap = 360;
    var avsNeonVertices = new Float32Array(avsNeonSampleCount * 6 * 6);
    var avsFadeVertices = new Float32Array([
        -1, -1, 0, 0, 0, avsFastBrightnessFadeAlpha,
        1, -1, 0, 0, 0, avsFastBrightnessFadeAlpha,
        -1, 1, 0, 0, 0, avsFastBrightnessFadeAlpha,
        -1, 1, 0, 0, 0, avsFastBrightnessFadeAlpha,
        1, -1, 0, 0, 0, avsFastBrightnessFadeAlpha,
        1, 1, 0, 0, 0, avsFastBrightnessFadeAlpha
    ]);
    var avsNeonFrameStarted = false;

    var presets = [
        {
            name: "Tuggummi Worm-O-Rama",
            shape: 0,
            turn: 0.18,
            twist: 0.36,
            speed: 0.46,
            ribs: 2.55,
            spokes: 13.0,
            beam: 0.18,
            intensity: 0.64,
            colorA: [0.04, 0.46, 0.72],
            colorB: [0.62, 0.08, 0.50],
            colorC: [0.78, 0.42, 0.12]
        },
        {
            name: "UnConeD Containment",
            shape: 0,
            turn: 0.10,
            twist: 0.24,
            speed: 0.34,
            ribs: 1.85,
            spokes: 10.0,
            beam: 0.12,
            intensity: 0.58,
            colorA: [0.10, 0.40, 0.62],
            colorB: [0.55, 0.16, 0.45],
            colorC: [0.18, 0.74, 0.70]
        },
        {
            name: neonCoasterDefinition ? neonCoasterDefinition.displayName : "UnConeD Neon Coaster",
            mode: "coaster",
            avsPresetId: "neonCoaster",
            shape: 0.25,
            turn: 0.36,
            twist: 0.18,
            speed: 0.52,
            ribs: 1.55,
            spokes: 6.0,
            beam: 0.26,
            intensity: 0.72,
            colorA: [0.05, 0.68, 0.90],
            colorB: [0.90, 0.14, 0.62],
            colorC: [0.72, 0.82, 0.16]
        },
        {
            name: "UnConeD Speeder 3K",
            shape: 0.10,
            turn: 0.22,
            twist: 0.14,
            speed: 0.70,
            ribs: 2.90,
            spokes: 18.0,
            beam: 0.30,
            intensity: 0.74,
            colorA: [0.08, 0.62, 0.92],
            colorB: [0.28, 0.18, 0.72],
            colorC: [0.86, 0.78, 0.34]
        },
        {
            name: "UnConeD Tie Tunnel SSC",
            shape: 0,
            turn: 0.16,
            twist: 0.48,
            speed: 0.48,
            ribs: 2.35,
            spokes: 8.0,
            beam: 0.34,
            intensity: 0.70,
            colorA: [0.06, 0.72, 0.76],
            colorB: [0.74, 0.10, 0.38],
            colorC: [0.88, 0.62, 0.16]
        },
        {
            name: "UnConeD Zero-G Maze II",
            shape: 1,
            turn: 0.28,
            twist: 0.18,
            speed: 0.40,
            ribs: 1.72,
            spokes: 6.0,
            beam: 0.20,
            intensity: 0.62,
            colorA: [0.04, 0.52, 0.34],
            colorB: [0.08, 0.20, 0.62],
            colorC: [0.58, 0.80, 0.18]
        },
        {
            name: "UnConeD Zero-G Maze III",
            shape: 1,
            turn: 0.24,
            twist: 0.28,
            speed: 0.44,
            ribs: 2.05,
            spokes: 7.0,
            beam: 0.18,
            intensity: 0.66,
            colorA: [0.10, 0.36, 0.72],
            colorB: [0.48, 0.10, 0.70],
            colorC: [0.78, 0.70, 0.24]
        },
        {
            name: "Duo Hash the Planet",
            shape: 0,
            turn: 0.04,
            twist: 0.05,
            speed: 0.36,
            ribs: 1.15,
            spokes: 4.0,
            beam: 0.10,
            intensity: 0.56,
            colorA: [0.34, 0.12, 0.58],
            colorB: [0.10, 0.46, 0.60],
            colorC: [0.70, 0.42, 0.12]
        },
        {
            name: "fUk Afterburner Remix",
            shape: 0.65,
            turn: 0.20,
            twist: 0.12,
            speed: 0.58,
            ribs: 2.25,
            spokes: 5.0,
            beam: 0.34,
            intensity: 0.70,
            colorA: [0.70, 0.12, 0.04],
            colorB: [0.08, 0.22, 0.56],
            colorC: [0.92, 0.46, 0.08]
        },
        {
            name: "NemoOrange Building Blocks",
            shape: 1,
            turn: 0.04,
            twist: 0.03,
            speed: 0.28,
            ribs: 0.82,
            spokes: 4.0,
            beam: 0.08,
            intensity: 0.58,
            colorA: [0.18, 0.38, 0.66],
            colorB: [0.58, 0.42, 0.16],
            colorC: [0.50, 0.74, 0.28]
        },
        {
            name: "UnConeD Butterfly Caught",
            shape: 0.10,
            turn: 0.12,
            twist: 0.12,
            speed: 0.34,
            ribs: 1.25,
            spokes: 9.0,
            beam: 0.22,
            intensity: 0.60,
            colorA: [0.18, 0.54, 0.26],
            colorB: [0.58, 0.32, 0.12],
            colorC: [0.74, 0.60, 0.26]
        },
        {
            name: "UnConeD Don't Trip and Drive",
            shape: 1,
            turn: 0.18,
            twist: 0.05,
            speed: 0.46,
            ribs: 1.45,
            spokes: 12.0,
            beam: 0.12,
            intensity: 0.60,
            colorA: [0.10, 0.34, 0.20],
            colorB: [0.46, 0.16, 0.10],
            colorC: [0.82, 0.52, 0.18]
        },
        {
            name: "UnConeD Seismogrid",
            shape: 1,
            turn: 0.02,
            twist: 0.02,
            speed: 0.30,
            ribs: 1.35,
            spokes: 14.0,
            beam: 0.10,
            intensity: 0.64,
            colorA: [0.02, 0.52, 0.60],
            colorB: [0.08, 0.20, 0.34],
            colorC: [0.46, 0.82, 0.70]
        },
        {
            name: "lone Gold Shower 3D",
            shape: 0,
            turn: 0.10,
            twist: 0.22,
            speed: 0.42,
            ribs: 2.60,
            spokes: 19.0,
            beam: 0.20,
            intensity: 0.68,
            colorA: [0.72, 0.42, 0.06],
            colorB: [0.32, 0.16, 0.02],
            colorC: [0.94, 0.76, 0.24]
        }
    ];
    var displayedPreset = copyPreset(presets[presetIndex]);
    var transitionFrom = null;
    var transitionTo = null;
    var transitionStartAt = 0;
    var coasterVisible = false;
    var coasterMaxWidth = 720;
    var coasterMaxHeight = 405;
    var coasterControlPoints = [
        { x: 0.00, y: 0.18, z: 0.00 },
        { x: 0.78, y: 0.24, z: -0.52 },
        { x: 1.06, y: 0.72, z: -1.38 },
        { x: 0.36, y: 1.10, z: -2.06 },
        { x: -0.36, y: 0.16, z: -2.08 },
        { x: -1.08, y: 0.10, z: -1.42 },
        { x: -1.62, y: 0.62, z: -0.46 },
        { x: -1.18, y: 0.06, z: 0.44 },
        { x: -0.30, y: -0.10, z: 0.98 },
        { x: 0.62, y: 0.34, z: 1.18 },
        { x: 1.38, y: 0.06, z: 0.46 },
        { x: 0.82, y: 0.58, z: -0.22 }
    ];

    var vertexSource = "#version 300 es\n"
        + "in vec2 a_position;\n"
        + "out vec2 v_uv;\n"
        + "void main() {\n"
        + "    v_uv = a_position * 0.5 + 0.5;\n"
        + "    gl_Position = vec4(a_position, 0.0, 1.0);\n"
        + "}\n";

    var fragmentSource = "#version 300 es\n"
        + "precision highp float;\n"
        + "in vec2 v_uv;\n"
        + "out vec4 outColor;\n"
        + "uniform vec2 u_resolution;\n"
        + "uniform float u_time;\n"
        + "uniform vec4 u_audio;\n"
        + "uniform vec4 u_motion;\n"
        + "uniform vec4 u_grid;\n"
        + "uniform vec3 u_colorA;\n"
        + "uniform vec3 u_colorB;\n"
        + "uniform vec3 u_colorC;\n"
        + "const float PI = 3.141592653589793;\n"
        + "const float TAU = 6.283185307179586;\n"
        + "float saturate(float value) { return clamp(value, 0.0, 1.0); }\n"
        + "float lineRepeat(float value, float width) {\n"
        + "    float centered = abs(fract(value) - 0.5);\n"
        + "    return 1.0 - smoothstep(width, width + 0.018, centered);\n"
        + "}\n"
        + "vec2 turnPath(float z, float turnAmount) {\n"
        + "    float cell = floor(z * 0.115);\n"
        + "    float f = fract(z * 0.115);\n"
        + "    float snap = smoothstep(0.08, 0.58, f) * (1.0 - smoothstep(0.72, 1.0, f));\n"
        + "    vec2 hardTurn = vec2(sin(cell * 1.71), cos(cell * 1.37));\n"
        + "    vec2 drift = vec2(sin(z * 0.23), cos(z * 0.19));\n"
        + "    return (hardTurn * snap * 0.52 + drift * 0.20) * turnAmount;\n"
        + "}\n"
        + "float squareDistance(vec2 p) {\n"
        + "    return max(abs(p.x), abs(p.y));\n"
        + "}\n"
        + "float squareWallCoord(vec2 p) {\n"
        + "    vec2 ap = abs(p);\n"
        + "    if (ap.x > ap.y) {\n"
        + "        return p.y / max(ap.x, 0.001);\n"
        + "    }\n"
        + "    return p.x / max(ap.y, 0.001);\n"
        + "}\n"
        + "void main() {\n"
        + "    vec2 p = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y;\n"
        + "    float speed = u_motion.w;\n"
        + "    float travel = u_time * speed;\n"
        + "    vec2 camera = turnPath(travel + 5.0, u_motion.y) * 0.045;\n"
        + "    p += camera;\n"
        + "    float radius = mix(length(p), squareDistance(p), u_motion.x);\n"
        + "    float depth = 1.0 / max(radius, 0.035) + travel;\n"
        + "    float angle = atan(p.y, p.x) / TAU + 0.5;\n"
        + "    float wallCoord = mix(angle, squareWallCoord(p) * 0.5 + 0.5, u_motion.x);\n"
        + "    float twist = depth * 0.030 * u_motion.z;\n"
        + "    wallCoord += twist;\n"
        + "    wallCoord += sin(depth * 0.31 + wallCoord * TAU * 3.0 + travel * 0.22) * 0.010 * u_motion.z;\n"
        + "    float ringWidth = 0.044 + u_audio.y * 0.014;\n"
        + "    float spokeWidth = 0.026 + u_audio.w * 0.010;\n"
        + "    float rings = lineRepeat(depth * u_grid.x, ringWidth);\n"
        + "    float spokes = lineRepeat(wallCoord * u_grid.y, spokeWidth);\n"
        + "    float lanes = lineRepeat((wallCoord + depth * 0.035) * max(2.0, u_grid.y * 0.33), 0.014);\n"
        + "    float centerRay = pow(max(0.0, 1.0 - radius * 2.6), 3.2) * (0.22 + u_audio.z * 0.42);\n"
        + "    float strobe = pow(lineRepeat(depth * (u_grid.x * 0.52), 0.060), 2.0) * u_grid.z;\n"
        + "    float grid = saturate(rings * 0.74 + spokes * 0.54 + lanes * 0.24 + strobe * 0.32);\n"
        + "    float edge = smoothstep(0.04, 0.86, radius) * (1.0 - smoothstep(1.35, 2.1, radius));\n"
        + "    float fog = 0.18 + 0.82 * (1.0 - smoothstep(8.0, 34.0, depth));\n"
        + "    float glow = (grid * 1.08 + strobe * 0.18) * edge * fog * (0.72 + u_audio.x * 0.86) * u_grid.w;\n"
        + "    vec3 tunnelColor = mix(u_colorA, u_colorB, saturate(sin(depth * 0.17 + wallCoord * TAU + u_time * 0.25) * 0.5 + 0.5));\n"
        + "    tunnelColor = mix(tunnelColor, u_colorC, rings * (0.14 + u_audio.y * 0.18));\n"
        + "    float wallTexture = sin(depth * 0.44 + wallCoord * TAU * 2.0 + sin(depth * 0.12) * 1.6) * 0.5 + 0.5;\n"
        + "    float wallWash = edge * fog * (0.060 + 0.070 * wallTexture + 0.040 * u_audio.y) * u_grid.w;\n"
        + "    float panel = smoothstep(0.48, 0.94, sin(floor(wallCoord * u_grid.y) * 1.7 + floor(depth * 0.42) * 1.3 + travel * 0.24) * 0.5 + 0.5);\n"
        + "    vec3 panelColor = mix(u_colorA, u_colorB, panel);\n"
        + "    vec3 color = tunnelColor * (glow + wallWash);\n"
        + "    color += panelColor * panel * edge * fog * (0.040 + 0.045 * u_audio.x) * u_grid.w;\n"
        + "    color += u_colorC * centerRay * fog * (0.46 + u_audio.z * 0.26) * u_grid.w;\n"
        + "    color += u_colorA * pow(glow, 1.65) * (0.28 + u_audio.w * 0.34);\n"
        + "    color += vec3(0.004, 0.007, 0.014) * (1.0 - radius * 0.10);\n"
        + "    color *= 1.0 + 0.12 * sin(depth * 0.9 + travel * 0.45);\n"
        + "    color *= 1.0 - smoothstep(1.15, 2.05, radius) * 0.38;\n"
        + "    outColor = vec4(pow(max(color, vec3(0.0)), vec3(0.92)), 1.0);\n"
        + "}\n";

    var lineVertexSource = "#version 300 es\n"
        + "in vec2 a_position;\n"
        + "in vec4 a_color;\n"
        + "out vec4 v_color;\n"
        + "void main() {\n"
        + "    v_color = a_color;\n"
        + "    gl_Position = vec4(a_position, 0.0, 1.0);\n"
        + "}\n";

    var lineFragmentSource = "#version 300 es\n"
        + "precision mediump float;\n"
        + "in vec4 v_color;\n"
        + "out vec4 outColor;\n"
        + "void main() {\n"
        + "    outColor = v_color;\n"
        + "}\n";

    var locations = {};

    function safeBridge(method) {
        try {
            if (bridge && typeof bridge[method] === "function") {
                var args = Array.prototype.slice.call(arguments, 1);
                bridge[method].apply(bridge, args);
            }
        } catch (ignored) {
        }
    }

    function setPresetOverlayVisible(visible) {
        if (!presetOverlay) {
            return;
        }
        if (visible) {
            presetOverlay.classList.add("visible");
        } else {
            presetOverlay.classList.remove("visible");
        }
    }

    function updatePresetOverlay() {
        if (presetName) {
            presetName.textContent = presets[presetIndex].name || "Unknown preset";
        }
        setPresetOverlayVisible(paused);
    }

    function isCoasterPreset() {
        return presets[presetIndex].mode === "coaster";
    }

    function setCoasterVisible(visible) {
        if (!coasterCanvas || coasterVisible === visible) {
            return;
        }
        coasterVisible = visible;
        coasterCanvas.style.display = visible ? "block" : "none";
        canvas.style.opacity = visible ? "0" : "1";
        if (!visible && coasterContext) {
            coasterContext.clearRect(0, 0, coasterCanvas.width, coasterCanvas.height);
        }
    }

    function point(x, y, z) {
        return { x: x, y: y, z: z };
    }

    function addPoint(a, b) {
        return point(a.x + b.x, a.y + b.y, a.z + b.z);
    }

    function subtractPoint(a, b) {
        return point(a.x - b.x, a.y - b.y, a.z - b.z);
    }

    function scalePoint(a, scale) {
        return point(a.x * scale, a.y * scale, a.z * scale);
    }

    function dotPoint(a, b) {
        return a.x * b.x + a.y * b.y + a.z * b.z;
    }

    function crossPoint(a, b) {
        return point(
                a.y * b.z - a.z * b.y,
                a.z * b.x - a.x * b.z,
                a.x * b.y - a.y * b.x
        );
    }

    function normalizePoint(a) {
        var length = Math.sqrt(dotPoint(a, a));
        if (length < 0.0001) {
            return point(0, 0, 0);
        }
        return scalePoint(a, 1 / length);
    }

    function wrap01(value) {
        return value - Math.floor(value);
    }

    function eelTruthy(value) {
        return Math.abs(value) > 0.00001;
    }

    function eelIf(condition, trueValue, falseValue) {
        return eelTruthy(condition) ? trueValue : falseValue;
    }

    function eelAbove(value, threshold) {
        return value > threshold ? 1 : 0;
    }

    function eelBelow(value, threshold) {
        return value < threshold ? 1 : 0;
    }

    function eelBand(a, b) {
        return eelTruthy(a) && eelTruthy(b) ? 1 : 0;
    }

    function eelBor(a, b) {
        return eelTruthy(a) || eelTruthy(b) ? 1 : 0;
    }

    function sqr(value) {
        return value * value;
    }

    function sign(value) {
        return value > 0 ? 1 : (value < 0 ? -1 : 0);
    }

    function safeSqrt(value) {
        return Math.sqrt(Math.max(0, value));
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function getOsc(position) {
        var samplePosition = wrap01(position);
        if (!waveformSamples || waveformSamples.length === 0) {
            return Math.sin(visualTimeSeconds * 2.4 + samplePosition * Math.PI * 2) * audio.rms;
        }
        var index = clamp(Math.round(samplePosition * (waveformSamples.length - 1)), 0, waveformSamples.length - 1);
        var sample = waveformSamples[index];
        if (Math.abs(sample) < 0.0001 && audio.rms > 0.02) {
            return Math.sin(visualTimeSeconds * 2.4 + samplePosition * Math.PI * 2) * audio.rms;
        }
        return sample;
    }

    function getAvsNeonRuntime() {
        if (avsNeonRuntime || avsNeonRuntimeFailed) {
            return avsNeonRuntime;
        }
        if (!avsEel || !neonCoasterDefinition || !neonCoasterDefinition.superScope
                || !neonCoasterDefinition.superScope.eel) {
            avsNeonRuntimeFailed = true;
            return null;
        }
        try {
            var eel = neonCoasterDefinition.superScope.eel;
            if (typeof avsEel.compileSuite === "function") {
                avsNeonRuntime = avsEel.compileSuite(eel);
            } else {
                avsNeonRuntime = {
                    init: avsEel.compile(eel.init),
                    frame: avsEel.compile(eel.frame),
                    beat: avsEel.compile(eel.beat),
                    point: avsEel.compile(eel.point)
                };
            }
        } catch (exception) {
            avsNeonRuntimeFailed = true;
            if (window.console && typeof window.console.error === "function") {
                window.console.error("AVS EEL compile failed", exception);
            }
            return null;
        }
        return avsNeonRuntime;
    }

    function avsEelHost() {
        return {
            getosc: function (position) {
                return getOsc(position);
            }
        };
    }

    function runAvsEelProgram(program, scope) {
        if (!program || avsNeonRuntimeFailed) {
            return false;
        }
        try {
            program.run(scope, avsEelHost());
            return true;
        } catch (exception) {
            avsNeonRuntimeFailed = true;
            avsNeonRuntime = null;
            if (window.console && typeof window.console.error === "function") {
                window.console.error("AVS EEL runtime failed", exception);
            }
            return false;
        }
    }

    function runAvsNeonInitProgram() {
        var runtime = getAvsNeonRuntime();
        if (!runtime) {
            return false;
        }
        if (typeof runtime.createScope === "function") {
            avsNeonEelScope = runtime.createScope(avsNeonState);
            if (!runAvsEelProgram(runtime.init, avsNeonEelScope)) {
                avsNeonEelScope = null;
                return false;
            }
            avsNeonState.n = runtime.get(avsNeonEelScope, "n") || avsNeonState.n;
            return true;
        }
        return runAvsEelProgram(runtime.init, avsNeonState);
    }

    function runAvsNeonFrameProgram(isBeat, width, height) {
        var runtime = getAvsNeonRuntime();
        if (!runtime) {
            return false;
        }
        var scope = avsNeonEelScope || avsNeonState;
        if (typeof runtime.set === "function") {
            runtime.set(scope, "w", width);
            runtime.set(scope, "h", Math.max(1, height));
        } else {
            avsNeonState.w = width;
            avsNeonState.h = Math.max(1, height);
        }
        if (!runAvsEelProgram(runtime.frame, scope)) {
            return false;
        }
        if (isBeat) {
            runAvsEelProgram(runtime.beat, scope);
        }
        if (typeof runtime.get === "function") {
            avsNeonState.n = runtime.get(scope, "n") || avsNeonState.n;
        }
        return true;
    }

    function runAvsNeonPointProgram(pointIndex, renderedSampleCount) {
        var runtime = getAvsNeonRuntime();
        if (!runtime) {
            return null;
        }
        var scope = avsNeonEelScope || avsNeonState;
        var sampleCount = renderedSampleCount || avsNeonState.n;
        if (typeof runtime.set === "function") {
            runtime.set(scope, "i", pointIndex / Math.max(1, sampleCount - 1));
        } else {
            avsNeonState.i = pointIndex / Math.max(1, sampleCount - 1);
        }
        if (!runAvsEelProgram(runtime.point, scope)) {
            return null;
        }
        if (typeof runtime.get === "function") {
            return {
                x: runtime.get(scope, "x") || 0,
                y: runtime.get(scope, "y") || 0,
                r: clamp(runtime.get(scope, "red") || 0, 0, 1),
                g: clamp(runtime.get(scope, "green") || 0, 0, 1),
                b: clamp(runtime.get(scope, "blue") || 0, 0, 1)
            };
        }
        return {
            x: avsNeonState.x || 0,
            y: avsNeonState.y || 0,
            r: clamp(avsNeonState.red || 0, 0, 1),
            g: clamp(avsNeonState.green || 0, 0, 1),
            b: clamp(avsNeonState.blue || 0, 0, 1)
        };
    }

    function resetAvsNeonState() {
        avsNeonState = {
            n: avsNeonSampleCount,
            tpi: Math.acos(-1),
            t: 0,
            ox: 0,
            oy: 0,
            oz: 0,
            oox: 0,
            ooy: 0,
            ooz: 0,
            ix: 0,
            iy: 0,
            iz: 0,
            kx: 0,
            kz: 0,
            jx: 0,
            jz: 0,
            by: 0,
            rrz: 0,
            rx: 0,
            ry: 0,
            rz: 0,
            cx: 1,
            sx: 0,
            cy: 1,
            sy: 0,
            cz: 1,
            sz: 0,
            pc: 0,
            hi: 1,
            cr: 0.5,
            cg: 0.5,
            cb: 0.5,
            w: 1,
            hp: 0,
            lx: 0,
            ly: 0,
            gx: 0,
            gy: 0,
            mx: 0,
            my: 2,
            hu: 0,
            mf: ((getOsc(0.7) * 200) % 4 + 4) % 4,
            u: 0,
            beatAverage: 0.18,
            lastBeatAt: 0
        };
        avsNeonEelScope = null;
        runAvsNeonInitProgram();
        avsNeonFrameStarted = false;
    }

    function detectAvsBeat(now) {
        var s = avsNeonState;
        var energy = Math.max(audio.rms, audio.bass * 0.72 + audio.mid * 0.28);
        s.beatAverage += (energy - s.beatAverage) * 0.028;
        if (now - s.lastBeatAt < 170) {
            return false;
        }
        if (energy > Math.max(0.13, s.beatAverage * 1.34)) {
            s.lastBeatAt = now;
            s.beatAverage = s.beatAverage * 0.86 + energy * 0.14;
            return true;
        }
        return false;
    }

    function updateAvsNeonFrame(now, width, height) {
        if (!avsNeonState) {
            resetAvsNeonState();
        }
        var s = avsNeonState;
        var isBeat = detectAvsBeat(now);
        if (runAvsNeonFrameProgram(isBeat, width, height)) {
            return;
        }
        var red = eelBor(eelBelow(s.u, 5.02), eelAbove(s.u, 9.86));
        s.rx = Math.atan2(safeSqrt(sqr(s.ooz - s.oz) + sqr(s.oox - s.ox)), s.ooy - s.oy) - 1.57;
        s.ry = eelIf(red, Math.atan2(s.ooz - s.oz, s.oox - s.ox) - 1.57, -1.57 * sign(s.oox - s.ox));
        s.rz = s.rrz + (1 - red) * (1.57 + 1.57 * sign(s.oox - s.ox)
                * eelIf(s.mf % 2, 1, -1) * eelIf(eelBelow(s.mf, 2), 1, -1));
        s.ox = s.oox;
        s.oy = s.ooy;
        s.oz = s.ooz;
        s.t += (1 / s.n) * eelIf(eelBelow(s.mf, 2), 1, -1);
        s.t = eelIf(eelBelow(s.t, 0), s.t + 1, eelIf(eelAbove(s.t, 1), s.t - 1, s.t));
        s.u = s.t * 31.82;
        s.cx = Math.cos(s.rx);
        s.sx = Math.sin(s.rx);
        s.cy = Math.cos(s.ry);
        s.sy = Math.sin(s.ry);
        s.cz = Math.cos(s.rz);
        s.sz = Math.sin(s.rz);
        s.pc = 0;
        s.hi = 1;
        s.cr = Math.sin(s.hu) * 0.5 + 0.5;
        s.cg = Math.sin(s.hu + 2.09) * 0.5 + 0.5;
        s.cb = Math.sin(s.hu + 4.18) * 0.5 + 0.5;
        s.w = width / Math.max(1, height);
        s.hp = 0;
        s.mx = 0;
        s.my = 2;
        s.hu = s.hu + 0.005 * s.mf;
        if (isBeat) {
            s.hu = s.hu + getOsc(0) * 10;
        }
    }

    function avsNeonPoint(pointIndex, renderedSampleCount) {
        var runtimePoint = runAvsNeonPointProgram(pointIndex, renderedSampleCount);
        if (runtimePoint) {
            return runtimePoint;
        }
        var s = avsNeonState;
        s.jx = s.kx;
        s.jz = s.kz;
        s.kx = s.ix;
        s.kz = s.iz;
        s.hi = -s.hi;
        s.hp = (s.hp + 1) % 3;

        var i = (pointIndex / Math.max(1, (renderedSampleCount || s.n) - 1)) * 31.82;
        var u1 = i;
        var u2 = 0;
        var pc = 0;
        var px = i * 0.5;
        var py = 0.5 - Math.cos(i * 1.25) * 0.5;
        var pz = 0;

        pc = eelBand(eelAbove(i, 1), eelBelow(i, 4.33));
        u1 = (i - 1) * s.tpi * 0.3;
        px = eelIf(pc, Math.sin(u1) * 0.5 + 0.5, px);
        py = eelIf(pc, 0.5 - Math.cos(i * 1.25) * 0.5, py);
        pz = eelIf(pc, Math.cos(u1) * 0.5 - 0.5, pz);

        pc = eelBand(eelAbove(i, 4.33), eelBelow(i, 5.02));
        u1 = i - 4.33;
        u2 = u1 * 1.33;
        px = eelIf(pc, -u1 * 0.5 + 0.5, px);
        py = eelIf(pc, 0.5 - Math.cos(i * 1.25) * 0.5, py);
        pz = eelIf(pc, -1, pz);

        pc = eelBand(eelAbove(i, 5.02), eelBelow(i, 9.46));
        u1 = (i - 5.02) * s.tpi * 0.45;
        px = eelIf(pc, -Math.sin(u1) * 0.4 + 0.155, px);
        py = eelIf(pc, 0.4 - 0.4 * Math.cos(u1), py);
        pz = eelIf(pc, -1 + u1 * 0.033, pz);

        pc = eelBand(eelAbove(i, 9.46), eelBelow(i, 10.96));
        u1 = i - 9.46;
        u2 = u1 * 0.6;
        px = eelIf(pc, -u1 * 0.5 + 0.155, px);
        py = eelIf(pc, 0.3 - Math.cos(u1) * 0.3, py);
        pz = eelIf(pc, -0.792 - (3 * sqr(u2) - 2 * sqr(u2) * u2) * 0.125, pz);

        pc = eelBand(eelAbove(i, 10.96), eelBelow(i, 13.26));
        u1 = i - 10.96;
        u2 = u1 * 0.6;
        px = eelIf(pc, -Math.sin(u1) * 0.4 - 0.59, px);
        py = eelIf(pc, 0.3 - Math.cos(u1 + 1.495) * 0.3, py);
        pz = eelIf(pc, -Math.cos(u1) * 0.4 - 0.514, pz);

        pc = eelBand(eelAbove(i, 13.26), eelBelow(i, 15.19));
        u1 = i - 13.26;
        u2 = u1 * 0.6;
        px = eelIf(pc, u1 * 0.35 - 0.89, px);
        py = eelIf(pc, 0.4 - Math.cos(u1 + 4.35) * 0.4, py);
        pz = eelIf(pc, u1 * 0.395 - 0.25, pz);

        pc = eelBand(eelAbove(i, 15.19), eelBelow(i, 19.18));
        u1 = (i - 15.19) * s.tpi * 0.5 - 0.84;
        u2 = (i - 15.19) * 0.2506;
        px = eelIf(pc, Math.cos(u1) * 0.35 - 0.45, px);
        py = eelIf(pc, (3 * sqr(u2) - 2 * sqr(u2) * u2) * 0.2, py);
        pz = eelIf(pc, Math.sin(u1) * 0.35 + 0.772, pz);

        pc = eelBand(eelAbove(i, 19.18), eelBelow(i, 25.62));
        u1 = -(i - 19.18) * s.tpi * 0.23 - 0.84 - 3.14;
        u2 = i - 19.18;
        px = eelIf(pc, Math.cos(u1) * 0.6 + 0.186, px);
        py = eelIf(pc, 0.25 + Math.cos(u2 * 1.94) * 0.15 - (Math.cos((i - 19.18) * 0.487) * 0.1 + 0.1), py);
        pz = eelIf(pc, Math.sin(u1) * 0.6 + 0.065, pz);

        pc = eelBand(eelAbove(i, 25.62), eelBelow(i, 27.26));
        u1 = i - 25.62;
        u2 = u1 * 0.6;
        px = eelIf(pc, -u1 * 0.35 - 0.238, px);
        py = eelIf(pc, 0.2 - Math.cos(u1 * 2 + 3.14) * 0.2, py);
        pz = eelIf(pc, u1 * 0.35 - 0.359, pz);

        pc = eelBand(eelAbove(i, 27.26), eelBelow(i, 29.75));
        u1 = (i - 27.26) * s.tpi * 0.5 + 0.78;
        u2 = i - 19.18;
        px = eelIf(pc, Math.cos(u1) * 0.33 - 1.049, px);
        py = eelIf(pc, 0, py);
        pz = eelIf(pc, Math.sin(u1) * 0.33 - 0.0135, pz);

        pc = eelAbove(i, 29.75);
        u1 = i - 29.75;
        u2 = u1 * 1.5;
        px = eelIf(pc, u1 * 0.5 - 1.04, px);
        py = eelIf(pc, 0, py);
        pz = eelIf(pc, -0.35 * (Math.cos(u2) * 0.5 + 0.5), pz);

        py = py * eelIf(s.mf - 4, -1, 1) + 0.5;
        px = px * eelIf(s.mf % 2, 1, -1);
        px = px * 0.1 + s.ix * 0.905;
        py = py * 0.1 + s.iy * 0.905;
        pz = pz * 0.1 + s.iz * 0.905;

        pc = eelBelow(i, s.u);
        s.oox = eelIf(pc, px, s.oox);
        s.ooy = eelIf(pc, py, s.ooy);
        s.ooz = eelIf(pc, pz, s.ooz);
        s.ix = px;
        s.iy = py;
        s.iz = pz;

        var red = eelBor(eelBelow(i, 5.02), eelAbove(i, 9.86));
        red = eelIf(red, Math.atan2(s.iz - s.kz, s.ix - s.kx), 3.14 * eelIf(s.mf % 2, 1, 0));
        u1 = Math.cos(red);
        u2 = Math.sin(red);
        var blue = -u2;
        var green = u1;
        u1 = s.ix + s.jx - s.kx * 2;
        u2 = s.iz + s.jz - s.kz * 2;
        s.by = (s.by * 7 - ((s.iz - s.jz) * u1 - (s.ix - s.jx) * u2) * 8000) * 0.125
                * eelIf(eelAbove(i, 30.82), 31.82 - i, 1);
        red = sqr(blue) + sqr(green);
        s.rrz = eelIf(pc, (Math.atan2(red, s.by) - 1.57) * eelIf(eelBelow(s.mf, 2), 1, -1), s.rrz);
        pc = s.hi * 0.04 / safeSqrt(red + sqr(s.by));
        px = px - s.ox + blue * pc;
        py = py - s.oy + s.by * pc;
        pz = pz - s.oz + green * pc;

        var x1 = px * s.cy + pz * s.sy;
        var z1 = pz * s.cy - px * s.sy;
        var y2 = py * s.cx + z1 * s.sx;
        var z2 = z1 * s.cx - py * s.sx;
        var x3 = x1 * s.cz + y2 * s.sz;
        var y3 = y2 * s.cz - x1 * s.sz + 0.08;
        u1 = eelIf(eelAbove(z2, 0.01), 1 / z2, 0);
        s.lx = s.gx;
        s.ly = s.gy;
        s.gx = s.mx;
        s.gy = s.my;
        s.mx = x3 * u1;
        s.my = eelIf(u1, y3 * u1, 4);

        var x = eelIf(s.hp - 1, eelIf(s.hp - 2, s.mx, s.gx), s.lx);
        var y = eelIf(s.hp - 1, eelIf(s.hp - 2, s.my, s.gy), s.ly);
        x = clamp(x, -1.1, 1.1) * 1.1;
        y = clamp(y, -1.1, 1.2) * s.w * 1.1;
        pc = eelIf(s.hp - 1, 1, 0);
        var bx = sign(u1) * eelBelow(Math.abs(s.gx - x) + Math.abs(s.gy - y), 0.99)
                * eelBelow(s.my, 2) * eelBelow(s.ly, 2);
        u1 = 1.1 - z2 * (0.9 + pc * 0.2) + pc * 0.3;
        u2 = Math.max(0, Math.sin(i * 0.114 * 200)) * 0.2 + Math.abs(getOsc(i * 0.03) * pc) * 2;
        return {
            x: x,
            y: y,
            r: clamp(bx * (u1 * s.cr + u2), 0, 1),
            g: clamp(bx * (u1 * s.cg + u2), 0, 1),
            b: clamp(bx * (u1 * s.cb + u2), 0, 1)
        };
    }

    function catmullRom(a, b, c, d, amount) {
        var t2 = amount * amount;
        var t3 = t2 * amount;
        return point(
                0.5 * ((2 * b.x) + (-a.x + c.x) * amount + (2 * a.x - 5 * b.x + 4 * c.x - d.x) * t2 + (-a.x + 3 * b.x - 3 * c.x + d.x) * t3),
                0.5 * ((2 * b.y) + (-a.y + c.y) * amount + (2 * a.y - 5 * b.y + 4 * c.y - d.y) * t2 + (-a.y + 3 * b.y - 3 * c.y + d.y) * t3),
                0.5 * ((2 * b.z) + (-a.z + c.z) * amount + (2 * a.z - 5 * b.z + 4 * c.z - d.z) * t2 + (-a.z + 3 * b.z - 3 * c.z + d.z) * t3)
        );
    }

    function coasterCenterAt(position) {
        var points = coasterControlPoints;
        var scaled = wrap01(position) * points.length;
        var index = Math.floor(scaled);
        var amount = scaled - index;
        var count = points.length;
        return catmullRom(
                points[(index + count - 1) % count],
                points[index % count],
                points[(index + 1) % count],
                points[(index + 2) % count],
                amount
        );
    }

    function coasterTangentAt(position) {
        return normalizePoint(subtractPoint(
                coasterCenterAt(position + 0.002),
                coasterCenterAt(position - 0.002)
        ));
    }

    function coasterRailPoint(position, side) {
        var center = coasterCenterAt(position);
        var tangent = coasterTangentAt(position);
        var railRight = crossPoint(tangent, point(0, 1, 0));
        if (dotPoint(railRight, railRight) < 0.0001) {
            railRight = crossPoint(tangent, point(0, 0, 1));
        }
        railRight = normalizePoint(railRight);
        return addPoint(center, scalePoint(railRight, side * 0.085));
    }

    function coasterCamera(position) {
        var camera = coasterCenterAt(position);
        var lookAt = coasterCenterAt(position + 0.024);
        camera.y += 0.055;
        var forward = normalizePoint(subtractPoint(lookAt, camera));
        var right = crossPoint(forward, point(0, 1, 0));
        if (dotPoint(right, right) < 0.0001) {
            right = point(1, 0, 0);
        } else {
            right = normalizePoint(right);
        }
        var up = normalizePoint(crossPoint(right, forward));
        return { position: camera, forward: forward, right: right, up: up };
    }

    function projectCoasterPoint(world, camera, width, height) {
        var relative = subtractPoint(world, camera.position);
        var z = dotPoint(relative, camera.forward);
        if (z < 0.055) {
            return null;
        }
        var x = dotPoint(relative, camera.right);
        var y = dotPoint(relative, camera.up);
        var focal = Math.min(width, height) * 0.82;
        return {
            x: width * 0.5 + x * focal / z,
            y: height * 0.56 - y * focal / z,
            z: z
        };
    }

    function coasterColor(sampleIndex, depth) {
        var hue = (visualTimeSeconds * 10 + sampleIndex * 2.7 + audio.mid * 38) % 360;
        var lightness = Math.max(34, Math.min(60, 44 + audio.rms * 12 + (1 - depth) * 12));
        return "hsla(" + hue + ", 84%, " + lightness + "%, 0.78)";
    }

    function drawCoasterLine(ctx, start, end, color, width, glowWidth) {
        if (!start || !end) {
            return;
        }
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 0.20;
        ctx.lineWidth = width + glowWidth;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        ctx.globalAlpha = 0.86;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    function drawCoasterPath(ctx, points, startIndex, endIndex, color, width, glowWidth) {
        if (endIndex - startIndex < 1) {
            return;
        }
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 0.17;
        ctx.lineWidth = width + glowWidth;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(points[startIndex].x, points[startIndex].y);
        for (var i = startIndex + 1; i <= endIndex; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.stroke();
        ctx.globalAlpha = 0.88;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(points[startIndex].x, points[startIndex].y);
        for (var j = startIndex + 1; j <= endIndex; j++) {
            ctx.lineTo(points[j].x, points[j].y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    function smootherStep(amount) {
        var t = Math.max(0, Math.min(1, amount));
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    function coasterRideSample(progress, width, height, time) {
        var far = smootherStep(progress);
        var near = 1 - progress;
        var curve = Math.sin(time * 0.40 + progress * 3.1) * 0.22
                + Math.sin(time * 0.18 + progress * 7.2 + 1.3) * 0.07;
        var lift = Math.sin(time * 0.30 + progress * 4.4 + 0.6) * 0.11
                + Math.sin(time * 0.15 + progress * 9.0) * 0.05;
        var bank = (Math.sin(time * 0.34 + progress * 4.8) * 0.62
                + Math.sin(time * 0.16 + progress * 8.4 + 1.8) * 0.18) * far;
        var centerX = width * (0.5 + curve * far);
        var centerY = height * (1.08 - far * 0.70 + lift * far);
        var trackWidth = width * (0.62 * Math.pow(near, 1.80) + 0.030);
        var railX = Math.cos(bank) * trackWidth * 0.5;
        var railY = Math.sin(bank) * trackWidth * 0.5;
        return {
            center: { x: centerX, y: centerY, z: progress },
            left: { x: centerX - railX, y: centerY - railY, z: progress },
            right: { x: centerX + railX, y: centerY + railY, z: progress },
            bank: bank
        };
    }

    function drawCoasterPointGlow(ctx, point, color, radius) {
        ctx.globalAlpha = 0.20;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius * 2.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.86;
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    function writeAvsNeonVertex(offset, x, y, r, g, b, a) {
        avsNeonVertices[offset] = x;
        avsNeonVertices[offset + 1] = y;
        avsNeonVertices[offset + 2] = r;
        avsNeonVertices[offset + 3] = g;
        avsNeonVertices[offset + 4] = b;
        avsNeonVertices[offset + 5] = a;
    }

    function avsPixelToClipX(x) {
        return (x * 2 / Math.max(1, canvas.width)) - 1;
    }

    function avsPixelToClipY(y) {
        return 1 - (y * 2 / Math.max(1, canvas.height));
    }

    function addAvsLineQuad(vertexCount, x1, y1, x2, y2, x3, y3, x4, y4, color) {
        var offset = vertexCount * 6;
        writeAvsNeonVertex(offset, avsPixelToClipX(x1), avsPixelToClipY(y1), color.r, color.g, color.b, color.a);
        writeAvsNeonVertex(offset + 6, avsPixelToClipX(x2), avsPixelToClipY(y2), color.r, color.g, color.b, color.a);
        writeAvsNeonVertex(offset + 12, avsPixelToClipX(x3), avsPixelToClipY(y3), color.r, color.g, color.b, color.a);
        writeAvsNeonVertex(offset + 18, avsPixelToClipX(x3), avsPixelToClipY(y3), color.r, color.g, color.b, color.a);
        writeAvsNeonVertex(offset + 24, avsPixelToClipX(x2), avsPixelToClipY(y2), color.r, color.g, color.b, color.a);
        writeAvsNeonVertex(offset + 30, avsPixelToClipX(x4), avsPixelToClipY(y4), color.r, color.g, color.b, color.a);
        return vertexCount + 6;
    }

    function addAvsNeonSegment(vertexCount, start, end) {
        var x1 = Math.trunc((start.x + 1) * canvas.width * 0.5);
        var y1 = Math.trunc((start.y + 1) * canvas.height * 0.5);
        var x2 = Math.trunc((end.x + 1) * canvas.width * 0.5);
        var y2 = Math.trunc((end.y + 1) * canvas.height * 0.5);
        var dx = Math.abs(x2 - x1);
        var dy = Math.abs(y2 - y1);
        if (!dx && !dy) {
            return vertexCount;
        }

        var lw2 = Math.floor(avsNeonLineWidthPx / 2);
        var color = {
            r: end.r,
            g: end.g,
            b: end.b,
            a: end.a
        };
        if (!dx) {
            return addAvsLineQuad(vertexCount, x1 - lw2, y1, x1 - lw2 + avsNeonLineWidthPx, y1,
                    x2 - lw2, y2, x2 - lw2 + avsNeonLineWidthPx, y2, color);
        }
        if (!dy) {
            return addAvsLineQuad(vertexCount, x1, y1 - lw2, x2, y2 - lw2,
                    x1, y1 - lw2 + avsNeonLineWidthPx, x2, y2 - lw2 + avsNeonLineWidthPx, color);
        }
        if (dy <= dx) {
            return addAvsLineQuad(vertexCount, x1, y1 - lw2, x2, y2 - lw2,
                    x1, y1 - lw2 + avsNeonLineWidthPx, x2, y2 - lw2 + avsNeonLineWidthPx, color);
        }
        return addAvsLineQuad(vertexCount, x1 - lw2, y1, x2 - lw2, y2,
                x1 - lw2 + avsNeonLineWidthPx, y1, x2 - lw2 + avsNeonLineWidthPx, y2, color);
    }

    function renderNeonCoaster(now) {
        if (!lineProgram || !lineBuffer) {
            return;
        }
        updateAvsNeonFrame(now, canvas.width, canvas.height);
        var count = avsNeonEelScope
                ? Math.min(avsNeonState.n, avsNeonInterpretedSampleCap)
                : avsNeonState.n;
        var vertexCount = 0;
        var previous = null;
        for (var i = 0; i < count; i++) {
            var vertex = avsNeonPoint(i, count);
            var alpha = Math.max(vertex.r, vertex.g, vertex.b) > 0 ? 0.96 : 0;
            if (previous && previous.a > 0 && alpha > 0) {
                var distance = Math.abs(previous.x - vertex.x) + Math.abs(previous.y - vertex.y);
                if (distance < 1.4) {
                    vertexCount = addAvsNeonSegment(vertexCount, previous, {
                        x: vertex.x,
                        y: vertex.y,
                        r: vertex.r,
                        g: vertex.g,
                        b: vertex.b,
                        a: alpha
                    });
                }
            }
            previous = {
                x: vertex.x,
                y: vertex.y,
                r: vertex.r,
                g: vertex.g,
                b: vertex.b,
                a: alpha
            };
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(lineProgram);
        gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
        gl.enableVertexAttribArray(lineLocations.position);
        gl.vertexAttribPointer(lineLocations.position, 2, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(lineLocations.color);
        gl.vertexAttribPointer(lineLocations.color, 4, gl.FLOAT, false, 24, 8);

        if (!avsNeonFrameStarted) {
            gl.clearColor(0, 0, 0, 1);
            gl.clear(gl.COLOR_BUFFER_BIT);
            avsNeonFrameStarted = true;
        } else {
            gl.bufferData(gl.ARRAY_BUFFER, avsFadeVertices, gl.STATIC_DRAW);
            gl.enable(gl.BLEND);
            gl.blendEquation(gl.FUNC_ADD);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
        }

        gl.bufferData(gl.ARRAY_BUFFER, avsNeonVertices, gl.DYNAMIC_DRAW);
        gl.enable(gl.BLEND);
        gl.blendEquation(avsNeonBlendMode === "maximum" ? gl.MAX : gl.FUNC_ADD);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
        gl.blendEquation(gl.FUNC_ADD);
        gl.disable(gl.BLEND);
    }

    function compileShader(type, source) {
        var shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            var message = gl.getShaderInfoLog(shader) || "unknown shader error";
            gl.deleteShader(shader);
            throw new Error(message);
        }
        return shader;
    }

    function createLinkedProgram(vertexProgramSource, fragmentProgramSource) {
        var vertexShader = compileShader(gl.VERTEX_SHADER, vertexProgramSource);
        var fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentProgramSource);
        var linkedProgram = gl.createProgram();
        gl.attachShader(linkedProgram, vertexShader);
        gl.attachShader(linkedProgram, fragmentShader);
        gl.linkProgram(linkedProgram);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        if (!gl.getProgramParameter(linkedProgram, gl.LINK_STATUS)) {
            var message = gl.getProgramInfoLog(linkedProgram) || "unknown program error";
            gl.deleteProgram(linkedProgram);
            throw new Error(message);
        }
        return linkedProgram;
    }

    function createProgram() {
        return createLinkedProgram(vertexSource, fragmentSource);
    }

    function createLineProgram() {
        return createLinkedProgram(lineVertexSource, lineFragmentSource);
    }

    function resize() {
        var ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        var width = Math.max(320, Math.floor(window.innerWidth * ratio));
        var height = Math.max(180, Math.floor(window.innerHeight * ratio));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
            avsNeonFrameStarted = false;
            if (gl) {
                gl.viewport(0, 0, width, height);
            }
        }
        if (coasterCanvas) {
            var coasterScale = Math.min(1, coasterMaxWidth / width, coasterMaxHeight / height);
            var coasterWidth = Math.max(320, Math.floor(width * coasterScale));
            var coasterHeight = Math.max(180, Math.floor(height * coasterScale));
            if (coasterCanvas.width !== coasterWidth || coasterCanvas.height !== coasterHeight) {
                coasterCanvas.width = coasterWidth;
                coasterCanvas.height = coasterHeight;
            }
        }
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

    function updateAudioTargetsFromWaveform(bytes) {
        if (!bytes || bytes.length === 0) {
            return false;
        }

        var sum = 0;
        var bassSum = 0;
        var midSum = 0;
        var trebSum = 0;
        var low = 0;
        var last = 0;
        for (var i = 0; i < audioSize; i++) {
            var sourceIndex = Math.min(bytes.length - 1, Math.floor(i * bytes.length / audioSize));
            var sample = ((bytes[sourceIndex] & 255) - 128) / 128;
            waveformSamples[i] = sample;
            low = low * 0.94 + sample * 0.06;
            var mid = sample - low;
            sum += sample * sample;
            bassSum += Math.abs(low);
            midSum += Math.abs(mid);
            trebSum += Math.abs(sample - last);
            last = sample;
        }

        audio.targetRms = Math.min(1, Math.sqrt(sum / audioSize) * 1.65);
        audio.targetBass = Math.min(1, bassSum / audioSize * 3.4);
        audio.targetMid = Math.min(1, midSum / audioSize * 2.8);
        audio.targetTreb = Math.min(1, trebSum / audioSize * 4.2);
        return true;
    }

    function updateSyntheticTargets(now) {
        var t = now * 0.001;
        audio.targetRms = 0.30 + 0.18 * Math.sin(t * 1.30);
        audio.targetBass = 0.42 + 0.28 * Math.max(0, Math.sin(t * 2.20));
        audio.targetMid = 0.32 + 0.22 * Math.sin(t * 1.70 + 1.4);
        audio.targetTreb = 0.28 + 0.18 * Math.sin(t * 5.40);
        for (var i = 0; i < waveformSamples.length; i++) {
            var phase = i / waveformSamples.length;
            waveformSamples[i] = Math.sin(t * 2.2 + phase * Math.PI * 2) * 0.32
                    + Math.sin(t * 4.7 + phase * Math.PI * 8) * 0.10;
        }
    }

    function smoothAudio() {
        audio.rms += (audio.targetRms - audio.rms) * 0.16;
        audio.bass += (audio.targetBass - audio.bass) * 0.18;
        audio.mid += (audio.targetMid - audio.mid) * 0.14;
        audio.treb += (audio.targetTreb - audio.treb) * 0.22;
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

    function copyPreset(preset) {
        return {
            name: preset.name,
            mode: preset.mode || "tunnel",
            shape: preset.shape,
            turn: preset.turn,
            twist: preset.twist,
            speed: preset.speed,
            ribs: preset.ribs,
            spokes: preset.spokes,
            beam: preset.beam,
            intensity: preset.intensity,
            colorA: preset.colorA.slice(),
            colorB: preset.colorB.slice(),
            colorC: preset.colorC.slice()
        };
    }

    function lerp(from, to, amount) {
        return from + (to - from) * amount;
    }

    function smoothstepValue(amount) {
        var t = Math.max(0, Math.min(1, amount));
        return t * t * (3 - 2 * t);
    }

    function lerpColor(output, from, to, amount) {
        output[0] = lerp(from[0], to[0], amount);
        output[1] = lerp(from[1], to[1], amount);
        output[2] = lerp(from[2], to[2], amount);
    }

    function updateDisplayedPreset(now) {
        if (!transitionFrom || !transitionTo) {
            return displayedPreset;
        }

        var amount = smoothstepValue((now - transitionStartAt) / transitionDurationMs);
        displayedPreset.shape = lerp(transitionFrom.shape, transitionTo.shape, amount);
        displayedPreset.turn = lerp(transitionFrom.turn, transitionTo.turn, amount);
        displayedPreset.twist = lerp(transitionFrom.twist, transitionTo.twist, amount);
        displayedPreset.speed = lerp(transitionFrom.speed, transitionTo.speed, amount);
        displayedPreset.ribs = lerp(transitionFrom.ribs, transitionTo.ribs, amount);
        displayedPreset.spokes = lerp(transitionFrom.spokes, transitionTo.spokes, amount);
        displayedPreset.beam = lerp(transitionFrom.beam, transitionTo.beam, amount);
        displayedPreset.intensity = lerp(transitionFrom.intensity, transitionTo.intensity, amount);
        lerpColor(displayedPreset.colorA, transitionFrom.colorA, transitionTo.colorA, amount);
        lerpColor(displayedPreset.colorB, transitionFrom.colorB, transitionTo.colorB, amount);
        lerpColor(displayedPreset.colorC, transitionFrom.colorC, transitionTo.colorC, amount);

        if (amount >= 1) {
            transitionFrom = null;
            transitionTo = null;
        }
        return displayedPreset;
    }

    function applyPresetUniforms(now) {
        var preset = updateDisplayedPreset(now);
        gl.uniform2f(locations.resolution, canvas.width, canvas.height);
        gl.uniform1f(locations.time, visualTimeSeconds);
        gl.uniform4f(locations.audio, audio.rms, audio.bass, audio.mid, audio.treb);
        gl.uniform4f(locations.motion, preset.shape, preset.turn, preset.twist, preset.speed);
        gl.uniform4f(locations.grid, preset.ribs, preset.spokes, preset.beam, preset.intensity);
        gl.uniform3f(locations.colorA, preset.colorA[0], preset.colorA[1], preset.colorA[2]);
        gl.uniform3f(locations.colorB, preset.colorB[0], preset.colorB[1], preset.colorB[2]);
        gl.uniform3f(locations.colorC, preset.colorC[0], preset.colorC[1], preset.colorC[2]);
    }

    function render(now) {
        if (!running || !gl || !program) {
            return;
        }

        resize();
        var deltaMs = 0;
        if (lastFrameAt > 0) {
            deltaMs = now - lastFrameAt;
            frameTimes.push(deltaMs);
            if (!paused) {
                visualTimeSeconds += Math.max(0, Math.min(maxVisualDeltaMs, deltaMs)) * 0.001 * globalTimeScale;
            }
        }
        lastFrameAt = now;

        if (!paused && now - lastAudioTimestampMs > 500) {
            updateSyntheticTargets(now);
        }
        if (!paused) {
            smoothAudio();
        }

        var useCoaster = isCoasterPreset();
        setCoasterVisible(false);
        if (useCoaster) {
            try {
                renderNeonCoaster(now);
            } catch (exception) {
                running = false;
                safeBridge("reportError", "coaster_render_failed:" + exception.message);
                return;
            }
            reportMetrics(now);
            window.requestAnimationFrame(render);
            return;
        }

        try {
            gl.useProgram(program);
            bindTunnelGeometry();
            applyPresetUniforms(now);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
        } catch (exception) {
            running = false;
            safeBridge("reportError", "tunnel_render_failed:" + exception.message);
            return;
        }

        reportMetrics(now);
        window.requestAnimationFrame(render);
    }

    function randomPresetIndex() {
        if (presets.length <= 1) {
            return presetIndex;
        }
        var next = presetIndex;
        while (next === presetIndex) {
            next = Math.floor(Math.random() * presets.length);
        }
        return next;
    }

    function selectPreset(direction) {
        var nextIndex = presetIndex;
        if (direction === "previous") {
            nextIndex = (presetIndex + presets.length - 1) % presets.length;
        } else if (direction === "next") {
            nextIndex = (presetIndex + 1) % presets.length;
        } else if (direction === "random") {
            nextIndex = randomPresetIndex();
        }

        if (nextIndex === presetIndex) {
            return;
        }
        updateDisplayedPreset(performance.now());
        transitionFrom = copyPreset(displayedPreset);
        transitionTo = copyPreset(presets[nextIndex]);
        transitionStartAt = performance.now();
        presetIndex = nextIndex;
        if (presets[presetIndex].mode === "coaster") {
            resetAvsNeonState();
        }
        updatePresetOverlay();
    }

    function togglePaused() {
        paused = !paused;
        updatePresetOverlay();
        safeBridge("reportEvent", paused ? "visualizer_paused" : "visualizer_resumed");
    }

    function initGeometry() {
        quadBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,
            1, -1,
            -1, 1,
            -1, 1,
            1, -1,
            1, 1
        ]), gl.STATIC_DRAW);
        quadPositionLocation = gl.getAttribLocation(program, "a_position");
        gl.enableVertexAttribArray(quadPositionLocation);
        gl.vertexAttribPointer(quadPositionLocation, 2, gl.FLOAT, false, 0, 0);
    }

    function bindTunnelGeometry() {
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        gl.enableVertexAttribArray(quadPositionLocation);
        gl.vertexAttribPointer(quadPositionLocation, 2, gl.FLOAT, false, 0, 0);
    }

    function initLineGeometry() {
        lineBuffer = gl.createBuffer();
        lineLocations.position = gl.getAttribLocation(lineProgram, "a_position");
        lineLocations.color = gl.getAttribLocation(lineProgram, "a_color");
    }

    function initLocations() {
        locations.resolution = gl.getUniformLocation(program, "u_resolution");
        locations.time = gl.getUniformLocation(program, "u_time");
        locations.audio = gl.getUniformLocation(program, "u_audio");
        locations.motion = gl.getUniformLocation(program, "u_motion");
        locations.grid = gl.getUniformLocation(program, "u_grid");
        locations.colorA = gl.getUniformLocation(program, "u_colorA");
        locations.colorB = gl.getUniformLocation(program, "u_colorB");
        locations.colorC = gl.getUniformLocation(program, "u_colorC");
    }

    function init() {
        try {
            gl = canvas.getContext("webgl2", {
                alpha: false,
                antialias: false,
                depth: false,
                stencil: false,
                premultipliedAlpha: false,
                preserveDrawingBuffer: true
            });
            if (!gl) {
                safeBridge("reportWebGl", false);
                safeBridge("reportError", "tunnel_webgl2_unavailable");
                return;
            }

            safeBridge("reportWebGl", true);
            resize();
            program = createProgram();
            lineProgram = createLineProgram();
            gl.useProgram(program);
            initGeometry();
            initLineGeometry();
            initLocations();
            gl.disable(gl.DEPTH_TEST);
            gl.disable(gl.CULL_FACE);

            running = true;
            var now = performance.now();
            metricsStartAt = now;
            warmupUntil = now + 10000;
            lastFrameAt = 0;
            visualTimeSeconds = 0;
            updateSyntheticTargets(now);
            updatePresetOverlay();
            window.requestAnimationFrame(render);
            safeBridge("reportReady");
        } catch (exception) {
            safeBridge("reportError", "tunnel_init_failed:" + exception.message);
        }
    }

    window.braviaVisualizer = {
        consumeAudio: function (timestampMs, base64, mode) {
            var applied = false;
            if (mode === "real" && base64) {
                applied = updateAudioTargetsFromWaveform(decodeBase64(base64));
            }
            if (!applied) {
                updateSyntheticTargets(performance.now());
            }
            lastAudioTimestampMs = Math.max(0, Number(timestampMs) || 0);
            if (lastAudioTimestampMs > 0) {
                safeBridge("reportAudioFrameConsumed", lastAudioTimestampMs);
            }
        },
        selectPreset: selectPreset,
        togglePaused: togglePaused
    };

    window.addEventListener("click", function () {
        togglePaused();
    });
    window.addEventListener("resize", resize);
    init();
}());
