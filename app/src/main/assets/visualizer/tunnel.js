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
    var avsNeonSlots = null;
    var avsNeonFastSlotsReady = false;
    var avsNeonRuntimeFailed = false;
    var gl = null;
    var program = null;
    var quadBuffer = null;
    var quadPositionLocation = -1;
    var lineProgram = null;
    var lineBuffer = null;
    var lineLocations = {};
    var avsCopyProgram = null;
    var avsCopyLocations = {};
    var avsBlendProgram = null;
    var avsBlendLocations = {};
    var avsWarpProgram = null;
    var avsWarpLocations = {};
    var avsWarpBuffer = null;
    var avsWarpVertices = new Float32Array(32 * 32 * 6 * 5);
    var avsWarpMap = new Float32Array(33 * 33 * 3);
    var avsFeedbackProgram = null;
    var avsFeedbackLocations = {};
    var avsColorFadeProgram = null;
    var avsColorFadeLocations = {};
    var avsFramebufferState = null;
    var running = false;
    var paused = false;
    var renderScaleOverride = readRenderScaleOverride();
    var lastReportedRenderScale = 0;
    var lastFrameAt = 0;
    var metricsStartAt = 0;
    var warmupUntil = 0;
    var frameTimes = [];
    var presetIndex = 0;
    var audioSize = 1024;
    var spectrumSize = 128;
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
    var spectrumSamples = new Float32Array(spectrumSize);
    var spectrumTargets = new Float32Array(spectrumSize);
    var spectrumRawTargets = new Float32Array(spectrumSize);
    var spectrumCeiling = 0.18;
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
    var avsNeonHost = null;
    var avsNeonPointScratch = new Float32Array(6);
    var avsNeonPreviousScratch = new Float32Array(6);
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
    var avsStackPresetId = "";
    var avsStackRuntime = null;
    var avsStackRuntimeFailed = false;
    var avsStackFrameStarted = false;
    var avsStackBeatAverage = 0.18;
    var avsStackLastBeatAt = 0;
    var avsStackVertices = new Float32Array(480 * 6 * 6);
    var avsStackPointScratch = new Float32Array(6);
    var avsStackPreviousScratch = new Float32Array(6);
    var avsStackBaseScratch = { x: 0, y: 0, r: 0, d: 0 };

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
            name: avsPresetDefinitions.containment ? avsPresetDefinitions.containment.displayName : "UnConeD Containment",
            mode: "avs",
            avsPresetId: "containment",
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
            name: avsPresetDefinitions.speeder3K ? avsPresetDefinitions.speeder3K.displayName : "UnConeD Speeder 3K",
            mode: "avs",
            avsPresetId: "speeder3K",
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
            name: avsPresetDefinitions.zeroGMazeII ? avsPresetDefinitions.zeroGMazeII.displayName : "UnConeD Zero-G Maze II",
            mode: "avs",
            avsPresetId: "zeroGMazeII",
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
            name: avsPresetDefinitions.zeroGMazeIII ? avsPresetDefinitions.zeroGMazeIII.displayName : "UnConeD Zero-G Maze III",
            mode: "avs",
            avsPresetId: "zeroGMazeIII",
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

    var avsCopyFragmentSource = "#version 300 es\n"
        + "precision mediump float;\n"
        + "in vec2 v_uv;\n"
        + "uniform sampler2D u_texture;\n"
        + "uniform float u_opacity;\n"
        + "uniform float u_gain;\n"
        + "out vec4 outColor;\n"
        + "void main() {\n"
        + "    vec4 color = texture(u_texture, v_uv);\n"
        + "    outColor = vec4(color.rgb * u_gain, color.a * u_opacity);\n"
        + "}\n";

    var avsBlendFragmentSource = "#version 300 es\n"
        + "precision highp float;\n"
        + "in vec2 v_uv;\n"
        + "uniform sampler2D u_source;\n"
        + "uniform sampler2D u_destination;\n"
        + "uniform vec2 u_resolution;\n"
        + "uniform float u_mode;\n"
        + "uniform float u_adjust;\n"
        + "out vec4 outColor;\n"
        + "vec3 clampColor(vec3 value) {\n"
        + "    return clamp(value, vec3(0.0), vec3(1.0));\n"
        + "}\n"
        + "void main() {\n"
        + "    vec4 source = texture(u_source, v_uv);\n"
        + "    vec4 destination = texture(u_destination, v_uv);\n"
        + "    vec3 result = source.rgb;\n"
        + "    if (u_mode < 0.5) {\n"
        + "        result = source.rgb;\n"
        + "    } else if (u_mode < 1.5) {\n"
        + "        result = (destination.rgb + source.rgb) * 0.5;\n"
        + "    } else if (u_mode < 2.5) {\n"
        + "        result = clampColor(destination.rgb + source.rgb);\n"
        + "    } else if (u_mode < 3.5) {\n"
        + "        vec2 pixel = floor(v_uv * u_resolution);\n"
        + "        result = mod(pixel.x + pixel.y, 2.0) < 1.0 ? source.rgb : destination.rgb;\n"
        + "    } else if (u_mode < 4.5) {\n"
        + "        result = clampColor(destination.rgb - source.rgb);\n"
        + "    } else if (u_mode < 5.5) {\n"
        + "        vec2 pixel = floor(v_uv * u_resolution);\n"
        + "        result = mod(pixel.y, 2.0) < 1.0 ? source.rgb : destination.rgb;\n"
        + "    } else if (u_mode < 6.5) {\n"
        + "        result = abs(destination.rgb - source.rgb);\n"
        + "    } else if (u_mode < 7.5) {\n"
        + "        result = max(destination.rgb, source.rgb);\n"
        + "    } else if (u_mode < 8.5) {\n"
        + "        result = min(destination.rgb, source.rgb);\n"
        + "    } else if (u_mode < 9.5) {\n"
        + "        result = clampColor(source.rgb - destination.rgb);\n"
        + "    } else if (u_mode < 10.5) {\n"
        + "        result = destination.rgb * source.rgb;\n"
        + "    } else {\n"
        + "        float alpha = clamp(u_adjust / 255.0, 0.0, 1.0);\n"
        + "        result = mix(destination.rgb, source.rgb, alpha);\n"
        + "    }\n"
        + "    outColor = vec4(result, max(source.a, destination.a));\n"
        + "}\n";

    var avsWarpVertexSource = "#version 300 es\n"
        + "in vec2 a_position;\n"
        + "in vec2 a_uv;\n"
        + "in float a_alpha;\n"
        + "out vec2 v_uv;\n"
        + "out vec2 v_screenUv;\n"
        + "out float v_alpha;\n"
        + "void main() {\n"
        + "    v_uv = a_uv;\n"
        + "    v_screenUv = a_position * 0.5 + 0.5;\n"
        + "    v_alpha = a_alpha;\n"
        + "    gl_Position = vec4(a_position, 0.0, 1.0);\n"
        + "}\n";

    var avsWarpFragmentSource = "#version 300 es\n"
        + "precision highp float;\n"
        + "in vec2 v_uv;\n"
        + "in vec2 v_screenUv;\n"
        + "in float v_alpha;\n"
        + "uniform sampler2D u_source;\n"
        + "uniform sampler2D u_destination;\n"
        + "uniform float u_blend;\n"
        + "out vec4 outColor;\n"
        + "void main() {\n"
        + "    vec4 moved = texture(u_source, clamp(v_uv, vec2(0.0), vec2(1.0)));\n"
        + "    vec4 base = texture(u_destination, v_screenUv);\n"
        + "    float alpha = clamp(v_alpha, 0.0, 1.0);\n"
        + "    outColor = u_blend > 0.5 ? mix(base, moved, alpha) : moved;\n"
        + "}\n";

    var avsFeedbackFragmentSource = "#version 300 es\n"
        + "precision highp float;\n"
        + "in vec2 v_uv;\n"
        + "uniform sampler2D u_texture;\n"
        + "uniform vec2 u_resolution;\n"
        + "uniform float u_mode;\n"
        + "uniform float u_amount;\n"
        + "uniform float u_time;\n"
        + "uniform vec4 u_audio;\n"
        + "out vec4 outColor;\n"
        + "float hash(vec2 value) {\n"
        + "    return fract(sin(dot(value, vec2(127.1, 311.7))) * 43758.5453123);\n"
        + "}\n"
        + "void main() {\n"
        + "    vec2 uv = v_uv;\n"
        + "    vec2 aspect = vec2(u_resolution.x / max(1.0, u_resolution.y), 1.0);\n"
        + "    vec2 centered = (uv - 0.5) * aspect;\n"
        + "    if (u_mode < 1.5) {\n"
        + "        float radius = length(centered) + 0.0001;\n"
        + "        float wave = sin(radius * 58.0 - u_time * 4.2) * 0.5 + 0.5;\n"
        + "        vec2 direction = centered / radius / aspect;\n"
        + "        uv += direction * wave * u_amount * (0.012 + u_audio.y * 0.006);\n"
        + "    } else if (u_mode < 2.5) {\n"
        + "        vec2 pixel = floor(uv * u_resolution);\n"
        + "        if (pixel.y >= 4.0 && pixel.y < u_resolution.y - 4.0) {\n"
        + "            vec2 randomOffset = floor(vec2(hash(pixel + u_time), hash(pixel + 17.0 + u_time)) * 7.0) - 3.0;\n"
        + "            uv = (pixel + randomOffset * max(0.0, u_amount) + 0.5) / max(u_resolution, vec2(1.0));\n"
        + "        }\n"
        + "    } else {\n"
        + "        float pulse = 1.0 + u_amount * (0.012 + u_audio.x * 0.008);\n"
        + "        float turn = u_amount * 0.006 * sin(u_time * 0.7);\n"
        + "        mat2 rotation = mat2(cos(turn), -sin(turn), sin(turn), cos(turn));\n"
        + "        uv = ((rotation * ((uv - 0.5) / pulse)) + 0.5);\n"
        + "    }\n"
        + "    outColor = texture(u_texture, clamp(uv, vec2(0.0), vec2(1.0)));\n"
        + "}\n";

    var avsColorFadeFragmentSource = "#version 300 es\n"
        + "precision highp float;\n"
        + "in vec2 v_uv;\n"
        + "uniform sampler2D u_texture;\n"
        + "uniform vec3 u_faders;\n"
        + "out vec4 outColor;\n"
        + "void main() {\n"
        + "    vec4 source = texture(u_texture, v_uv);\n"
        + "    vec3 rgb = source.rgb * 255.0;\n"
        + "    float r = rgb.r;\n"
        + "    float g = rgb.g;\n"
        + "    float b = rgb.b;\n"
        + "    float fs1 = u_faders.x;\n"
        + "    float fs2 = u_faders.y;\n"
        + "    float fs3 = u_faders.z;\n"
        + "    vec3 delta;\n"
        + "    if (g > b && g > r) {\n"
        + "        delta = vec3(fs3, fs2, fs1);\n"
        + "    } else if (r > b && r > g) {\n"
        + "        delta = vec3(fs2, fs1, fs3);\n"
        + "    } else if (b > g && b > r) {\n"
        + "        delta = vec3(fs1, fs3, fs2);\n"
        + "    } else {\n"
        + "        delta = vec3(fs3);\n"
        + "    }\n"
        + "    outColor = vec4(clamp(rgb + delta, 0.0, 255.0) / 255.0, source.a);\n"
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

    function parseScaleValue(value) {
        var scale = Number(value);
        if (!isFinite(scale) || scale <= 0) {
            return 0;
        }
        return Math.max(0.5, Math.min(2, scale));
    }

    function readRenderScaleOverride() {
        try {
            if (window.location && window.location.search) {
                var params = new URLSearchParams(window.location.search);
                var scale = parseScaleValue(params.get("renderScale"));
                if (scale > 0) {
                    return scale;
                }
            }
        } catch (ignored) {
        }
        return 0;
    }

    function currentRenderScale() {
        var baseScale = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        if (renderScaleOverride > 0) {
            return Math.max(0.5, Math.min(4, baseScale * renderScaleOverride));
        }
        return baseScale;
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

    function isAvsPreset() {
        return presets[presetIndex].mode === "avs";
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

    function frequencyCurve(position) {
        var clamped = clamp(position, 0, 1);
        var curve = Math.pow(2, clamped * 3.6) - 1;
        return curve / (Math.pow(2, 3.6) - 1);
    }

    function signedByte(value) {
        return value > 127 ? value - 256 : value;
    }

    function fftMagnitude(bytes, bin) {
        var realIndex = Math.min(bytes.length - 1, bin * 2);
        var imagIndex = Math.min(bytes.length - 1, bin * 2 + 1);
        return Math.min(1.6, Math.hypot(signedByte(bytes[realIndex]), signedByte(bytes[imagIndex])) / 128);
    }

    function smoothSpectrumTargets() {
        for (var index = 0; index < spectrumSamples.length; index++) {
            var target = spectrumTargets[index];
            var previous = spectrumSamples[index];
            var smoothing = target > previous ? 0.64 : 0.26;
            spectrumSamples[index] = previous + (target - previous) * smoothing;
        }
    }

    function getSpec(position, band, channel) {
        if (!spectrumSamples || spectrumSamples.length === 0) {
            return 0;
        }
        var samplePosition = wrap01(position);
        var width = Math.max(0, Math.min(0.5, Math.abs(band || 0)));
        if (width < 0.001) {
            var index = clamp(Math.round(samplePosition * (spectrumSamples.length - 1)),
                    0, spectrumSamples.length - 1);
            return spectrumSamples[index] || 0;
        }

        var center = samplePosition * (spectrumSamples.length - 1);
        var radius = Math.max(1, Math.round(width * spectrumSamples.length));
        var sum = 0;
        var weightSum = 0;
        for (var offset = -radius; offset <= radius; offset++) {
            var readIndex = clamp(Math.round(center + offset), 0, spectrumSamples.length - 1);
            var weight = 1 - Math.abs(offset) / (radius + 1);
            sum += (spectrumSamples[readIndex] || 0) * weight;
            weightSum += weight;
        }
        return weightSum > 0 ? sum / weightSum : 0;
    }

    function avsSpectrumByte(index, maxIndex, channel) {
        var position = maxIndex <= 0 ? 0 : index / maxIndex;
        return clamp(Math.round(getSpec(position, 0.003, channel) * 255), 0, 255);
    }

    function avsWaveSigned(index, maxIndex, channel) {
        var position = maxIndex <= 0 ? 0 : index / maxIndex;
        return clamp(getOsc(position), -1, 1);
    }

    function interpolateAvsSpectrumByte(position, maxIndex, channel) {
        var left = Math.floor(position);
        var amount = position - left;
        var right = Math.min(maxIndex, left + 1);
        return avsSpectrumByte(left, maxIndex, channel) * (1 - amount)
                + avsSpectrumByte(right, maxIndex, channel) * amount;
    }

    function interpolateAvsWaveSigned(position, maxIndex, channel) {
        var left = Math.floor(position);
        var amount = position - left;
        var right = Math.min(maxIndex, left + 1);
        return avsWaveSigned(left, maxIndex, channel) * (1 - amount)
                + avsWaveSigned(right, maxIndex, channel) * amount;
    }

    function defaultAvsLineMode() {
        return {
            blendMode: "replace",
            lineWidth: 1
        };
    }

    function cloneAvsLineMode(mode) {
        var source = mode || defaultAvsLineMode();
        return {
            blendMode: source.blendMode || "maximum",
            lineWidth: Math.max(1, Math.min(64, Math.round(source.lineWidth || 2)))
        };
    }

    function normalizeAvsSampleCount(value, fallback) {
        var count = Math.round(Number(value) || 0);
        if (count <= 0) {
            count = fallback || 64;
        }
        return Math.max(1, Math.min(1024, count));
    }

    function setAvsFadeAlpha(alpha) {
        setAvsFadeColor(0, 0, 0, alpha);
    }

    function setAvsFadeColor(red, green, blue, alpha) {
        for (var index = 2; index < avsFadeVertices.length; index += 6) {
            avsFadeVertices[index] = red;
            avsFadeVertices[index + 1] = green;
            avsFadeVertices[index + 2] = blue;
        }
        for (var index = 5; index < avsFadeVertices.length; index += 6) {
            avsFadeVertices[index] = alpha;
        }
    }

    function createAvsRenderTarget(width, height) {
        var texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

        var framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            gl.deleteFramebuffer(framebuffer);
            gl.deleteTexture(texture);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            return null;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return {
            texture: texture,
            framebuffer: framebuffer,
            width: width,
            height: height
        };
    }

    function destroyAvsRenderTarget(target) {
        if (!gl || !target) {
            return;
        }
        if (target.framebuffer) {
            gl.deleteFramebuffer(target.framebuffer);
        }
        if (target.texture) {
            gl.deleteTexture(target.texture);
        }
    }

    function clearAvsRenderTarget(target) {
        if (!target) {
            return;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
        gl.viewport(0, 0, target.width, target.height);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
    }

    function resetAvsFramebuffers() {
        if (!avsFramebufferState) {
            return;
        }
        destroyAvsRenderTarget(avsFramebufferState.front);
        destroyAvsRenderTarget(avsFramebufferState.scratch);
        if (avsFramebufferState.buffers) {
            for (var index = 0; index < avsFramebufferState.buffers.length; index++) {
                destroyAvsRenderTarget(avsFramebufferState.buffers[index]);
            }
        }
        avsFramebufferState = null;
    }

    function ensureAvsFramebuffers() {
        if (!gl || !avsCopyProgram || !avsBlendProgram || !avsWarpProgram || !avsFeedbackProgram
                || !avsColorFadeProgram
                || !quadBuffer || !avsWarpBuffer
                || canvas.width <= 0 || canvas.height <= 0) {
            return null;
        }
        if (avsFramebufferState && avsFramebufferState.width === canvas.width
                && avsFramebufferState.height === canvas.height) {
            return avsFramebufferState;
        }
        resetAvsFramebuffers();
        var front = createAvsRenderTarget(canvas.width, canvas.height);
        var scratch = createAvsRenderTarget(canvas.width, canvas.height);
        if (!front || !scratch) {
            destroyAvsRenderTarget(front);
            destroyAvsRenderTarget(scratch);
            return null;
        }
        avsFramebufferState = {
            width: canvas.width,
            height: canvas.height,
            front: front,
            scratch: scratch,
            buffers: new Array(8)
        };
        safeBridge("reportEvent", "avs_framebuffer_" + canvas.width + "x" + canvas.height);
        return avsFramebufferState;
    }

    function bindAvsQuad(positionLocation) {
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    }

    function bindAvsLineTarget(target) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
        gl.viewport(0, 0, target ? target.width : canvas.width, target ? target.height : canvas.height);
        gl.useProgram(lineProgram);
        gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
        gl.enableVertexAttribArray(lineLocations.position);
        gl.vertexAttribPointer(lineLocations.position, 2, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(lineLocations.color);
        gl.vertexAttribPointer(lineLocations.color, 4, gl.FLOAT, false, 24, 8);
    }

    function copyAvsTexture(texture, target, opacity, gain) {
        if (!texture || !avsCopyProgram) {
            return;
        }
        var targetWidth = target ? target.width : canvas.width;
        var targetHeight = target ? target.height : canvas.height;
        gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
        gl.viewport(0, 0, targetWidth, targetHeight);
        gl.useProgram(avsCopyProgram);
        bindAvsQuad(avsCopyLocations.position);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(avsCopyLocations.texture, 0);
        gl.uniform1f(avsCopyLocations.opacity, opacity == null ? 1 : opacity);
        gl.uniform1f(avsCopyLocations.gain, gain == null ? 1 : gain);
        gl.disable(gl.BLEND);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    function copyAvsTextureToScreen(texture) {
        copyAvsTexture(texture, null, 1);
    }

    function effectListBlendToInternalMode(blendMode) {
        if (blendMode === 1) {
            return 0;
        }
        if (blendMode === 2) {
            return 1;
        }
        if (blendMode === 3) {
            return 7;
        }
        if (blendMode === 4) {
            return 2;
        }
        if (blendMode === 5) {
            return 4;
        }
        if (blendMode === 6) {
            return 9;
        }
        if (blendMode === 7) {
            return 5;
        }
        if (blendMode === 8) {
            return 3;
        }
        if (blendMode === 9) {
            return 6;
        }
        if (blendMode === 10) {
            return 11;
        }
        if (blendMode === 11) {
            return 10;
        }
        if (blendMode === 13) {
            return 8;
        }
        return -1;
    }

    function composeAvsTextures(sourceTexture, destinationTexture, target, internalMode, adjust) {
        if (!sourceTexture || !destinationTexture || !target || !avsBlendProgram) {
            return false;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
        gl.viewport(0, 0, target.width, target.height);
        gl.useProgram(avsBlendProgram);
        bindAvsQuad(avsBlendLocations.position);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
        gl.uniform1i(avsBlendLocations.source, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, destinationTexture);
        gl.uniform1i(avsBlendLocations.destination, 1);
        gl.uniform2f(avsBlendLocations.resolution, target.width, target.height);
        gl.uniform1f(avsBlendLocations.mode, internalMode);
        gl.uniform1f(avsBlendLocations.adjust, adjust == null ? 128 : adjust);
        gl.disable(gl.BLEND);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.activeTexture(gl.TEXTURE0);
        return true;
    }

    function blendAvsTextureToTarget(texture, target, blendMode, blendValue, tempTarget) {
        if (!texture || !target || blendMode === 0) {
            return false;
        }
        var internalMode = effectListBlendToInternalMode(blendMode);
        if (internalMode < 0) {
            return false;
        }
        if (internalMode === 0) {
            copyAvsTexture(texture, target, 1);
            return true;
        }
        if (!tempTarget) {
            return false;
        }
        if (!composeAvsTextures(texture, target.texture, tempTarget, internalMode, blendValue)) {
            return false;
        }
        copyAvsTexture(tempTarget.texture, target, 1);
        return true;
    }

    function ensureAvsGlobalBuffer(bufferIndex, shouldAllocate) {
        var state = ensureAvsFramebuffers();
        if (!state || !state.buffers) {
            return null;
        }
        var index = Math.max(0, Math.min(7, Math.round(bufferIndex || 0)));
        var target = state.buffers[index];
        if (target && target.width === state.width && target.height === state.height) {
            return target;
        }
        destroyAvsRenderTarget(target);
        state.buffers[index] = null;
        if (!shouldAllocate) {
            return null;
        }
        target = createAvsRenderTarget(state.width, state.height);
        if (!target) {
            return null;
        }
        clearAvsRenderTarget(target);
        state.buffers[index] = target;
        bindAvsLineTarget(state.front);
        return target;
    }

    function swapAvsFramebuffers() {
        var state = avsFramebufferState;
        var previous = state.front;
        state.front = state.scratch;
        state.scratch = previous;
    }

    function replaceAvsFrameWithTexture(texture) {
        var state = ensureAvsFramebuffers();
        if (!state || !texture) {
            return false;
        }
        copyAvsTexture(texture, state.scratch, 1);
        swapAvsFramebuffers();
        bindAvsLineTarget(avsFramebufferState.front);
        return true;
    }

    function applyAvsFeedbackPass(mode, amount, seed) {
        var state = ensureAvsFramebuffers();
        if (!state || !avsFeedbackProgram) {
            return false;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, state.scratch.framebuffer);
        gl.viewport(0, 0, state.scratch.width, state.scratch.height);
        gl.useProgram(avsFeedbackProgram);
        bindAvsQuad(avsFeedbackLocations.position);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, state.front.texture);
        gl.uniform1i(avsFeedbackLocations.texture, 0);
        gl.uniform2f(avsFeedbackLocations.resolution, state.width, state.height);
        gl.uniform1f(avsFeedbackLocations.mode, mode);
        gl.uniform1f(avsFeedbackLocations.amount, Math.max(0, amount || 0));
        gl.uniform1f(avsFeedbackLocations.time, seed == null ? visualTimeSeconds : seed);
        gl.uniform4f(avsFeedbackLocations.audio, audio.rms, audio.bass, audio.mid, audio.treb);
        gl.disable(gl.BLEND);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        swapAvsFramebuffers();
        bindAvsLineTarget(avsFramebufferState.front);
        return true;
    }

    function destroyAvsDelayHistory(renderer) {
        if (!renderer || !renderer.delayHistory) {
            return;
        }
        var targets = renderer.delayHistory.targets || [];
        for (var index = 0; index < targets.length; index++) {
            destroyAvsRenderTarget(targets[index]);
        }
        renderer.delayHistory = null;
        renderer.historyIndex = 0;
        renderer.historyReady = 0;
    }

    function ensureAvsDelayHistory(renderer, frameCount) {
        var state = ensureAvsFramebuffers();
        if (!state) {
            return null;
        }
        var count = Math.max(2, Math.min(8, Math.round(frameCount || 2)));
        var history = renderer.delayHistory;
        if (history && history.width === state.width && history.height === state.height && history.count === count) {
            return history.targets;
        }
        destroyAvsDelayHistory(renderer);
        var targets = [];
        for (var index = 0; index < count; index++) {
            var target = createAvsRenderTarget(state.width, state.height);
            if (!target) {
                for (var cleanup = 0; cleanup < targets.length; cleanup++) {
                    destroyAvsRenderTarget(targets[cleanup]);
                }
                return null;
            }
            targets.push(target);
        }
        renderer.delayHistory = {
            width: state.width,
            height: state.height,
            count: count,
            targets: targets
        };
        renderer.historyIndex = 0;
        renderer.historyReady = 0;
        return targets;
    }

    function releaseAvsRuntimeFramebuffers(runtime) {
        if (!runtime) {
            return;
        }
        if (runtime.renderers) {
            for (var index = 0; index < runtime.renderers.length; index++) {
                destroyAvsDelayHistory(runtime.renderers[index]);
            }
        }
        if (runtime.nodes) {
            for (var nodeIndex = 0; nodeIndex < runtime.nodes.length; nodeIndex++) {
                releaseAvsRuntimeNodeFramebuffers(runtime.nodes[nodeIndex]);
            }
        }
    }

    function releaseAvsRuntimeNodeFramebuffers(node) {
        if (!node) {
            return;
        }
        if (node.kind === "effectList") {
            destroyAvsRenderTarget(node.front);
            destroyAvsRenderTarget(node.scratch);
            node.front = null;
            node.scratch = null;
            if (node.children) {
                for (var index = 0; index < node.children.length; index++) {
                    releaseAvsRuntimeNodeFramebuffers(node.children[index]);
                }
            }
        }
    }

    function flattenAvsRuntimeEffects(effects, output) {
        for (var index = 0; index < effects.length; index++) {
            var effect = effects[index];
            output.push(effect);
            if (effect.effects && effect.effects.length > 0) {
                flattenAvsRuntimeEffects(effect.effects, output);
            }
        }
        return output;
    }

    function createAvsInitialState(sampleCount) {
        return {
            n: normalizeAvsSampleCount(sampleCount, 64),
            tpi: Math.acos(-1),
            pi: Math.acos(-1),
            w: Math.max(1, canvas.width),
            h: Math.max(1, canvas.height),
            x: 0,
            y: 0,
            r: 0,
            d: 0,
            b: 0,
            red: 0,
            green: 0,
            blue: 0,
            alpha: 1,
            beatAverage: 0.18,
            lastBeatAt: 0
        };
    }

    function createAvsEelRenderer(kind, settings, sampleCount, drawMode, lineMode, colors, texer) {
        var suite = avsEel.compileSuite(settings.eel || {});
        var scope = suite.createScope(createAvsInitialState(sampleCount));
        var slots = suite.slots(["n", "w", "h", "i", "x", "y", "r", "d", "b", "red", "green", "blue", "alpha"]);
        suite.init.run(scope, avsEelHost());
        sampleCount = normalizeAvsSampleCount(suite.getSlot(scope, slots.n), sampleCount);
        return {
            kind: kind,
            suite: suite,
            scope: scope,
            slots: slots,
            sampleCount: sampleCount,
            drawMode: drawMode || "lines",
            lineMode: cloneAvsLineMode(lineMode),
            colors: colors || [],
            texer: cloneAvsTexer(texer),
            hasColorSlots: slots.red >= 0 || slots.green >= 0 || slots.blue >= 0,
            hasAlphaSlot: slots.alpha >= 0
        };
    }

    function cloneAvsTexer(settings) {
        if (!settings) {
            return null;
        }
        return {
            resourceId: Math.max(0, Math.round(settings.resourceId || 0)),
            size: Math.max(5, Math.min(30, Math.round(settings.size || 10))),
            intensity: clamp(settings.intensity == null ? 0.55 : settings.intensity, 0.1, 1.4)
        };
    }

    function createAvsColor(rawColor) {
        return { raw: rawColor == null ? 0xffffff : rawColor };
    }

    function resetAvsStackRuntime() {
        releaseAvsRuntimeFramebuffers(avsStackRuntime);
        avsStackPresetId = "";
        avsStackRuntime = null;
        avsStackRuntimeFailed = false;
        avsStackFrameStarted = false;
        avsStackBeatAverage = 0.18;
        avsStackLastBeatAt = 0;
    }

    function getActiveAvsPresetDefinition() {
        var preset = presets[presetIndex];
        if (!preset || preset.mode !== "avs" || !preset.avsPresetId) {
            return null;
        }
        return avsPresetDefinitions[preset.avsPresetId] || null;
    }

    function addAvsRuntimeRenderer(runtime, nodes, renderer) {
        runtime.renderers.push(renderer);
        nodes.push(renderer);
    }

    function compileAvsEffectNodes(effects, runtime, context) {
        var nodes = [];
        for (var index = 0; index < effects.length; index++) {
            var effect = effects[index];
            if (effect.type === "effectList") {
                var childContext = {
                    lineMode: defaultAvsLineMode(),
                    pendingTexer: null
                };
                nodes.push({
                    kind: "effectList",
                    settings: effect.settings || {},
                    children: compileAvsEffectNodes(effect.effects || [], runtime, childContext),
                    front: null,
                    scratch: null,
                    beatFramesRemaining: 0
                });
            } else if (effect.type === "lineMode") {
                context.lineMode = cloneAvsLineMode(effect.settings);
            } else if (effect.type === "texer" || effect.type === "texer2") {
                context.pendingTexer = effect.settings || {};
            } else if (effect.type === "fastBrightness") {
                addAvsRuntimeRenderer(runtime, nodes, {
                    kind: "fastBrightness",
                    settings: effect.settings || {}
                });
            } else if (effect.type === "bufferSave" || effect.type === "bufferBlit") {
                addAvsRuntimeRenderer(runtime, nodes, {
                    kind: "bufferSave",
                    settings: effect.settings || {}
                });
            } else if (effect.type === "clearScreen") {
                addAvsRuntimeRenderer(runtime, nodes, {
                    kind: "clearScreen",
                    settings: effect.settings || {},
                    hasRendered: false
                });
            } else if (effect.type === "videoDelay") {
                addAvsRuntimeRenderer(runtime, nodes, {
                    kind: "videoDelay",
                    settings: effect.settings || {},
                    phase: 0
                });
            } else if (effect.type === "bump") {
                addAvsRuntimeRenderer(runtime, nodes, {
                    kind: "bump",
                    settings: effect.settings || {},
                    phase: 0,
                    beatDepth: 0
                });
            } else if (effect.type === "scatter") {
                addAvsRuntimeRenderer(runtime, nodes, {
                    kind: "scatter",
                    settings: effect.settings || {},
                    seed: 0.37
                });
            } else if (effect.type === "colorFade") {
                addAvsRuntimeRenderer(runtime, nodes, {
                    kind: "colorFade",
                    settings: effect.settings || {}
                });
            } else if (effect.type === "simple") {
                addAvsRuntimeRenderer(runtime, nodes, {
                    kind: "simple",
                    settings: effect.settings || {},
                    sampleCount: 160,
                    lineMode: cloneAvsLineMode(context.lineMode),
                    colors: effect.settings && effect.settings.colors ? effect.settings.colors : [createAvsColor(0xffffff)]
                });
            } else if (effect.type === "oscilloscope") {
                addAvsRuntimeRenderer(runtime, nodes, {
                    kind: "oscilloscope",
                    sampleCount: 160,
                    lineMode: cloneAvsLineMode(context.lineMode),
                    colors: [createAvsColor(0x66f7ff)],
                    texer: null
                });
            } else if (effect.type === "dotFountain" && effect.settings && effect.settings.eel) {
                addAvsRuntimeRenderer(runtime, nodes, createAvsEelRenderer("dotFountain", effect.settings,
                        180, "points", context.lineMode, [createAvsColor(effect.settings.colorRaw)],
                        context.pendingTexer));
                context.pendingTexer = null;
            } else if ((effect.type === "dynamicMovement" || effect.type === "renderState")
                    && effect.settings && effect.settings.eel) {
                addAvsRuntimeRenderer(runtime, nodes, createAvsEelRenderer("dynamicMovement", effect.settings,
                        0, "points", context.lineMode, [createAvsColor(0x8af6ff)], context.pendingTexer));
                context.pendingTexer = null;
            } else if (effect.type === "superScope" && effect.settings && effect.settings.eel) {
                var settings = effect.settings;
                addAvsRuntimeRenderer(runtime, nodes, createAvsEelRenderer("superScope", settings,
                        normalizeAvsSampleCount(settings.sampleCount, 64),
                        settings.drawMode || "lines", context.lineMode, settings.colors || [], context.pendingTexer));
                context.pendingTexer = null;
            }
        }
        return nodes;
    }

    function compileAvsStackRuntime(definition) {
        if (!definition || !definition.effects || !avsEel || typeof avsEel.compileSuite !== "function") {
            return null;
        }

        var runtime = {
            id: definition.id,
            displayName: definition.displayName,
            fadeAlpha: 0,
            renderers: [],
            nodes: []
        };
        var context = {
            lineMode: defaultAvsLineMode(),
            pendingTexer: null
        };
        runtime.nodes = compileAvsEffectNodes(definition.effects, runtime, context);
        return runtime.renderers.length > 0 ? runtime : null;
    }

    function getAvsStackRuntime() {
        var preset = presets[presetIndex];
        var presetId = preset && preset.avsPresetId ? preset.avsPresetId : "";
        if (presetId !== avsStackPresetId) {
            releaseAvsRuntimeFramebuffers(avsStackRuntime);
            avsStackPresetId = presetId;
            avsStackRuntime = null;
            avsStackRuntimeFailed = false;
            avsStackFrameStarted = false;
            avsStackBeatAverage = 0.18;
            avsStackLastBeatAt = 0;
        }
        if (avsStackRuntime || avsStackRuntimeFailed) {
            return avsStackRuntime;
        }
        try {
            avsStackRuntime = compileAvsStackRuntime(getActiveAvsPresetDefinition());
            if (!avsStackRuntime) {
                avsStackRuntimeFailed = true;
            }
        } catch (exception) {
            avsStackRuntimeFailed = true;
            avsStackRuntime = null;
            if (window.console && typeof window.console.error === "function") {
                window.console.error("AVS stack compile failed", exception);
            }
        }
        return avsStackRuntime;
    }

    function detectAvsStackBeat(now) {
        var energy = Math.max(audio.rms, audio.bass * 0.72 + audio.mid * 0.28);
        avsStackBeatAverage += (energy - avsStackBeatAverage) * 0.028;
        if (now - avsStackLastBeatAt < 170) {
            return false;
        }
        if (energy > Math.max(0.13, avsStackBeatAverage * 1.34)) {
            avsStackLastBeatAt = now;
            avsStackBeatAverage = avsStackBeatAverage * 0.86 + energy * 0.14;
            return true;
        }
        return false;
    }

    function runAvsStackProgram(runtime, program, scope) {
        if (!program || avsStackRuntimeFailed) {
            return false;
        }
        try {
            program.run(scope, avsEelHost());
            return true;
        } catch (exception) {
            avsStackRuntimeFailed = true;
            avsStackRuntime = null;
            if (window.console && typeof window.console.error === "function") {
                window.console.error("AVS stack runtime failed", exception);
            }
            return false;
        }
    }

    function ensureAvsStackVertexCapacity(sampleCount, verticesPerPoint) {
        var required = Math.max(6, sampleCount * (verticesPerPoint || 6)) * 6;
        if (avsStackVertices.length < required) {
            avsStackVertices = new Float32Array(required);
        }
    }

    function ensureAvsWarpCapacity(pointCount, vertexCount) {
        var mapRequired = Math.max(1, pointCount) * 3;
        var vertexRequired = Math.max(6, vertexCount) * 5;
        if (avsWarpMap.length < mapRequired) {
            avsWarpMap = new Float32Array(mapRequired);
        }
        if (avsWarpVertices.length < vertexRequired) {
            avsWarpVertices = new Float32Array(vertexRequired);
        }
    }

    function avsColorComponent(color, shift) {
        return ((color >>> shift) & 0xff) / 255;
    }

    function avsRawRed(color) {
        return avsColorComponent(color, 0);
    }

    function avsRawGreen(color) {
        return avsColorComponent(color, 8);
    }

    function avsRawBlue(color) {
        return avsColorComponent(color, 16);
    }

    function avsWriteRawColor(pointValue, color, alpha) {
        pointValue[2] = avsRawRed(color);
        pointValue[3] = avsRawGreen(color);
        pointValue[4] = avsRawBlue(color);
        pointValue[5] = alpha;
    }

    function nextAvsRendererColor(renderer, fallbackColor) {
        var colors = renderer.colors || [];
        if (colors.length === 0) {
            return fallbackColor == null ? 0xffffff : fallbackColor;
        }
        renderer.colorPosition = ((renderer.colorPosition || 0) + 1) % Math.max(1, colors.length * 64);
        var colorIndex = Math.floor(renderer.colorPosition / 64);
        var amount = renderer.colorPosition & 63;
        var first = colors[colorIndex] && colors[colorIndex].raw != null
                ? colors[colorIndex].raw
                : (fallbackColor == null ? 0xffffff : fallbackColor);
        var secondIndex = colorIndex + 1 < colors.length ? colorIndex + 1 : 0;
        var second = colors[secondIndex] && colors[secondIndex].raw != null
                ? colors[secondIndex].raw
                : first;
        var red = (((first & 255) * (63 - amount)) + ((second & 255) * amount)) / 64;
        var green = ((((first >>> 8) & 255) * (63 - amount)) + (((second >>> 8) & 255) * amount)) / 64;
        var blue = ((((first >>> 16) & 255) * (63 - amount)) + (((second >>> 16) & 255) * amount)) / 64;
        return (Math.round(red) & 255) | ((Math.round(green) & 255) << 8) | ((Math.round(blue) & 255) << 16);
    }

    function readAvsStackPoint(renderer, out, base) {
        var suite = renderer.suite;
        var scope = renderer.scope;
        var slots = renderer.slots;
        var fallbackX = base ? base.x : 0;
        var fallbackY = base ? base.y : 0;
        var fallbackR = base ? base.r : 0;
        var fallbackD = base ? base.d : Math.sqrt(fallbackX * fallbackX + fallbackY * fallbackY);
        out[0] = slots.x >= 0 ? suite.getSlot(scope, slots.x) || 0 : fallbackX;
        out[1] = slots.y >= 0 ? suite.getSlot(scope, slots.y) || 0 : fallbackY;
        if (renderer.kind === "renderState" && slots.r >= 0 && slots.d >= 0 && base) {
            var currentR = suite.getSlot(scope, slots.r) || 0;
            var currentD = suite.getSlot(scope, slots.d) || 0;
            var xyChanged = Math.abs(out[0] - fallbackX) + Math.abs(out[1] - fallbackY) > 0.0001;
            var polarChanged = Math.abs(currentR - fallbackR) + Math.abs(currentD - fallbackD) > 0.0001;
            if (!xyChanged && polarChanged) {
                out[0] = Math.cos(currentR) * currentD;
                out[1] = Math.sin(currentR) * currentD;
            }
        }
        if (renderer.hasColorSlots) {
            out[2] = clamp(suite.getSlot(scope, slots.red) || 0, 0, 1);
            out[3] = clamp(suite.getSlot(scope, slots.green) || 0, 0, 1);
            out[4] = clamp(suite.getSlot(scope, slots.blue) || 0, 0, 1);
        } else if (renderer.colors.length > 0) {
            var color = renderer.colors[0].raw == null ? 0xffffff : renderer.colors[0].raw;
            out[2] = avsRawRed(color);
            out[3] = avsRawGreen(color);
            out[4] = avsRawBlue(color);
        } else {
            out[2] = 1;
            out[3] = 1;
            out[4] = 1;
        }
        out[5] = renderer.hasAlphaSlot
                ? clamp(suite.getSlot(scope, slots.alpha) || 0, 0, 1)
                : (Math.max(out[2], out[3], out[4]) > 0 ? 0.92 : 0);
        return out;
    }

    function renderAvsStackRenderer(renderer, isBeat) {
        if (renderer.kind === "fastBrightness") {
            renderAvsFastBrightness(renderer);
            return;
        }
        if (renderer.kind === "bufferSave") {
            renderAvsBufferSave(renderer);
            return;
        }
        if (renderer.kind === "clearScreen") {
            renderAvsClearScreen(renderer);
            return;
        }
        if (renderer.kind === "videoDelay") {
            renderAvsVideoDelay(renderer, isBeat);
            return;
        }
        if (renderer.kind === "colorFade") {
            renderAvsColorFade(renderer, isBeat);
            return;
        }
        if (renderer.kind === "bump") {
            renderAvsBump(renderer, isBeat);
            return;
        }
        if (renderer.kind === "scatter") {
            renderAvsScatter(renderer);
            return;
        }
        if (renderer.kind === "oscilloscope") {
            renderAvsOscilloscopeRenderer(renderer);
            return;
        }
        if (renderer.kind === "simple") {
            renderAvsSimpleRenderer(renderer);
            return;
        }
        if (renderer.kind === "dotFountain") {
            renderAvsDotFountainRenderer(renderer, isBeat);
            return;
        }
        if (renderer.kind === "dynamicMovement") {
            renderAvsDynamicMovementRenderer(renderer, isBeat);
            return;
        }
        if (renderer.kind === "renderState") {
            renderAvsRenderStateRenderer(renderer, isBeat);
            return;
        }
        renderAvsSuperScopeRenderer(renderer, isBeat);
    }

    function prepareAvsFrameProgram(renderer, isBeat) {
        var suite = renderer.suite;
        var scope = renderer.scope;
        var slots = renderer.slots;
        suite.setSlot(scope, slots.w, canvas.width);
        suite.setSlot(scope, slots.h, Math.max(1, canvas.height));
        suite.setSlot(scope, slots.b, isBeat ? 1 : 0);
        suite.setSlot(scope, slots.alpha, 0.5);
        if (!runAvsStackProgram(suite, suite.frame, scope)) {
            return;
        }
        if (isBeat) {
            runAvsStackProgram(suite, suite.beat, scope);
        }
        return true;
    }

    function renderAvsSuperScopeRenderer(renderer, isBeat) {
        var suite = renderer.suite;
        var scope = renderer.scope;
        var slots = renderer.slots;
        if (!prepareAvsFrameProgram(renderer, isBeat)) {
            return;
        }

        var sampleCount = normalizeAvsSampleCount(suite.getSlot(scope, slots.n), renderer.sampleCount);
        renderer.sampleCount = sampleCount;
        ensureAvsStackVertexCapacity(sampleCount, renderer.texer ? 48 : 6);

        var vertexCount = 0;
        var hasPrevious = false;
        var step = 1 / Math.max(1, sampleCount - 1);
        var texerStride = renderer.texer && renderer.drawMode !== "points"
                ? Math.max(1, Math.ceil(sampleCount / 180))
                : 1;
        for (var index = 0; index < sampleCount; index++) {
            suite.setSlot(scope, slots.i, index * step);
            if (!runAvsStackProgram(suite, suite.point, scope)) {
                return;
            }
            readAvsStackPoint(renderer, avsStackPointScratch, null);
            if (renderer.drawMode === "points") {
                vertexCount = addAvsStackPointTo(avsStackVertices, vertexCount, avsStackPointScratch,
                        renderer.lineMode.lineWidth, renderer.texer);
            } else if (hasPrevious && avsStackPreviousScratch[5] > 0 && avsStackPointScratch[5] > 0) {
                var distance = Math.abs(avsStackPreviousScratch[0] - avsStackPointScratch[0])
                        + Math.abs(avsStackPreviousScratch[1] - avsStackPointScratch[1]);
                if (distance < 2.6) {
                    vertexCount = addAvsSegmentTo(avsStackVertices, vertexCount, avsStackPreviousScratch,
                            avsStackPointScratch, renderer.lineMode.lineWidth);
                }
                if (renderer.texer && avsStackPointScratch[5] > 0.01 && index % texerStride === 0) {
                    vertexCount = addAvsTexerSpriteTo(avsStackVertices, vertexCount, avsStackPointScratch,
                            renderer.texer);
                }
            }
            copyAvsPoint(avsStackPointScratch, avsStackPreviousScratch);
            hasPrevious = true;
        }
        drawAvsVertices(avsStackVertices, vertexCount, renderer.lineMode.blendMode);
    }

    function drawAvsBlackFade(alpha) {
        if (alpha <= 0) {
            return;
        }
        setAvsFadeAlpha(clamp(alpha, 0, 0.92));
        gl.bufferData(gl.ARRAY_BUFFER, avsFadeVertices, gl.STATIC_DRAW);
        gl.enable(gl.BLEND);
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    function renderAvsFastBrightness(renderer) {
        var state = ensureAvsFramebuffers();
        if (!state) {
            return;
        }
        var settings = renderer.settings || {};
        var gain = settings.direction === 0 ? 2 : (settings.direction === 1 ? 0.5 : 1);
        if (gain === 1) {
            return;
        }
        copyAvsTexture(state.front.texture, state.scratch, 1, gain);
        swapAvsFramebuffers();
        bindAvsLineTarget(avsFramebufferState.front);
    }

    function renderAvsBufferSave(renderer) {
        var state = ensureAvsFramebuffers();
        if (!state) {
            return;
        }
        var settings = renderer.settings || {};
        var direction = Math.round(settings.direction == null ? settings.sourceBuffer || 0 : settings.direction);
        var bufferIndex = Math.round(settings.bufferIndex == null ? settings.destinationBuffer || 0 : settings.bufferIndex);
        var blendMode = Math.round(settings.blendMode == null ? settings.mode || 0 : settings.blendMode);
        var adjust = settings.adjustableBlend == null ? 128 : settings.adjustableBlend;
        var transferDirection = direction < 2 ? direction : ((direction & 1) ^ (renderer.directionToggle ? 1 : 0));
        renderer.directionToggle = !renderer.directionToggle;

        var buffer = ensureAvsGlobalBuffer(bufferIndex, transferDirection !== 1);
        if (!buffer) {
            return;
        }

        if (transferDirection === 0) {
            if (blendMode === 0) {
                copyAvsTexture(state.front.texture, buffer, 1);
            } else if (composeAvsTextures(state.front.texture, buffer.texture, state.scratch, blendMode, adjust)) {
                copyAvsTexture(state.scratch.texture, buffer, 1);
            }
            bindAvsLineTarget(state.front);
            return;
        }

        if (blendMode === 0) {
            copyAvsTexture(buffer.texture, state.scratch, 1);
        } else if (!composeAvsTextures(buffer.texture, state.front.texture, state.scratch, blendMode, adjust)) {
            return;
        }
        swapAvsFramebuffers();
        bindAvsLineTarget(avsFramebufferState.front);
    }

    function avsColorFadeArray(value, fallback) {
        var output = fallback.slice(0, 3);
        if (value && value.length >= 3) {
            output[0] = Math.round(value[0]);
            output[1] = Math.round(value[1]);
            output[2] = Math.round(value[2]);
        }
        return output;
    }

    function avsRandomInt(range) {
        return Math.floor(Math.random() * Math.max(1, range));
    }

    function nextAvsColorFadeFaders(renderer, isBeat) {
        var settings = renderer.settings || {};
        var enabled = Math.round(settings.enabled == null
                ? (settings.mode == null ? 1 : settings.mode)
                : settings.enabled);
        if (!enabled) {
            return null;
        }
        var faders = avsColorFadeArray(settings.faders, [8, -8, -8]);
        var beatFaders = avsColorFadeArray(settings.beatFaders, faders);
        if (!renderer.faderPosition) {
            renderer.faderPosition = faders.slice(0, 3);
        }
        var position = renderer.faderPosition;
        if (position[0] < faders[0]) {
            position[0]++;
        }
        if (position[1] < faders[2]) {
            position[1]++;
        }
        if (position[2] < faders[1]) {
            position[2]++;
        }
        if (position[0] > faders[0]) {
            position[0]--;
        }
        if (position[1] > faders[2]) {
            position[1]--;
        }
        if (position[2] > faders[1]) {
            position[2]--;
        }

        if (!(enabled & 4)) {
            position[0] = faders[0];
            position[1] = faders[1];
            position[2] = faders[2];
        } else if (isBeat && (enabled & 2)) {
            position[0] = avsRandomInt(32) - 6;
            position[1] = avsRandomInt(64) - 32;
            if (position[1] < 0 && position[1] > -16) {
                position[1] = -32;
            }
            if (position[1] >= 0 && position[1] < 16) {
                position[1] = 32;
            }
            position[2] = avsRandomInt(32) - 6;
        } else if (isBeat) {
            position[0] = beatFaders[0];
            position[1] = beatFaders[1];
            position[2] = beatFaders[2];
        }
        return position;
    }

    function renderAvsColorFade(renderer, isBeat) {
        var state = ensureAvsFramebuffers();
        var faders = nextAvsColorFadeFaders(renderer, isBeat);
        if (!state || !faders) {
            return;
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, state.scratch.framebuffer);
        gl.viewport(0, 0, state.scratch.width, state.scratch.height);
        gl.useProgram(avsColorFadeProgram);
        bindAvsQuad(avsColorFadeLocations.position);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, state.front.texture);
        gl.uniform1i(avsColorFadeLocations.texture, 0);
        gl.uniform3f(avsColorFadeLocations.faders, faders[0], faders[1], faders[2]);
        gl.disable(gl.BLEND);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        swapAvsFramebuffers();
        bindAvsLineTarget(avsFramebufferState.front);
    }

    function drawAvsColorWash(color, alpha, blendMode) {
        if (alpha <= 0) {
            return;
        }
        setAvsFadeColor(avsRawRed(color), avsRawGreen(color), avsRawBlue(color), clamp(alpha, 0, 1));
        gl.bufferData(gl.ARRAY_BUFFER, avsFadeVertices, gl.STATIC_DRAW);
        gl.enable(gl.BLEND);
        gl.blendEquation(gl.FUNC_ADD);
        if (blendMode === "additive") {
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        } else {
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        }
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    function renderAvsClearScreen(renderer) {
        var settings = renderer.settings || {};
        if (settings.enabled === 0 || (settings.onlyFirst && renderer.hasRendered)) {
            return;
        }
        renderer.hasRendered = true;
        var color = settings.colorRaw == null ? 0 : settings.colorRaw;
        if (settings.blend === 1 || settings.blend === 2) {
            drawAvsColorWash(color, 1, "additive");
        } else if (settings.blendAverage) {
            drawAvsColorWash(color, 0.5, "replace");
        } else {
            drawAvsColorWash(color, 1, "replace");
        }
    }

    function renderAvsVideoDelay(renderer, isBeat) {
        var settings = renderer.settings || {};
        if (settings.enabled === 0) {
            return;
        }
        var delay = Math.max(1, Math.min(200, Math.round(settings.delay || 1)));
        var history = ensureAvsDelayHistory(renderer, Math.min(8, delay + 1));
        var state = avsFramebufferState;
        if (!history || !state) {
            var beatBoost = settings.useBeats && isBeat ? 0.08 : 0;
            drawAvsBlackFade(Math.min(0.10, 0.015 + delay / 4000 + beatBoost));
            return;
        }

        var writeIndex = renderer.historyIndex % history.length;
        copyAvsTexture(state.front.texture, history[writeIndex], 1);
        renderer.historyReady = Math.min(history.length, (renderer.historyReady || 0) + 1);
        if (renderer.historyReady >= history.length) {
            var readIndex = (writeIndex + 1) % history.length;
            replaceAvsFrameWithTexture(history[readIndex].texture);
            if (settings.useBeats && isBeat) {
                drawAvsBlackFade(0.025);
            }
        } else {
            bindAvsLineTarget(state.front);
            drawAvsBlackFade(0.012);
        }
        renderer.historyIndex = (writeIndex + 1) % history.length;
    }

    function renderAvsScatter(renderer) {
        if (renderer.settings && renderer.settings.enabled === 0) {
            return;
        }
        renderer.seed = wrap01((renderer.seed || 0.37) + 0.173);
        applyAvsFeedbackPass(2, 1, visualTimeSeconds * 59.0 + renderer.seed * 997.0);
    }

    function renderAvsBump(renderer, isBeat) {
        if (renderer.settings && renderer.settings.enabled === 0) {
            return;
        }
        var baseDepth = renderer.settings && renderer.settings.depth
                ? clamp(renderer.settings.depth / 100, 0.05, 1)
                : 0.30;
        var beatDepth = renderer.settings && renderer.settings.beatDepth
                ? clamp(renderer.settings.beatDepth / 100, 0.05, 1)
                : baseDepth * 1.4;
        if (isBeat) {
            renderer.beatDepth = beatDepth;
        }
        renderer.beatDepth *= 0.88;
        renderer.phase = wrap01((renderer.phase || 0) + 0.010 + audio.bass * 0.014);

        var depth = Math.max(baseDepth, renderer.beatDepth || 0);
        applyAvsFeedbackPass(1, depth * 0.78 + audio.bass * 0.16, visualTimeSeconds + (isBeat ? 0.37 : 0));
        var segments = 40;
        var rings = 3;
        ensureAvsStackVertexCapacity(segments * rings, 6);
        var vertexCount = 0;
        var start = avsStackPreviousScratch;
        var end = avsStackPointScratch;
        for (var ring = 0; ring < rings; ring++) {
            var radius = 0.16 + wrap01(renderer.phase + ring / rings) * 1.18;
            var alpha = (1 - ring / rings) * depth * 0.10;
            var wobble = visualTimeSeconds * (0.35 + ring * 0.11);
            for (var segment = 0; segment < segments; segment++) {
                var a0 = segment / segments * Math.PI * 2;
                var a1 = (segment + 1) / segments * Math.PI * 2;
                var r0 = radius + Math.sin(a0 * 3 + wobble) * 0.018;
                var r1 = radius + Math.sin(a1 * 3 + wobble) * 0.018;
                start[0] = Math.cos(a0) * r0;
                start[1] = Math.sin(a0) * r0;
                start[2] = 0.05;
                start[3] = 0.22 + audio.mid * 0.08;
                start[4] = 0.24 + audio.treb * 0.10;
                start[5] = alpha;
                end[0] = Math.cos(a1) * r1;
                end[1] = Math.sin(a1) * r1;
                end[2] = start[2];
                end[3] = start[3];
                end[4] = start[4];
                end[5] = alpha;
                vertexCount = addAvsSegmentTo(avsStackVertices, vertexCount, start, end, 1);
            }
        }
        drawAvsVertices(avsStackVertices, vertexCount, "additive");
    }

    function renderAvsOscilloscopeRenderer(renderer) {
        var sampleCount = renderer.sampleCount || 256;
        ensureAvsStackVertexCapacity(sampleCount, renderer.texer ? 48 : 6);
        var vertexCount = 0;
        var color = renderer.colors && renderer.colors.length > 0 ? renderer.colors[0].raw : 0x66f7ff;
        var previous = avsStackPreviousScratch;
        var current = avsStackPointScratch;
        var hasPrevious = false;
        for (var index = 0; index < sampleCount; index++) {
            var position = index / Math.max(1, sampleCount - 1);
            current[0] = position * 2 - 1;
            current[1] = getOsc(position) * (0.55 + audio.rms * 0.35);
            current[2] = avsRawRed(color);
            current[3] = avsRawGreen(color);
            current[4] = avsRawBlue(color);
            current[5] = 0.62 + audio.rms * 0.24;
            if (hasPrevious) {
                vertexCount = addAvsSegmentTo(avsStackVertices, vertexCount, previous, current,
                        Math.max(1, renderer.lineMode.lineWidth));
            }
            copyAvsPoint(current, previous);
            hasPrevious = true;
        }
        drawAvsVertices(avsStackVertices, vertexCount, renderer.lineMode.blendMode);
    }

    function renderAvsSimpleRenderer(renderer) {
        var settings = renderer.settings || {};
        var renderMode = settings.renderMode || "solidAnalyzer";
        var color = nextAvsRendererColor(renderer, 0xffffff);
        var lineWidth = Math.max(1, Math.min(64, renderer.lineMode && renderer.lineMode.lineWidth
                ? renderer.lineMode.lineWidth
                : 1));
        var width = Math.max(1, avsFramebufferState ? avsFramebufferState.width : canvas.width);
        var height = Math.max(1, avsFramebufferState ? avsFramebufferState.height : canvas.height);
        var yscale = height / 512;
        var yPosition = Math.round(settings.yPosition || 0);
        var sourceChannel = settings.channel || "center";
        var modeId = Math.round(settings.renderModeId || 0);
        var sampleCount = modeId === 1 ? 200 : (modeId === 2 ? 288 : width);
        ensureAvsStackVertexCapacity(Math.max(width, sampleCount), 12);
        var vertexCount = 0;
        var h2 = height / 2;
        var ys = yscale;
        var adj = 1;
        if (yPosition !== 1) {
            ys = -ys;
            adj = 0;
        }
        if (yPosition === 2) {
            h2 -= ys * 128;
        }

        if (settings.dots) {
            if ((modeId & 2) === 2) {
                var dotScopeY = yPosition === 2 ? height / 4 : yPosition * height / 2;
                for (var dotScopeX = 0; dotScopeX < width; dotScopeX++) {
                    var dotScopeRead = dotScopeX * 288 / width;
                    var dotScopeValue = interpolateAvsWaveSigned(dotScopeRead, 287, sourceChannel);
                    vertexCount = addAvsPixelPointTo(avsStackVertices, vertexCount, dotScopeX,
                            dotScopeY + dotScopeValue * height / 4, color, 1, lineWidth);
                }
            } else {
                for (var dotAnalyzerX = 0; dotAnalyzerX < width; dotAnalyzerX++) {
                    var dotAnalyzerRead = dotAnalyzerX * 200 / width;
                    var dotAnalyzerValue = interpolateAvsSpectrumByte(dotAnalyzerRead, 200, sourceChannel);
                    vertexCount = addAvsPixelPointTo(avsStackVertices, vertexCount, dotAnalyzerX,
                            h2 + adj + dotAnalyzerValue * ys - 1, color, 1, lineWidth);
                }
            }
            drawAvsVertices(avsStackVertices, vertexCount, renderer.lineMode.blendMode);
            return;
        }

        if (modeId === 0) {
            for (var solidAnalyzerX = 0; solidAnalyzerX < width; solidAnalyzerX++) {
                var solidAnalyzerRead = solidAnalyzerX * 200 / width;
                var solidAnalyzerValue = interpolateAvsSpectrumByte(solidAnalyzerRead, 200, sourceChannel);
                vertexCount = addAvsPixelSegmentTo(avsStackVertices, vertexCount,
                        solidAnalyzerX, h2 - adj,
                        solidAnalyzerX, h2 + adj + solidAnalyzerValue * ys - 1,
                        color, 1, lineWidth);
            }
        } else if (modeId === 1) {
            var analyzerXs = width / 200;
            var lastAnalyzerX = 0;
            var lastAnalyzerY = h2 + avsSpectrumByte(0, 200, sourceChannel) * ys;
            for (var analyzerIndex = 1; analyzerIndex < 200; analyzerIndex++) {
                var analyzerX = analyzerIndex * analyzerXs;
                var analyzerY = h2 + avsSpectrumByte(analyzerIndex, 200, sourceChannel) * ys;
                vertexCount = addAvsPixelSegmentTo(avsStackVertices, vertexCount,
                        lastAnalyzerX, lastAnalyzerY, analyzerX, analyzerY,
                        color, 1, lineWidth);
                lastAnalyzerX = analyzerX;
                lastAnalyzerY = analyzerY;
            }
        } else if (modeId === 2) {
            var scopeY = yPosition === 2 ? height / 4 : yPosition * height / 2;
            var lastScopeX = 0;
            var lastScopeY = scopeY + avsWaveSigned(0, 287, sourceChannel) * height / 4;
            for (var scopeIndex = 1; scopeIndex < 288; scopeIndex++) {
                var scopeX = scopeIndex * width / 288;
                var scopeSampleY = scopeY + avsWaveSigned(scopeIndex, 287, sourceChannel) * height / 4;
                vertexCount = addAvsPixelSegmentTo(avsStackVertices, vertexCount,
                        lastScopeX, lastScopeY, scopeX, scopeSampleY,
                        color, 1, lineWidth);
                lastScopeX = scopeX;
                lastScopeY = scopeSampleY;
            }
        } else {
            var solidScopeY = yPosition === 2 ? height / 4 : yPosition * height / 2;
            var solidScopeBase = solidScopeY + yscale * 128;
            for (var solidScopeX = 0; solidScopeX < width; solidScopeX++) {
                var solidScopeRead = solidScopeX * 288 / width;
                var solidScopeValue = interpolateAvsWaveSigned(solidScopeRead, 287, sourceChannel);
                vertexCount = addAvsPixelSegmentTo(avsStackVertices, vertexCount,
                        solidScopeX, solidScopeBase - 1,
                        solidScopeX, solidScopeY + solidScopeValue * height / 4,
                        color, 1, lineWidth);
            }
        }
        drawAvsVertices(avsStackVertices, vertexCount, renderer.lineMode.blendMode);
    }

    function setAvsPointInput(renderer, i, x, y, r, d, color, alpha) {
        var suite = renderer.suite;
        var scope = renderer.scope;
        var slots = renderer.slots;
        suite.setSlot(scope, slots.i, i);
        suite.setSlot(scope, slots.x, x);
        suite.setSlot(scope, slots.y, y);
        suite.setSlot(scope, slots.r, r);
        suite.setSlot(scope, slots.d, d);
        suite.setSlot(scope, slots.red, avsRawRed(color));
        suite.setSlot(scope, slots.green, avsRawGreen(color));
        suite.setSlot(scope, slots.blue, avsRawBlue(color));
        suite.setSlot(scope, slots.alpha, alpha);
        avsStackBaseScratch.x = x;
        avsStackBaseScratch.y = y;
        avsStackBaseScratch.r = r;
        avsStackBaseScratch.d = d;
    }

    function renderAvsDotFountainRenderer(renderer, isBeat) {
        if (!prepareAvsFrameProgram(renderer, isBeat)) {
            return;
        }
        var suite = renderer.suite;
        var scope = renderer.scope;
        var sampleCount = normalizeAvsSampleCount(suite.getSlot(scope, renderer.slots.n), renderer.sampleCount);
        renderer.sampleCount = sampleCount;
        ensureAvsStackVertexCapacity(sampleCount, renderer.texer ? 48 : 6);

        var color = renderer.colors && renderer.colors.length > 0 ? renderer.colors[0].raw : 0xffffff;
        var vertexCount = 0;
        for (var index = 0; index < sampleCount; index++) {
            var i = index / Math.max(1, sampleCount - 1);
            var drift = visualTimeSeconds * (0.036 + audio.bass * 0.018);
            var angle = (wrap01(index * 0.754877666 + visualTimeSeconds * 0.027) * 2 - 1) * Math.PI;
            var radius = 0.10 + wrap01(index * 0.318309886 + drift * 0.35) * 0.90;
            var y = wrap01(index * 0.61803398875 + drift) * 2 - 1;
            var x = Math.cos(angle) * radius;
            setAvsPointInput(renderer, i, x, y, angle, y, color, 0.80);
            if (!runAvsStackProgram(suite, suite.point, scope)) {
                return;
            }
            readAvsStackPoint(renderer, avsStackPointScratch, avsStackBaseScratch);
            if (avsStackPointScratch[5] > 0.01) {
                vertexCount = addAvsStackPointTo(avsStackVertices, vertexCount, avsStackPointScratch, 2,
                        renderer.texer);
            }
        }
        drawAvsVertices(avsStackVertices, vertexCount, renderer.lineMode.blendMode);
    }

    function wrapPixelCoordinate(value, size) {
        if (size <= 0) {
            return 0;
        }
        return ((value % size) + size) % size;
    }

    function writeAvsDynamicMovementMapPoint(renderer, settings, column, row, columns, rows, isBeat, outputIndex) {
        var suite = renderer.suite;
        var scope = renderer.scope;
        var slots = renderer.slots;
        var width = Math.max(1, avsFramebufferState.width);
        var height = Math.max(1, avsFramebufferState.height);
        var halfWidth = width * 0.5;
        var halfHeight = height * 0.5;
        var unitX = columns <= 1 ? 0.5 : column / (columns - 1);
        var unitY = rows <= 1 ? 0.5 : row / (rows - 1);
        var pixelX = unitX * width;
        var pixelY = unitY * height;
        var dx = pixelX - halfWidth;
        var dy = pixelY - halfHeight;
        var maxDistance = Math.max(0.0001, Math.sqrt(width * width + height * height) * 0.5);
        var x = dx * 2 / width;
        var y = dy * 2 / height;
        var d = Math.sqrt(dx * dx + dy * dy) / maxDistance;
        var r = Math.atan2(dy, dx) + Math.PI * 0.5;
        var pointCount = Math.max(1, columns * rows - 1);
        var pointIndex = row * columns + column;

        suite.setSlot(scope, slots.i, pointIndex / pointCount);
        suite.setSlot(scope, slots.x, x);
        suite.setSlot(scope, slots.y, y);
        suite.setSlot(scope, slots.r, r);
        suite.setSlot(scope, slots.d, d);
        suite.setSlot(scope, slots.b, isBeat ? 1 : 0);
        suite.setSlot(scope, slots.alpha, 0.5);
        if (!runAvsStackProgram(suite, suite.point, scope)) {
            return false;
        }

        var sourceX = slots.x >= 0 ? suite.getSlot(scope, slots.x) : x;
        var sourceY = slots.y >= 0 ? suite.getSlot(scope, slots.y) : y;
        if (settings.rectCoords) {
            sourceX = (sourceX + 1) * halfWidth;
            sourceY = (sourceY + 1) * halfHeight;
        } else {
            var sourceD = (slots.d >= 0 ? suite.getSlot(scope, slots.d) : d) * maxDistance;
            var sourceR = (slots.r >= 0 ? suite.getSlot(scope, slots.r) : r) - Math.PI * 0.5;
            sourceX = halfWidth + Math.cos(sourceR) * sourceD;
            sourceY = halfHeight + Math.sin(sourceR) * sourceD;
        }

        if (!isFinite(sourceX)) {
            sourceX = pixelX;
        }
        if (!isFinite(sourceY)) {
            sourceY = pixelY;
        }

        if (settings.wrap) {
            sourceX = wrapPixelCoordinate(sourceX, width);
            sourceY = wrapPixelCoordinate(sourceY, height);
        } else {
            sourceX = clamp(sourceX, 0, width - 1);
            sourceY = clamp(sourceY, 0, height - 1);
        }

        if (!settings.subpixel) {
            sourceX = Math.round(sourceX);
            sourceY = Math.round(sourceY);
        }

        var alpha = slots.alpha >= 0 ? suite.getSlot(scope, slots.alpha) : 1;
        avsWarpMap[outputIndex] = clamp((sourceX + 0.5) / width, 0, 1);
        avsWarpMap[outputIndex + 1] = clamp((sourceY + 0.5) / height, 0, 1);
        avsWarpMap[outputIndex + 2] = clamp(isFinite(alpha) ? alpha : 1, 0, 1);
        return true;
    }

    function appendAvsWarpVertex(vertexCount, column, row, columns, rows) {
        var mapIndex = (row * columns + column) * 3;
        var offset = vertexCount * 5;
        avsWarpVertices[offset] = columns <= 1 ? 0 : column / (columns - 1) * 2 - 1;
        avsWarpVertices[offset + 1] = rows <= 1 ? 0 : row / (rows - 1) * 2 - 1;
        avsWarpVertices[offset + 2] = avsWarpMap[mapIndex];
        avsWarpVertices[offset + 3] = avsWarpMap[mapIndex + 1];
        avsWarpVertices[offset + 4] = avsWarpMap[mapIndex + 2];
        return vertexCount + 1;
    }

    function drawAvsDynamicMovementMesh(sourceTarget, blendEnabled, vertexCount) {
        var state = avsFramebufferState;
        gl.bindFramebuffer(gl.FRAMEBUFFER, state.scratch.framebuffer);
        gl.viewport(0, 0, state.scratch.width, state.scratch.height);
        gl.useProgram(avsWarpProgram);
        gl.bindBuffer(gl.ARRAY_BUFFER, avsWarpBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, avsWarpVertices.subarray(0, vertexCount * 5), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(avsWarpLocations.position);
        gl.vertexAttribPointer(avsWarpLocations.position, 2, gl.FLOAT, false, 20, 0);
        gl.enableVertexAttribArray(avsWarpLocations.uv);
        gl.vertexAttribPointer(avsWarpLocations.uv, 2, gl.FLOAT, false, 20, 8);
        gl.enableVertexAttribArray(avsWarpLocations.alpha);
        gl.vertexAttribPointer(avsWarpLocations.alpha, 1, gl.FLOAT, false, 20, 16);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sourceTarget.texture);
        gl.uniform1i(avsWarpLocations.source, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, state.front.texture);
        gl.uniform1i(avsWarpLocations.destination, 1);
        gl.uniform1f(avsWarpLocations.blend, blendEnabled ? 1 : 0);
        gl.disable(gl.BLEND);
        gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.activeTexture(gl.TEXTURE0);
        swapAvsFramebuffers();
        bindAvsLineTarget(avsFramebufferState.front);
    }

    function renderAvsDynamicMovementRenderer(renderer, isBeat) {
        var state = ensureAvsFramebuffers();
        if (!state || !prepareAvsFrameProgram(renderer, isBeat)) {
            return;
        }
        var settings = renderer.settings || {};
        if (settings.noMovement) {
            bindAvsLineTarget(state.front);
            return;
        }

        var bufferNumber = Math.round(settings.bufferNumber || 0);
        var sourceTarget = bufferNumber > 0
                ? ensureAvsGlobalBuffer(bufferNumber - 1, false)
                : state.front;
        if (!sourceTarget) {
            bindAvsLineTarget(state.front);
            return;
        }

        var xResolution = Math.max(1, Math.min(128, Math.round(settings.xResolution || 16)));
        var yResolution = Math.max(1, Math.min(128, Math.round(settings.yResolution || 16)));
        var columns = xResolution + 1;
        var rows = yResolution + 1;
        var pointCount = columns * rows;
        var vertexCount = xResolution * yResolution * 6;
        ensureAvsWarpCapacity(pointCount, vertexCount);

        var movementOptions = {
            rectCoords: settings.rectCoords !== 0 && settings.rectCoords !== false,
            wrap: settings.wrap !== 0 && settings.wrap !== false,
            subpixel: settings.subpixel !== 0 && settings.subpixel !== false
        };

        for (var row = 0; row < rows; row++) {
            for (var column = 0; column < columns; column++) {
                var mapIndex = (row * columns + column) * 3;
                if (!writeAvsDynamicMovementMapPoint(renderer, movementOptions, column, row,
                        columns, rows, isBeat, mapIndex)) {
                    return;
                }
            }
        }

        var writtenVertices = 0;
        for (var cellRow = 0; cellRow < yResolution; cellRow++) {
            for (var cellColumn = 0; cellColumn < xResolution; cellColumn++) {
                writtenVertices = appendAvsWarpVertex(writtenVertices, cellColumn, cellRow, columns, rows);
                writtenVertices = appendAvsWarpVertex(writtenVertices, cellColumn + 1, cellRow, columns, rows);
                writtenVertices = appendAvsWarpVertex(writtenVertices, cellColumn, cellRow + 1, columns, rows);
                writtenVertices = appendAvsWarpVertex(writtenVertices, cellColumn, cellRow + 1, columns, rows);
                writtenVertices = appendAvsWarpVertex(writtenVertices, cellColumn + 1, cellRow, columns, rows);
                writtenVertices = appendAvsWarpVertex(writtenVertices, cellColumn + 1, cellRow + 1, columns, rows);
            }
        }
        drawAvsDynamicMovementMesh(sourceTarget, settings.blend !== 0, writtenVertices);
    }

    function renderAvsRenderStateRenderer(renderer, isBeat) {
        if (!prepareAvsFrameProgram(renderer, isBeat)) {
            return;
        }
        var columns = Math.max(12, Math.min(24, Math.round(canvas.width / 120)));
        var rows = Math.max(7, Math.min(14, Math.round(canvas.height / 120)));
        var sampleCount = columns * rows;
        ensureAvsStackVertexCapacity(sampleCount, renderer.texer ? 48 : 6);

        var suite = renderer.suite;
        var scope = renderer.scope;
        var color = renderer.colors && renderer.colors.length > 0 ? renderer.colors[0].raw : 0x8af6ff;
        var vertexCount = 0;
        for (var row = 0; row < rows; row++) {
            var y = rows <= 1 ? 0 : (row / (rows - 1)) * 2 - 1;
            for (var column = 0; column < columns; column++) {
                var index = row * columns + column;
                var i = index / Math.max(1, sampleCount - 1);
                var x = columns <= 1 ? 0 : (column / (columns - 1)) * 2 - 1;
                var d = Math.sqrt(x * x + y * y);
                var r = Math.atan2(y, x);
                setAvsPointInput(renderer, i, x, y, r, d, color, 0.46);
                if (!runAvsStackProgram(suite, suite.point, scope)) {
                    return;
                }
                readAvsStackPoint(renderer, avsStackPointScratch, avsStackBaseScratch);
                if (avsStackPointScratch[5] > 0.01
                        && avsStackPointScratch[0] > -1.25 && avsStackPointScratch[0] < 1.25
                        && avsStackPointScratch[1] > -1.25 && avsStackPointScratch[1] < 1.25) {
                    vertexCount = addAvsStackPointTo(avsStackVertices, vertexCount, avsStackPointScratch, 2,
                            renderer.texer);
                }
            }
        }
        drawAvsVertices(avsStackVertices, vertexCount, renderer.lineMode.blendMode);
    }

    function ensureAvsEffectListTargets(node) {
        var state = ensureAvsFramebuffers();
        if (!state) {
            return false;
        }
        if (node.front && node.scratch && node.front.width === state.width && node.front.height === state.height
                && node.scratch.width === state.width && node.scratch.height === state.height) {
            return true;
        }
        destroyAvsRenderTarget(node.front);
        destroyAvsRenderTarget(node.scratch);
        node.front = createAvsRenderTarget(state.width, state.height);
        node.scratch = createAvsRenderTarget(state.width, state.height);
        if (!node.front || !node.scratch) {
            destroyAvsRenderTarget(node.front);
            destroyAvsRenderTarget(node.scratch);
            node.front = null;
            node.scratch = null;
            return false;
        }
        clearAvsRenderTarget(node.front);
        clearAvsRenderTarget(node.scratch);
        bindAvsLineTarget(state.front);
        return true;
    }

    function avsEffectListEnabled(node, isBeat) {
        var settings = node.settings || {};
        if (isBeat && settings.beatRender) {
            node.beatFramesRemaining = Math.max(1, Math.round(settings.beatRenderFrames || 1));
        }
        var enabled = settings.enabled !== false;
        if (!enabled && node.beatFramesRemaining <= 0) {
            return false;
        }
        if (node.beatFramesRemaining > 0) {
            node.beatFramesRemaining--;
        }
        return true;
    }

    function renderAvsRuntimeNodes(nodes, isBeat) {
        for (var index = 0; index < nodes.length && !avsStackRuntimeFailed; index++) {
            renderAvsRuntimeNode(nodes[index], isBeat);
        }
    }

    function renderAvsRuntimeNode(node, isBeat) {
        if (node.kind === "effectList") {
            renderAvsEffectListNode(node, isBeat);
            return;
        }
        renderAvsStackRenderer(node, isBeat);
    }

    function renderAvsEffectListNode(node, isBeat) {
        var settings = node.settings || {};
        var children = node.children || [];
        if (children.length === 0 || !avsEffectListEnabled(node, isBeat)) {
            return;
        }

        var state = ensureAvsFramebuffers();
        if (!state) {
            return;
        }
        if (settings.blendInMode === 1 && settings.blendOutMode === 1) {
            if (settings.clearFrameBuffer) {
                clearAvsRenderTarget(state.front);
                bindAvsLineTarget(state.front);
            }
            renderAvsRuntimeNodes(children, isBeat);
            return;
        }

        if (!ensureAvsEffectListTargets(node)) {
            renderAvsRuntimeNodes(children, isBeat);
            return;
        }

        var parentFront = state.front;
        var parentScratch = state.scratch;
        if (settings.clearFrameBuffer) {
            clearAvsRenderTarget(node.front);
            clearAvsRenderTarget(node.scratch);
        }
        blendAvsTextureToTarget(parentFront.texture, node.front, settings.blendInMode || 0,
                settings.inBlendValue, node.scratch);

        state.front = node.front;
        state.scratch = node.scratch;
        bindAvsLineTarget(state.front);
        renderAvsRuntimeNodes(children, isBeat);
        node.front = state.front;
        node.scratch = state.scratch;

        state.front = parentFront;
        state.scratch = parentScratch;
        blendAvsTextureToTarget(node.front.texture, parentFront, settings.blendOutMode || 0,
                settings.outBlendValue, parentScratch);
        bindAvsLineTarget(state.front);
    }

    function renderAvsPreset(now) {
        var runtime = getAvsStackRuntime();
        if (!runtime || !lineProgram || !lineBuffer) {
            renderProceduralTunnel(now);
            return;
        }
        var framebuffers = ensureAvsFramebuffers();
        if (!framebuffers) {
            renderProceduralTunnel(now);
            return;
        }
        if (paused && avsStackFrameStarted) {
            copyAvsTextureToScreen(framebuffers.front.texture);
            return;
        }

        bindAvsLineTarget(framebuffers.front);

        if (!avsStackFrameStarted) {
            gl.clearColor(0, 0, 0, 1);
            gl.clear(gl.COLOR_BUFFER_BIT);
            avsStackFrameStarted = true;
        } else if (runtime.fadeAlpha > 0) {
            setAvsFadeAlpha(runtime.fadeAlpha);
            gl.bufferData(gl.ARRAY_BUFFER, avsFadeVertices, gl.STATIC_DRAW);
            gl.enable(gl.BLEND);
            gl.blendEquation(gl.FUNC_ADD);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
        }

        var isBeat = detectAvsStackBeat(now);
        renderAvsRuntimeNodes(runtime.nodes, isBeat);
        gl.blendEquation(gl.FUNC_ADD);
        gl.disable(gl.BLEND);
        copyAvsTextureToScreen(avsFramebufferState.front.texture);
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
        if (!avsNeonHost) {
            avsNeonHost = {
                waveformSamples: waveformSamples,
                spectrumSamples: spectrumSamples,
                rms: audio.rms,
                visualTimeSeconds: visualTimeSeconds,
                getosc: function (position) {
                    return getOsc(position);
                },
                getspec: function (position, band, channel) {
                    return getSpec(position, band, channel);
                }
            };
        }
        avsNeonHost.waveformSamples = waveformSamples;
        avsNeonHost.spectrumSamples = spectrumSamples;
        avsNeonHost.rms = audio.rms;
        avsNeonHost.visualTimeSeconds = visualTimeSeconds;
        return avsNeonHost;
    }

    function getAvsRuntimeSlots(runtime) {
        if (!avsNeonSlots && runtime && typeof runtime.slots === "function") {
            avsNeonSlots = runtime.slots(["n", "w", "h", "i", "x", "y", "red", "green", "blue"]);
            avsNeonFastSlotsReady = avsNeonSlots.n >= 0
                    && avsNeonSlots.w >= 0
                    && avsNeonSlots.h >= 0
                    && avsNeonSlots.i >= 0
                    && avsNeonSlots.x >= 0
                    && avsNeonSlots.y >= 0
                    && avsNeonSlots.red >= 0
                    && avsNeonSlots.green >= 0
                    && avsNeonSlots.blue >= 0;
        }
        return avsNeonSlots;
    }

    function runtimeGet(runtime, scope, name) {
        var slots = getAvsRuntimeSlots(runtime);
        return slots && typeof runtime.getSlot === "function"
                ? runtime.getSlot(scope, slots[name])
                : runtime.get(scope, name);
    }

    function runtimeSet(runtime, scope, name, value) {
        var slots = getAvsRuntimeSlots(runtime);
        if (slots && typeof runtime.setSlot === "function") {
            runtime.setSlot(scope, slots[name], value);
        } else {
            runtime.set(scope, name, value);
        }
    }

    function readAvsRuntimePoint(runtime, scope, out) {
        var slots = getAvsRuntimeSlots(runtime);
        if (slots && typeof runtime.getSlot === "function") {
            out[0] = runtime.getSlot(scope, slots.x) || 0;
            out[1] = runtime.getSlot(scope, slots.y) || 0;
            out[2] = clamp(runtime.getSlot(scope, slots.red) || 0, 0, 1);
            out[3] = clamp(runtime.getSlot(scope, slots.green) || 0, 0, 1);
            out[4] = clamp(runtime.getSlot(scope, slots.blue) || 0, 0, 1);
            return out;
        }
        out[0] = runtime.get(scope, "x") || 0;
        out[1] = runtime.get(scope, "y") || 0;
        out[2] = clamp(runtime.get(scope, "red") || 0, 0, 1);
        out[3] = clamp(runtime.get(scope, "green") || 0, 0, 1);
        out[4] = clamp(runtime.get(scope, "blue") || 0, 0, 1);
        return out;
    }

    function fallbackStatePoint(out) {
        out[0] = avsNeonState.x || 0;
        out[1] = avsNeonState.y || 0;
        out[2] = clamp(avsNeonState.red || 0, 0, 1);
        out[3] = clamp(avsNeonState.green || 0, 0, 1);
        out[4] = clamp(avsNeonState.blue || 0, 0, 1);
        return out;
    }

    function copyAvsPoint(source, target) {
        target[0] = source[0];
        target[1] = source[1];
        target[2] = source[2];
        target[3] = source[3];
        target[4] = source[4];
        target[5] = source[5];
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
            avsNeonSlots = null;
            avsNeonFastSlotsReady = false;
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
            getAvsRuntimeSlots(runtime);
            if (!runAvsEelProgram(runtime.init, avsNeonEelScope)) {
                avsNeonEelScope = null;
                return false;
            }
            avsNeonState.n = runtimeGet(runtime, avsNeonEelScope, "n") || avsNeonState.n;
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
            runtimeSet(runtime, scope, "w", width);
            runtimeSet(runtime, scope, "h", Math.max(1, height));
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
            avsNeonState.n = runtimeGet(runtime, scope, "n") || avsNeonState.n;
        }
        return true;
    }

    function runAvsNeonPointProgram(pointIndex, renderedSampleCount, out) {
        var runtime = getAvsNeonRuntime();
        if (!runtime) {
            return null;
        }
        var scope = avsNeonEelScope || avsNeonState;
        var sampleCount = renderedSampleCount || avsNeonState.n;
        if (typeof runtime.set === "function") {
            runtimeSet(runtime, scope, "i", pointIndex / Math.max(1, sampleCount - 1));
        } else {
            avsNeonState.i = pointIndex / Math.max(1, sampleCount - 1);
        }
        if (!runAvsEelProgram(runtime.point, scope)) {
            return null;
        }
        if (typeof runtime.get === "function") {
            return readAvsRuntimePoint(runtime, scope, out);
        }
        return fallbackStatePoint(out);
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

    function avsNeonPoint(pointIndex, renderedSampleCount, out) {
        var runtimePoint = runAvsNeonPointProgram(pointIndex, renderedSampleCount, out);
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
        out[0] = x;
        out[1] = y;
        out[2] = clamp(bx * (u1 * s.cr + u2), 0, 1);
        out[3] = clamp(bx * (u1 * s.cg + u2), 0, 1);
        out[4] = clamp(bx * (u1 * s.cb + u2), 0, 1);
        return out;
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

    function writeAvsVertex(vertices, offset, x, y, r, g, b, a) {
        vertices[offset] = x;
        vertices[offset + 1] = y;
        vertices[offset + 2] = r;
        vertices[offset + 3] = g;
        vertices[offset + 4] = b;
        vertices[offset + 5] = a;
    }

    function writeAvsNeonVertex(offset, x, y, r, g, b, a) {
        writeAvsVertex(avsNeonVertices, offset, x, y, r, g, b, a);
    }

    function avsPixelToClipX(x) {
        return (x * 2 / Math.max(1, canvas.width)) - 1;
    }

    function avsPixelToClipY(y) {
        return 1 - (y * 2 / Math.max(1, canvas.height));
    }

    function addAvsLineQuad(vertexCount, x1, y1, x2, y2, x3, y3, x4, y4, r, g, b, a) {
        return addAvsLineQuadTo(avsNeonVertices, vertexCount, x1, y1, x2, y2, x3, y3, x4, y4, r, g, b, a);
    }

    function addAvsLineQuadTo(vertices, vertexCount, x1, y1, x2, y2, x3, y3, x4, y4, r, g, b, a) {
        var offset = vertexCount * 6;
        if (offset + 35 >= vertices.length) {
            return vertexCount;
        }
        writeAvsVertex(vertices, offset, avsPixelToClipX(x1), avsPixelToClipY(y1), r, g, b, a);
        writeAvsVertex(vertices, offset + 6, avsPixelToClipX(x2), avsPixelToClipY(y2), r, g, b, a);
        writeAvsVertex(vertices, offset + 12, avsPixelToClipX(x3), avsPixelToClipY(y3), r, g, b, a);
        writeAvsVertex(vertices, offset + 18, avsPixelToClipX(x3), avsPixelToClipY(y3), r, g, b, a);
        writeAvsVertex(vertices, offset + 24, avsPixelToClipX(x2), avsPixelToClipY(y2), r, g, b, a);
        writeAvsVertex(vertices, offset + 30, avsPixelToClipX(x4), avsPixelToClipY(y4), r, g, b, a);
        return vertexCount + 6;
    }

    function addAvsNeonSegment(vertexCount, start, end) {
        return addAvsSegmentTo(avsNeonVertices, vertexCount, start, end, avsNeonLineWidthPx);
    }

    function addAvsPixelSegmentTo(vertices, vertexCount, x1, y1, x2, y2, color, alpha, lineWidth) {
        var dx = Math.abs(x2 - x1);
        var dy = Math.abs(y2 - y1);
        if (!dx && !dy) {
            return vertexCount;
        }

        var width = Math.max(1, Math.min(64, Math.round(lineWidth || 1)));
        var lw2 = Math.floor(width / 2);
        var r = avsRawRed(color);
        var g = avsRawGreen(color);
        var b = avsRawBlue(color);
        var a = clamp(alpha == null ? 1 : alpha, 0, 1);
        if (!dx) {
            return addAvsLineQuadTo(vertices, vertexCount, x1 - lw2, y1, x1 - lw2 + width, y1,
                    x2 - lw2, y2, x2 - lw2 + width, y2, r, g, b, a);
        }
        if (!dy) {
            return addAvsLineQuadTo(vertices, vertexCount, x1, y1 - lw2, x2, y2 - lw2,
                    x1, y1 - lw2 + width, x2, y2 - lw2 + width, r, g, b, a);
        }
        if (dy <= dx) {
            return addAvsLineQuadTo(vertices, vertexCount, x1, y1 - lw2, x2, y2 - lw2,
                    x1, y1 - lw2 + width, x2, y2 - lw2 + width, r, g, b, a);
        }
        return addAvsLineQuadTo(vertices, vertexCount, x1 - lw2, y1, x2 - lw2, y2,
                x1 - lw2 + width, y1, x2 - lw2 + width, y2, r, g, b, a);
    }

    function addAvsPixelPointTo(vertices, vertexCount, x, y, color, alpha, lineWidth) {
        var size = Math.max(1, Math.min(24, Math.round(lineWidth || 1)));
        var half = Math.max(1, Math.floor(size / 2));
        return addAvsLineQuadTo(vertices, vertexCount, x - half, y - half, x + half, y - half,
                x - half, y + half, x + half, y + half,
                avsRawRed(color), avsRawGreen(color), avsRawBlue(color),
                clamp(alpha == null ? 1 : alpha, 0, 1));
    }

    function addAvsSegmentTo(vertices, vertexCount, start, end, lineWidth) {
        var x1 = Math.trunc((start[0] + 1) * canvas.width * 0.5);
        var y1 = Math.trunc((start[1] + 1) * canvas.height * 0.5);
        var x2 = Math.trunc((end[0] + 1) * canvas.width * 0.5);
        var y2 = Math.trunc((end[1] + 1) * canvas.height * 0.5);
        var dx = Math.abs(x2 - x1);
        var dy = Math.abs(y2 - y1);
        if (!dx && !dy) {
            return vertexCount;
        }

        var width = Math.max(1, Math.min(64, Math.round(lineWidth || 1)));
        var lw2 = Math.floor(width / 2);
        var r = end[2];
        var g = end[3];
        var b = end[4];
        var a = end[5];
        if (!dx) {
            return addAvsLineQuadTo(vertices, vertexCount, x1 - lw2, y1, x1 - lw2 + width, y1,
                    x2 - lw2, y2, x2 - lw2 + width, y2, r, g, b, a);
        }
        if (!dy) {
            return addAvsLineQuadTo(vertices, vertexCount, x1, y1 - lw2, x2, y2 - lw2,
                    x1, y1 - lw2 + width, x2, y2 - lw2 + width, r, g, b, a);
        }
        if (dy <= dx) {
            return addAvsLineQuadTo(vertices, vertexCount, x1, y1 - lw2, x2, y2 - lw2,
                    x1, y1 - lw2 + width, x2, y2 - lw2 + width, r, g, b, a);
        }
        return addAvsLineQuadTo(vertices, vertexCount, x1 - lw2, y1, x2 - lw2, y2,
                x1 - lw2 + width, y1, x2 - lw2 + width, y2, r, g, b, a);
    }

    function addAvsPointQuadTo(vertices, vertexCount, pointValue, lineWidth) {
        var x = Math.trunc((pointValue[0] + 1) * canvas.width * 0.5);
        var y = Math.trunc((pointValue[1] + 1) * canvas.height * 0.5);
        var size = Math.max(2, Math.min(24, Math.round(lineWidth || 2)));
        var half = Math.max(1, Math.floor(size / 2));
        return addAvsLineQuadTo(vertices, vertexCount, x - half, y - half, x + half, y - half,
                x - half, y + half, x + half, y + half,
                pointValue[2], pointValue[3], pointValue[4], pointValue[5]);
    }

    function addAvsStackPointTo(vertices, vertexCount, pointValue, lineWidth, texer) {
        if (texer) {
            return addAvsTexerSpriteTo(vertices, vertexCount, pointValue, texer);
        }
        return addAvsPointQuadTo(vertices, vertexCount, pointValue, lineWidth);
    }

    function addAvsTexerSpriteTo(vertices, vertexCount, pointValue, texer) {
        var x = Math.trunc((pointValue[0] + 1) * canvas.width * 0.5);
        var y = Math.trunc((pointValue[1] + 1) * canvas.height * 0.5);
        var scale = Math.max(0.75, Math.min(2.2, Math.min(canvas.width / 1280, canvas.height / 720)));
        var radius = Math.max(4, Math.min(32,
                Math.round((texer.size || 13) * scale * (0.92 + audio.treb * 0.16))));
        var lineWidth = Math.max(1, Math.min(4, Math.round(radius / 6)));
        var alpha = pointValue[5] * (texer.intensity || 0.55);
        var r = pointValue[2];
        var g = pointValue[3];
        var b = pointValue[4];
        var segments = 6;
        var previousX = x + radius;
        var previousY = y;
        for (var segment = 1; segment <= segments; segment++) {
            var angle = segment / segments * Math.PI * 2;
            var currentX = x + Math.cos(angle) * radius;
            var currentY = y + Math.sin(angle) * radius;
            var dx = currentX - previousX;
            var dy = currentY - previousY;
            var length = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
            var nx = -dy / length * lineWidth;
            var ny = dx / length * lineWidth;
            vertexCount = addAvsLineQuadTo(vertices, vertexCount,
                    previousX + nx, previousY + ny, currentX + nx, currentY + ny,
                    previousX - nx, previousY - ny, currentX - nx, currentY - ny,
                    r, g, b, alpha * 0.58);
            previousX = currentX;
            previousY = currentY;
        }
        return vertexCount;
    }

    function drawAvsVertices(vertices, vertexCount, blendMode) {
        if (vertexCount <= 0) {
            return;
        }
        gl.bufferData(gl.ARRAY_BUFFER, vertices.subarray(0, vertexCount * 6), gl.DYNAMIC_DRAW);
        gl.enable(gl.BLEND);
        gl.blendEquation(blendMode === "maximum" ? gl.MAX : gl.FUNC_ADD);
        gl.blendFunc(blendMode === "replace" ? gl.SRC_ALPHA : gl.ONE,
                blendMode === "replace" ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE);
        gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
    }

    function renderNeonCoaster(now) {
        if (!lineProgram || !lineBuffer) {
            return;
        }
        if (paused && avsNeonFrameStarted) {
            return;
        }
        updateAvsNeonFrame(now, canvas.width, canvas.height);
        var count = avsNeonState.n;
        var runtime = avsNeonRuntime;
        var scope = avsNeonEelScope;
        var slots = avsNeonSlots;
        var values = scope && scope.values && slots && avsNeonFastSlotsReady ? scope.values : null;
        var pointProgram = runtime && runtime.point;
        var host = values && pointProgram ? avsEelHost() : null;
        var step = 1 / Math.max(1, count - 1);
        var vertexCount = 0;
        var hasPrevious = false;
        try {
            for (var i = 0; i < count; i++) {
                if (values && pointProgram) {
                    values[slots.i] = i * step;
                    pointProgram.run(scope, host);
                    avsNeonPointScratch[0] = values[slots.x] || 0;
                    avsNeonPointScratch[1] = values[slots.y] || 0;
                    avsNeonPointScratch[2] = clamp(values[slots.red] || 0, 0, 1);
                    avsNeonPointScratch[3] = clamp(values[slots.green] || 0, 0, 1);
                    avsNeonPointScratch[4] = clamp(values[slots.blue] || 0, 0, 1);
                } else {
                    avsNeonPoint(i, count, avsNeonPointScratch);
                }
                var alpha = Math.max(avsNeonPointScratch[2], avsNeonPointScratch[3], avsNeonPointScratch[4]) > 0 ? 0.96 : 0;
                avsNeonPointScratch[5] = alpha;
                if (hasPrevious && avsNeonPreviousScratch[5] > 0 && alpha > 0) {
                    var distance = Math.abs(avsNeonPreviousScratch[0] - avsNeonPointScratch[0])
                            + Math.abs(avsNeonPreviousScratch[1] - avsNeonPointScratch[1]);
                    if (distance < 1.4) {
                        vertexCount = addAvsNeonSegment(vertexCount, avsNeonPreviousScratch, avsNeonPointScratch);
                    }
                }
                copyAvsPoint(avsNeonPointScratch, avsNeonPreviousScratch);
                hasPrevious = true;
            }
        } catch (exception) {
            avsNeonRuntimeFailed = true;
            avsNeonRuntime = null;
            avsNeonSlots = null;
            avsNeonFastSlotsReady = false;
            if (window.console && typeof window.console.error === "function") {
                window.console.error("AVS EEL point runtime failed", exception);
            }
            renderProceduralTunnel(now);
            return;
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
            setAvsFadeAlpha(avsFastBrightnessFadeAlpha);
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

    function createAvsCopyProgram() {
        return createLinkedProgram(vertexSource, avsCopyFragmentSource);
    }

    function createAvsBlendProgram() {
        return createLinkedProgram(vertexSource, avsBlendFragmentSource);
    }

    function createAvsWarpProgram() {
        return createLinkedProgram(avsWarpVertexSource, avsWarpFragmentSource);
    }

    function createAvsFeedbackProgram() {
        return createLinkedProgram(vertexSource, avsFeedbackFragmentSource);
    }

    function createAvsColorFadeProgram() {
        return createLinkedProgram(vertexSource, avsColorFadeFragmentSource);
    }

    function resize() {
        var ratio = currentRenderScale();
        var width = Math.max(320, Math.floor(window.innerWidth * ratio));
        var height = Math.max(180, Math.floor(window.innerHeight * ratio));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
            resetAvsFramebuffers();
            releaseAvsRuntimeFramebuffers(avsStackRuntime);
            avsNeonFrameStarted = false;
            avsStackFrameStarted = false;
            if (gl) {
                gl.viewport(0, 0, width, height);
            }
        }
        if (Math.abs(lastReportedRenderScale - ratio) > 0.001) {
            lastReportedRenderScale = ratio;
            safeBridge("reportEvent", "visualizer_render_scale_" + ratio.toFixed(2));
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

    function updateSpectrumTargetsFromFft(bytes) {
        if (!bytes || bytes.length < 8) {
            return false;
        }

        var halfBins = Math.max(1, Math.floor(bytes.length / 2) - 1);
        var maxBin = Math.min(halfBins, Math.max(spectrumSize + 2, Math.floor(bytes.length / 12)));
        var framePeak = 0;
        for (var index = 0; index < spectrumSize; index++) {
            var start = index / Math.max(1, spectrumSize);
            var end = (index + 1) / Math.max(1, spectrumSize);
            var startBin = 1 + Math.round(frequencyCurve(start) * (maxBin - 1));
            var endBin = 1 + Math.round(frequencyCurve(end) * (maxBin - 1));
            endBin = Math.max(startBin, endBin);

            var sum = 0;
            var peak = 0;
            var count = 0;
            for (var bin = startBin; bin <= endBin; bin++) {
                var magnitude = fftMagnitude(bytes, bin);
                sum += magnitude;
                peak = Math.max(peak, magnitude);
                count++;
            }

            var average = count > 0 ? sum / count : 0;
            var raw = average * 0.72 + peak * 0.28;
            spectrumRawTargets[index] = raw;
            framePeak = Math.max(framePeak, raw);
        }

        var targetCeiling = Math.max(0.10, framePeak * 1.85);
        spectrumCeiling += (targetCeiling - spectrumCeiling) * (targetCeiling > spectrumCeiling ? 0.24 : 0.035);
        var ceiling = Math.max(0.10, spectrumCeiling);
        for (var targetIndex = 0; targetIndex < spectrumSize; targetIndex++) {
            var normalized = clamp(spectrumRawTargets[targetIndex] / ceiling, 0, 1.4);
            spectrumTargets[targetIndex] = Math.pow(normalized, 1.18);
        }
        smoothSpectrumTargets();
        return true;
    }

    function updateSpectrumTargetsFromEnergy(now) {
        var t = now * 0.001;
        var peak = 0;
        for (var index = 0; index < spectrumSize; index++) {
            var position = index / Math.max(1, spectrumSize - 1);
            var bass = Math.max(0, 1 - position * 4.0) * audio.targetBass;
            var mid = Math.max(0, 1 - Math.abs(position - 0.34) * 3.2) * audio.targetMid;
            var treb = Math.max(0, 1 - Math.abs(position - 0.76) * 2.4) * audio.targetTreb;
            var ripple = 0.12 * Math.abs(Math.sin(t * 2.8 + index * 0.31));
            var target = Math.min(1.15, bass * 0.90 + mid * 0.74 + treb * 0.66 + ripple * audio.targetRms);
            spectrumTargets[index] = target;
            peak = Math.max(peak, target);
        }
        spectrumCeiling += (Math.max(0.10, peak) - spectrumCeiling) * 0.06;
        smoothSpectrumTargets();
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
        updateSpectrumTargetsFromEnergy(now);
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
            avsPresetId: preset.avsPresetId || "",
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

    function renderProceduralTunnel(now) {
        gl.useProgram(program);
        bindTunnelGeometry();
        applyPresetUniforms(now);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
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

        setCoasterVisible(false);
        if (isCoasterPreset()) {
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

        if (isAvsPreset()) {
            try {
                renderAvsPreset(now);
            } catch (exception) {
                running = false;
                safeBridge("reportError", "avs_render_failed:" + exception.message);
                return;
            }
            reportMetrics(now);
            window.requestAnimationFrame(render);
            return;
        }

        try {
            renderProceduralTunnel(now);
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
        resetAvsStackRuntime();
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

    function initAvsWarpGeometry() {
        avsWarpBuffer = gl.createBuffer();
    }

    function initAvsPassLocations() {
        avsCopyLocations.position = gl.getAttribLocation(avsCopyProgram, "a_position");
        avsCopyLocations.texture = gl.getUniformLocation(avsCopyProgram, "u_texture");
        avsCopyLocations.opacity = gl.getUniformLocation(avsCopyProgram, "u_opacity");
        avsCopyLocations.gain = gl.getUniformLocation(avsCopyProgram, "u_gain");
        avsBlendLocations.position = gl.getAttribLocation(avsBlendProgram, "a_position");
        avsBlendLocations.source = gl.getUniformLocation(avsBlendProgram, "u_source");
        avsBlendLocations.destination = gl.getUniformLocation(avsBlendProgram, "u_destination");
        avsBlendLocations.resolution = gl.getUniformLocation(avsBlendProgram, "u_resolution");
        avsBlendLocations.mode = gl.getUniformLocation(avsBlendProgram, "u_mode");
        avsBlendLocations.adjust = gl.getUniformLocation(avsBlendProgram, "u_adjust");
        avsWarpLocations.position = gl.getAttribLocation(avsWarpProgram, "a_position");
        avsWarpLocations.uv = gl.getAttribLocation(avsWarpProgram, "a_uv");
        avsWarpLocations.alpha = gl.getAttribLocation(avsWarpProgram, "a_alpha");
        avsWarpLocations.source = gl.getUniformLocation(avsWarpProgram, "u_source");
        avsWarpLocations.destination = gl.getUniformLocation(avsWarpProgram, "u_destination");
        avsWarpLocations.blend = gl.getUniformLocation(avsWarpProgram, "u_blend");
        avsFeedbackLocations.position = gl.getAttribLocation(avsFeedbackProgram, "a_position");
        avsFeedbackLocations.texture = gl.getUniformLocation(avsFeedbackProgram, "u_texture");
        avsFeedbackLocations.resolution = gl.getUniformLocation(avsFeedbackProgram, "u_resolution");
        avsFeedbackLocations.mode = gl.getUniformLocation(avsFeedbackProgram, "u_mode");
        avsFeedbackLocations.amount = gl.getUniformLocation(avsFeedbackProgram, "u_amount");
        avsFeedbackLocations.time = gl.getUniformLocation(avsFeedbackProgram, "u_time");
        avsFeedbackLocations.audio = gl.getUniformLocation(avsFeedbackProgram, "u_audio");
        avsColorFadeLocations.position = gl.getAttribLocation(avsColorFadeProgram, "a_position");
        avsColorFadeLocations.texture = gl.getUniformLocation(avsColorFadeProgram, "u_texture");
        avsColorFadeLocations.faders = gl.getUniformLocation(avsColorFadeProgram, "u_faders");
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
            avsCopyProgram = createAvsCopyProgram();
            avsBlendProgram = createAvsBlendProgram();
            avsWarpProgram = createAvsWarpProgram();
            avsFeedbackProgram = createAvsFeedbackProgram();
            avsColorFadeProgram = createAvsColorFadeProgram();
            gl.useProgram(program);
            initGeometry();
            initLineGeometry();
            initAvsWarpGeometry();
            initAvsPassLocations();
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
        consumeAudio: function (timestampMs, base64, mode, fftBase64) {
            var applied = false;
            var spectrumApplied = false;
            if (mode === "real" && base64) {
                applied = updateAudioTargetsFromWaveform(decodeBase64(base64));
            }
            if (mode === "real" && fftBase64) {
                spectrumApplied = updateSpectrumTargetsFromFft(decodeBase64(fftBase64));
            }
            if (!applied) {
                updateSyntheticTargets(performance.now());
            } else if (!spectrumApplied) {
                updateSpectrumTargetsFromEnergy(performance.now());
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
