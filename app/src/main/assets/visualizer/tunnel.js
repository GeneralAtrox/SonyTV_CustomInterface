(function () {
    var bridge = window.AndroidVisualizer || null;
    var canvas = document.getElementById("tunnel");
    var coasterCanvas = document.getElementById("coaster");
    var coasterContext = coasterCanvas ? coasterCanvas.getContext("2d") : null;
    var presetOverlay = document.getElementById("presetOverlay");
    var presetName = document.getElementById("presetName");
    var gl = null;
    var program = null;
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
            name: "UnConeD Neon Coaster",
            mode: "coaster",
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
        return presets[presetIndex].mode === "coaster" && coasterContext;
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
        var hue = (visualTimeSeconds * 18 + sampleIndex * 4.6 + audio.mid * 80) % 360;
        var lightness = Math.max(42, Math.min(72, 58 + audio.rms * 24 - depth * 2));
        return "hsla(" + hue + ", 92%, " + lightness + "%, 0.82)";
    }

    function drawCoasterLine(ctx, start, end, color, width, blur) {
        if (!start || !end) {
            return;
        }
        ctx.lineWidth = width;
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = blur;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
    }

    function renderNeonCoaster(now) {
        if (!coasterContext || !coasterCanvas) {
            return;
        }
        var ctx = coasterContext;
        var width = coasterCanvas.width;
        var height = coasterCanvas.height;
        var ridePosition = wrap01(visualTimeSeconds * 0.026);
        var camera = coasterCamera(ridePosition);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "rgb(1, 2, 6)";
        ctx.fillRect(0, 0, width, height);

        var gradient = ctx.createRadialGradient(width * 0.5, height * 0.56, 0, width * 0.5, height * 0.56, width * 0.72);
        gradient.addColorStop(0, "rgba(30, 16, 45, 0.18)");
        gradient.addColorStop(0.55, "rgba(0, 22, 42, 0.10)");
        gradient.addColorStop(1, "rgba(0, 0, 0, 0.82)");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = "lighter";

        var segments = [];
        var samples = 210;
        var trackAhead = 0.72;
        var lastLeft = null;
        var lastRight = null;
        for (var i = 0; i <= samples; i++) {
            var position = ridePosition + 0.018 + i * trackAhead / samples;
            var left = projectCoasterPoint(coasterRailPoint(position, -1), camera, width, height);
            var right = projectCoasterPoint(coasterRailPoint(position, 1), camera, width, height);
            if (lastLeft && left) {
                segments.push({ start: lastLeft, end: left, index: i, kind: "rail", depth: (lastLeft.z + left.z) * 0.5 });
            }
            if (lastRight && right) {
                segments.push({ start: lastRight, end: right, index: i, kind: "rail", depth: (lastRight.z + right.z) * 0.5 });
            }
            if (i % 7 === 0 && left && right) {
                segments.push({ start: left, end: right, index: i, kind: "tie", depth: (left.z + right.z) * 0.5 });
            }
            lastLeft = left;
            lastRight = right;
        }

        segments.sort(function (a, b) { return b.depth - a.depth; });
        for (var j = 0; j < segments.length; j++) {
            var segment = segments[j];
            var near = Math.max(0, Math.min(1, 1.25 / Math.max(0.14, segment.depth)));
            var railWidth = (segment.kind === "tie" ? 0.8 : 1.15) + near * (segment.kind === "tie" ? 3.0 : 5.8);
            var blur = 7 + near * 20 + audio.treb * 14;
            var color = coasterColor(segment.index, segment.depth);
            if (segment.kind === "tie") {
                color = "rgba(170, 230, 255, " + (0.12 + near * 0.28) + ")";
            }
            drawCoasterLine(ctx, segment.start, segment.end, color, railWidth, blur);
        }

        ctx.globalCompositeOperation = "source-over";
        var vignette = ctx.createRadialGradient(width * 0.5, height * 0.56, height * 0.08, width * 0.5, height * 0.56, width * 0.74);
        vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
        vignette.addColorStop(1, "rgba(0, 0, 0, 0.58)");
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, width, height);
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

    function createProgram() {
        var vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
        var fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
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

    function resize() {
        var ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        var width = Math.max(320, Math.floor(window.innerWidth * ratio));
        var height = Math.max(180, Math.floor(window.innerHeight * ratio));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
            if (gl) {
                gl.viewport(0, 0, width, height);
            }
        }
        if (coasterCanvas && (coasterCanvas.width !== width || coasterCanvas.height !== height)) {
            coasterCanvas.width = width;
            coasterCanvas.height = height;
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
        setCoasterVisible(useCoaster);
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
        updatePresetOverlay();
    }

    function togglePaused() {
        paused = !paused;
        updatePresetOverlay();
        safeBridge("reportEvent", paused ? "visualizer_paused" : "visualizer_resumed");
    }

    function initGeometry() {
        var buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,
            1, -1,
            -1, 1,
            -1, 1,
            1, -1,
            1, 1
        ]), gl.STATIC_DRAW);
        var positionLocation = gl.getAttribLocation(program, "a_position");
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
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
                premultipliedAlpha: false
            });
            if (!gl) {
                safeBridge("reportWebGl", false);
                safeBridge("reportError", "tunnel_webgl2_unavailable");
                return;
            }

            safeBridge("reportWebGl", true);
            resize();
            program = createProgram();
            gl.useProgram(program);
            initGeometry();
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
