(function () {
    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function identity(a) {
        return a;
    }

    function shaderWarp() {
        return "shader_body {\n"
            + "ret = texture2D(sampler_main, uv).rgb;\n"
            + "ret -= 0.003;\n"
            + "}\n";
    }

    function shaderComp() {
        return "shader_body {\n"
            + "ret = texture2D(sampler_main, uv).rgb;\n"
            + "ret *= hue_shader;\n"
            + "}\n";
    }

    function ringShape(seed, radius, red, green, blue) {
        return {
            baseVals: {
                enabled: 1,
                sides: 72,
                additive: 1,
                thickoutline: 0,
                textured: 0,
                x: 0.5,
                y: 0.5,
                rad: radius,
                ang: 0,
                r: red,
                g: green,
                b: blue,
                a: 0.10,
                r2: red * 0.25,
                g2: green * 0.25,
                b2: blue * 0.25,
                a2: 0.0,
                border_r: red,
                border_g: green,
                border_b: blue,
                border_a: 0.35
            },
            init_eqs: identity,
            frame_eqs: function (a) {
                var beat = clamp(a.bass_att, 0.65, 2.2);
                var bend = Math.sin(a.time * (0.82 + seed * 0.07) + seed);
                a.x = 0.5 + Math.sin(a.time * 0.31 + seed) * 0.13;
                a.y = 0.5 + Math.cos(a.time * 0.27 + seed * 1.7) * 0.09;
                a.rad = radius + 0.018 * bend + 0.018 * beat;
                a.ang = a.time * (0.18 + seed * 0.03);
                a.a = 0.07 + 0.07 * beat;
                return a;
            }
        };
    }

    function disabledShape() {
        return {
            baseVals: { enabled: 0 },
            init_eqs: identity,
            frame_eqs: identity
        };
    }

    function disabledWave() {
        return {
            baseVals: { enabled: 0 },
            init_eqs: identity,
            frame_eqs: identity,
            point_eqs: identity
        };
    }

    window.BRAVIA_PRESETS = [
        {
            name: "BRAVIA Tunnel Turns",
            author: "BRAVIA Launcher",
            baseVals: {
                decay: 0.965,
                gammaadj: 1.7,
                wrap: 1,
                darken_center: 0,
                brighten: 1,
                wave_mode: 2,
                wave_r: 0.60,
                wave_g: 0.92,
                wave_b: 1.00,
                wave_a: 0.58,
                wave_x: 0.5,
                wave_y: 0.5,
                wave_scale: 0.78,
                wave_smoothing: 0.82,
                modwavealphabyvolume: 1,
                modwavealphastart: 0.20,
                modwavealphaend: 1.15,
                mv_x: 18,
                mv_y: 14,
                mv_l: 0.58,
                mv_r: 0.08,
                mv_g: 0.95,
                mv_b: 1.00,
                mv_a: 0.42,
                bmotionvectorson: 1,
                warp: 0.72,
                warpscale: 1.2,
                warpanimspeed: 1.55,
                zoom: 1.055,
                zoomexp: 1.18,
                rot: 0.0,
                cx: 0.5,
                cy: 0.5,
                dx: 0.0,
                dy: 0.0,
                sx: 1.0,
                sy: 1.0,
                ob_size: 0.012,
                ob_r: 0.02,
                ob_g: 0.65,
                ob_b: 0.95,
                ob_a: 0.25
            },
            init_eqs: function (a) {
                a.q1 = 0;
                a.q2 = 0;
                return a;
            },
            frame_eqs: function (a) {
                var bass = clamp(a.bass_att, 0.7, 2.4);
                var mid = clamp(a.mid_att, 0.7, 2.0);
                var turn = Math.floor(a.time * 0.55) % 4;
                var snap = (turn === 0 || turn === 3) ? 1 : -1;
                a.cx = 0.5 + Math.sin(a.time * 0.47) * 0.16 + snap * 0.035 * Math.sin(a.time * 3.2);
                a.cy = 0.5 + Math.cos(a.time * 0.39) * 0.12;
                a.dx = 0.018 * Math.sin(a.time * 1.4);
                a.dy = 0.014 * Math.cos(a.time * 1.1);
                a.zoom = 1.045 + 0.015 * bass;
                a.rot = 0.030 * Math.sin(a.time * 0.92) + snap * 0.015 * bass;
                a.warp = 0.48 + 0.16 * mid;
                a.mv_a = 0.23 + 0.14 * bass;
                a.wave_a = 0.35 + 0.22 * mid;
                return a;
            },
            pixel_eqs: function (a) {
                var twist = Math.sin(a.rad * 23.0 - a.time * 5.0 + Math.sin(a.ang * 5.0 + a.time * 1.7) * 1.8);
                var corner = Math.sin(a.time * 0.72 + Math.floor(a.rad * 4.0));
                a.rot = a.rot + twist * 0.075 * (1.05 - clamp(a.rad, 0.0, 1.05));
                a.zoom = a.zoom + 0.035 * Math.sin(a.rad * 32.0 - a.time * 6.2) + 0.018 * corner;
                return a;
            },
            shapes: [
                ringShape(1, 0.12, 0.05, 0.80, 1.00),
                ringShape(4, 0.22, 0.95, 0.08, 0.70)
            ],
            waves: [],
            warp: shaderWarp(),
            comp: shaderComp()
        },
        {
            name: "BRAVIA Chrome Pulse",
            author: "BRAVIA Launcher",
            baseVals: {
                decay: 0.942,
                gammaadj: 1.45,
                wrap: 1,
                brighten: 1,
                darken: 0,
                wave_mode: 5,
                wave_r: 1.00,
                wave_g: 0.86,
                wave_b: 0.32,
                wave_a: 0.72,
                wave_scale: 0.92,
                wave_smoothing: 0.70,
                bmotionvectorson: 1,
                mv_x: 24,
                mv_y: 18,
                mv_l: 0.42,
                mv_r: 0.90,
                mv_g: 0.30,
                mv_b: 1.00,
                mv_a: 0.26,
                warp: 0.58,
                zoom: 1.028,
                zoomexp: 1.35,
                rot: 0.0,
                cx: 0.5,
                cy: 0.5,
                sx: 1.0,
                sy: 1.0
            },
            init_eqs: identity,
            frame_eqs: function (a) {
                var pulse = clamp(a.bass_att, 0.6, 2.5);
                a.rot = 0.045 * Math.sin(a.time * 0.63) + 0.015 * pulse;
                a.zoom = 1.018 + 0.012 * pulse;
                a.cx = 0.5 + 0.10 * Math.sin(a.time * 0.21);
                a.cy = 0.5 + 0.10 * Math.cos(a.time * 0.24);
                a.warp = 0.38 + 0.15 * clamp(a.treb_att, 0.7, 2.0);
                return a;
            },
            pixel_eqs: function (a) {
                a.zoom = a.zoom + 0.025 * Math.sin(a.ang * 8.0 + a.time * 2.5);
                a.rot = a.rot + 0.050 * Math.sin(a.rad * 14.0 - a.time * 3.5);
                return a;
            },
            shapes: [ringShape(8, 0.18, 1.00, 0.80, 0.20)],
            waves: [],
            warp: shaderWarp(),
            comp: shaderComp()
        },
        {
            name: "BRAVIA Neon Fold",
            author: "BRAVIA Launcher",
            baseVals: {
                decay: 0.955,
                gammaadj: 1.9,
                wrap: 1,
                brighten: 1,
                wave_mode: 3,
                wave_r: 0.25,
                wave_g: 1.00,
                wave_b: 0.72,
                wave_a: 0.64,
                wave_scale: 1.15,
                bmotionvectorson: 1,
                mv_x: 16,
                mv_y: 12,
                mv_l: 0.55,
                mv_r: 0.30,
                mv_g: 1.00,
                mv_b: 0.65,
                mv_a: 0.28,
                warp: 0.66,
                zoom: 1.034,
                zoomexp: 1.08,
                rot: 0.0,
                cx: 0.5,
                cy: 0.5
            },
            init_eqs: identity,
            frame_eqs: function (a) {
                var energy = clamp((a.bass_att + a.mid_att) * 0.5, 0.6, 2.2);
                a.rot = 0.020 * Math.sin(a.time * 1.1) + 0.018 * Math.sin(a.time * 0.27);
                a.zoom = 1.026 + 0.013 * energy;
                a.cx = 0.5 + 0.07 * Math.sin(a.time * 0.75);
                a.cy = 0.5 + 0.07 * Math.sin(a.time * 0.43);
                a.warp = 0.46 + 0.24 * energy;
                return a;
            },
            pixel_eqs: function (a) {
                var fold = Math.sin(Math.abs(a.x - 0.5) * 18.0 + Math.abs(a.y - 0.5) * 15.0 - a.time * 4.0);
                a.rot = a.rot + 0.035 * fold;
                a.zoom = a.zoom + 0.028 * Math.sin(a.rad * 20.0 + a.time * 2.0);
                return a;
            },
            shapes: [
                ringShape(12, 0.10, 0.20, 1.00, 0.75),
                ringShape(16, 0.28, 0.75, 0.25, 1.00)
            ],
            waves: [],
            warp: shaderWarp(),
            comp: shaderComp()
        }
    ];

    window.BRAVIA_PRESETS.forEach(function (preset) {
        while (preset.shapes.length < 4) {
            preset.shapes.push(disabledShape());
        }
        while (preset.waves.length < 4) {
            preset.waves.push(disabledWave());
        }
    });
}());
