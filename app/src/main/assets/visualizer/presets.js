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

    function tunnelPreset(options) {
        var red = options.red;
        var green = options.green;
        var blue = options.blue;
        return {
            name: options.name,
            author: "BRAVIA Launcher",
            baseVals: {
                decay: options.decay || 0.955,
                gammaadj: options.gamma || 1.75,
                wrap: 1,
                brighten: 1,
                darken: 0,
                darken_center: options.darkenCenter || 0,
                wave_mode: options.waveMode || 2,
                wave_r: red,
                wave_g: green,
                wave_b: blue,
                wave_a: options.waveAlpha || 0.58,
                wave_x: 0.5,
                wave_y: 0.5,
                wave_scale: options.waveScale || 0.85,
                wave_smoothing: 0.78,
                modwavealphabyvolume: 1,
                modwavealphastart: 0.15,
                modwavealphaend: 1.10,
                bmotionvectorson: 1,
                mv_x: options.motionX || 18,
                mv_y: options.motionY || 14,
                mv_l: options.motionLength || 0.50,
                mv_r: red,
                mv_g: green,
                mv_b: blue,
                mv_a: options.motionAlpha || 0.34,
                warp: options.warp || 0.62,
                warpscale: options.warpScale || 1.10,
                warpanimspeed: options.warpSpeed || 1.35,
                zoom: options.zoom || 1.040,
                zoomexp: options.zoomExp || 1.16,
                rot: 0.0,
                cx: 0.5,
                cy: 0.5,
                dx: 0.0,
                dy: 0.0,
                sx: 1.0,
                sy: 1.0,
                ob_size: options.borderSize || 0.010,
                ob_r: red,
                ob_g: green,
                ob_b: blue,
                ob_a: options.borderAlpha || 0.18,
                ib_size: 0.006,
                ib_r: red * 0.35,
                ib_g: green * 0.35,
                ib_b: blue * 0.35,
                ib_a: 0.12
            },
            init_eqs: identity,
            frame_eqs: function (a) {
                var bass = clamp(a.bass_att, 0.65, 2.5);
                var mid = clamp(a.mid_att, 0.65, 2.2);
                var treb = clamp(a.treb_att, 0.65, 2.1);
                var seed = options.seed || 0;
                var snap = options.snap
                    ? (Math.floor(a.time * (options.snapRate || 0.72) + seed) % 2 === 0 ? 1 : -1)
                    : Math.sin(a.time * (options.turnRate || 0.66) + seed);

                a.cx = 0.5
                    + Math.sin(a.time * (options.centerSpeedX || 0.34) + seed) * (options.centerX || 0.12)
                    + snap * (options.snapX || 0.018) * Math.sin(a.time * (options.snapOsc || 3.1));
                a.cy = 0.5
                    + Math.cos(a.time * (options.centerSpeedY || 0.29) + seed * 1.7) * (options.centerY || 0.10)
                    + snap * (options.snapY || 0.012) * Math.cos(a.time * (options.snapOscY || 2.4));
                a.dx = (options.driftX || 0.012) * Math.sin(a.time * (options.driftSpeedX || 1.25) + seed);
                a.dy = (options.driftY || 0.010) * Math.cos(a.time * (options.driftSpeedY || 1.05) + seed);
                a.zoom = (options.zoom || 1.040) + (options.beatZoom || 0.014) * bass;
                a.rot = (options.baseRot || 0.0)
                    + Math.sin(a.time * (options.rotSpeed || 0.78) + seed) * (options.rotSwing || 0.026)
                    + snap * (options.snapRot || 0.012) * mid;
                a.warp = (options.warp || 0.62) + (options.beatWarp || 0.12) * treb;
                a.warpanimspeed = (options.warpSpeed || 1.35) + 0.10 * mid;
                a.mv_a = (options.motionAlpha || 0.34) + (options.motionBeat || 0.08) * bass;
                a.wave_a = (options.waveAlpha || 0.58) + 0.08 * mid;
                return a;
            },
            pixel_eqs: function (a) {
                var seed = options.seed || 0;
                var spoke = Math.sin(a.ang * (options.spokes || 7.0) + a.time * (options.spokeSpeed || 1.4) + seed);
                var rib = Math.sin(a.rad * (options.ribs || 26.0) - a.time * (options.ribSpeed || 5.2) + spoke * (options.spokeBend || 1.5));
                var pinch = Math.sin((a.x - a.y) * (options.diagonal || 9.0) + a.time * (options.diagonalSpeed || 1.1));

                a.rot = a.rot
                    + rib * (options.rotAmp || 0.055) * (1.08 - clamp(a.rad, 0.0, 1.08))
                    + spoke * (options.spokeRot || 0.018);
                a.zoom = a.zoom
                    + rib * (options.zoomAmp || 0.026)
                    + pinch * (options.pinchZoom || 0.010);
                return a;
            },
            shapes: [
                ringShape(options.seed + 2, options.ringOne || 0.12, red, green, blue),
                ringShape(options.seed + 7, options.ringTwo || 0.24, blue, red * 0.7, green)
            ],
            waves: [],
            warp: shaderWarp(),
            comp: shaderComp()
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
        tunnelPreset({
            name: "BRAVIA Hyperspace Bore",
            seed: 3,
            red: 0.15,
            green: 0.78,
            blue: 1.00,
            zoom: 1.058,
            beatZoom: 0.018,
            warp: 0.74,
            ribs: 34.0,
            ribSpeed: 7.6,
            rotAmp: 0.070,
            centerX: 0.17,
            centerY: 0.12,
            snap: true,
            snapRot: 0.018,
            motionX: 28,
            motionY: 18,
            motionAlpha: 0.42
        }),
        tunnelPreset({
            name: "BRAVIA Ice Shaft",
            seed: 8,
            red: 0.78,
            green: 0.94,
            blue: 1.00,
            gamma: 1.95,
            decay: 0.970,
            zoom: 1.038,
            warp: 0.52,
            warpScale: 0.82,
            ribs: 42.0,
            ribSpeed: 4.2,
            spokeSpeed: 0.85,
            rotSwing: 0.014,
            centerX: 0.08,
            centerY: 0.07,
            motionLength: 0.34,
            borderAlpha: 0.26
        }),
        tunnelPreset({
            name: "BRAVIA Magenta Wormhole",
            seed: 12,
            red: 0.95,
            green: 0.05,
            blue: 0.82,
            waveMode: 5,
            zoom: 1.050,
            warp: 0.82,
            warpSpeed: 1.90,
            spokes: 5.0,
            spokeBend: 2.4,
            ribs: 22.0,
            ribSpeed: 6.5,
            zoomAmp: 0.036,
            snap: true,
            snapRate: 0.95,
            snapX: 0.038,
            snapY: 0.022,
            centerX: 0.18,
            centerY: 0.13
        }),
        tunnelPreset({
            name: "BRAVIA Redline Descent",
            seed: 17,
            red: 1.00,
            green: 0.12,
            blue: 0.05,
            gamma: 1.55,
            decay: 0.948,
            zoom: 1.064,
            beatZoom: 0.021,
            warp: 0.60,
            ribs: 18.0,
            ribSpeed: 8.4,
            rotSpeed: 1.15,
            rotSwing: 0.048,
            rotAmp: 0.083,
            motionX: 32,
            motionY: 20,
            motionLength: 0.70,
            motionAlpha: 0.36
        }),
        tunnelPreset({
            name: "BRAVIA Emerald Bend",
            seed: 23,
            red: 0.05,
            green: 1.00,
            blue: 0.45,
            zoom: 1.044,
            warp: 0.68,
            warpScale: 1.45,
            spokes: 9.0,
            spokeSpeed: 2.2,
            spokeRot: 0.030,
            diagonal: 14.0,
            pinchZoom: 0.018,
            snap: true,
            snapRate: 0.55,
            snapX: 0.032,
            centerX: 0.15,
            centerY: 0.15
        }),
        tunnelPreset({
            name: "BRAVIA Amber Tube",
            seed: 29,
            red: 1.00,
            green: 0.62,
            blue: 0.08,
            gamma: 1.48,
            decay: 0.960,
            waveMode: 3,
            zoom: 1.036,
            warp: 0.56,
            ribs: 30.0,
            ribSpeed: 3.8,
            rotAmp: 0.044,
            centerSpeedX: 0.18,
            centerSpeedY: 0.24,
            centerX: 0.10,
            centerY: 0.08,
            motionLength: 0.48,
            ringOne: 0.16,
            ringTwo: 0.30
        }),
        tunnelPreset({
            name: "BRAVIA Blue Corkscrew",
            seed: 34,
            red: 0.04,
            green: 0.36,
            blue: 1.00,
            zoom: 1.052,
            warp: 0.78,
            warpSpeed: 1.65,
            ribs: 28.0,
            ribSpeed: 6.8,
            spokes: 12.0,
            spokeSpeed: 2.6,
            rotSpeed: 0.98,
            rotSwing: 0.050,
            rotAmp: 0.090,
            beatWarp: 0.18,
            motionAlpha: 0.46
        }),
        tunnelPreset({
            name: "BRAVIA Violet Chicane",
            seed: 41,
            red: 0.58,
            green: 0.10,
            blue: 1.00,
            zoom: 1.046,
            warp: 0.86,
            warpScale: 1.80,
            warpSpeed: 1.20,
            ribs: 38.0,
            ribSpeed: 5.6,
            snap: true,
            snapRate: 1.25,
            snapX: 0.052,
            snapY: 0.036,
            snapRot: 0.024,
            centerX: 0.20,
            centerY: 0.15,
            diagonal: 18.0
        }),
        tunnelPreset({
            name: "BRAVIA White Warp",
            seed: 47,
            red: 0.95,
            green: 0.95,
            blue: 0.86,
            gamma: 2.05,
            decay: 0.976,
            zoom: 1.032,
            warp: 0.48,
            ribs: 46.0,
            ribSpeed: 4.9,
            zoomAmp: 0.018,
            rotAmp: 0.036,
            centerX: 0.06,
            centerY: 0.06,
            motionLength: 0.28,
            motionAlpha: 0.30,
            borderAlpha: 0.34
        }),
        tunnelPreset({
            name: "BRAVIA Acid Spiral",
            seed: 53,
            red: 0.72,
            green: 1.00,
            blue: 0.00,
            gamma: 1.65,
            zoom: 1.060,
            warp: 0.92,
            warpSpeed: 2.10,
            ribs: 24.0,
            ribSpeed: 7.2,
            spokes: 6.0,
            spokeSpeed: 3.1,
            spokeBend: 2.8,
            rotAmp: 0.080,
            zoomAmp: 0.040,
            motionX: 30,
            motionY: 24
        }),
        tunnelPreset({
            name: "BRAVIA Deep Purple Run",
            seed: 61,
            red: 0.34,
            green: 0.12,
            blue: 0.92,
            decay: 0.966,
            zoom: 1.048,
            warp: 0.70,
            warpScale: 1.05,
            ribs: 20.0,
            ribSpeed: 5.0,
            rotSwing: 0.040,
            centerSpeedX: 0.52,
            centerSpeedY: 0.36,
            centerX: 0.17,
            centerY: 0.11,
            driftX: 0.020,
            driftY: 0.018
        }),
        tunnelPreset({
            name: "BRAVIA Razor Corridor",
            seed: 71,
            red: 0.00,
            green: 0.92,
            blue: 0.92,
            gamma: 1.85,
            decay: 0.952,
            zoom: 1.056,
            warp: 0.64,
            ribs: 54.0,
            ribSpeed: 9.0,
            spokes: 14.0,
            spokeBend: 0.75,
            diagonal: 24.0,
            pinchZoom: 0.024,
            snap: true,
            snapRate: 0.78,
            snapRot: 0.030,
            motionLength: 0.64
        }),
        tunnelPreset({
            name: "BRAVIA Solar Intake",
            seed: 79,
            red: 1.00,
            green: 0.32,
            blue: 0.00,
            gamma: 1.58,
            decay: 0.944,
            zoom: 1.070,
            beatZoom: 0.026,
            warp: 0.76,
            warpSpeed: 1.75,
            ribs: 16.0,
            ribSpeed: 8.8,
            rotAmp: 0.095,
            zoomAmp: 0.048,
            motionX: 36,
            motionY: 22,
            motionAlpha: 0.50,
            ringOne: 0.20,
            ringTwo: 0.36
        }),
        tunnelPreset({
            name: "BRAVIA Glass Helix",
            seed: 89,
            red: 0.42,
            green: 0.82,
            blue: 1.00,
            gamma: 2.10,
            decay: 0.972,
            zoom: 1.040,
            warp: 0.66,
            warpScale: 0.95,
            ribs: 36.0,
            ribSpeed: 4.4,
            spokes: 11.0,
            spokeSpeed: 1.8,
            rotSpeed: 0.42,
            rotSwing: 0.060,
            centerX: 0.13,
            centerY: 0.09,
            motionAlpha: 0.28,
            borderAlpha: 0.30
        }),
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
