#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const EEL_PATH = path.join(ROOT, "app/src/main/assets/visualizer/avs-eel.js");
const NEON_PATH = path.join(ROOT, "app/src/main/assets/visualizer/avs-presets/neon-coaster.js");

function loadVisualizerContext() {
    const context = { console, Math };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(EEL_PATH, "utf8"), context, { filename: EEL_PATH });
    vm.runInContext(fs.readFileSync(NEON_PATH, "utf8"), context, { filename: NEON_PATH });
    return context;
}

function fail(message) {
    throw new Error(message);
}

function assertEqual(actual, expected, label) {
    if (actual !== expected) {
        fail(`${label}: expected ${expected}, got ${actual}`);
    }
}

function assertAlmost(actual, expected, label, tolerance = 0.000001) {
    if (Math.abs(actual - expected) > tolerance) {
        fail(`${label}: expected ${expected}, got ${actual}`);
    }
}

function assertFinite(value, label) {
    if (!Number.isFinite(value)) {
        fail(`${label}: expected finite value, got ${value}`);
    }
}

function makeHost() {
    const waveformSamples = new Float32Array(1024);
    const spectrumSamples = new Float32Array(128);
    for (let index = 0; index < waveformSamples.length; index++) {
        waveformSamples[index] = Math.sin(index / 19) * 0.2;
    }
    for (let index = 0; index < spectrumSamples.length; index++) {
        spectrumSamples[index] = index / spectrumSamples.length;
    }
    return {
        waveformSamples,
        spectrumSamples,
        rms: 0.18,
        visualTimeSeconds: 12.5,
        getosc(position) {
            const samplePosition = position - Math.floor(position);
            const sampleIndex = Math.max(
                    0,
                    Math.min(waveformSamples.length - 1, Math.round(samplePosition * (waveformSamples.length - 1))));
            return waveformSamples[sampleIndex] || 0;
        },
        getspec(position, band) {
            return 0.25 + position + band;
        }
    };
}

function testScalarRuntime(avsEel) {
    const runtime = avsEel.compile([
        "x=1+2*3;",
        "y=(1+2)*3;",
        "z=-x+y;",
        "a=sin(pi/2);",
        "b=cos(0);",
        "c=acos(1);",
        "d=atan2(1,0);",
        "e=sqrt(9);",
        "f=sqr(4);",
        "g=abs(-5);",
        "h=min(5,3,4);",
        "j=max(5,3,4);",
        "k=sign(-2);",
        "l=above(3,2);",
        "m=below(1,2);",
        "n=band(1,0);",
        "o=bor(0,2);",
        "p=equal(1,1.000001);",
        "q=if(0,2,3);",
        "r=10%3;",
        "s=getosc(.25,0,0);",
        "sa=getspec(.25,.1,0);",
        "t=tan(.5);",
        "u=asin(.5);",
        "v=atan(1);",
        "aa=pow(2,3);",
        "ab=exp(1);",
        "ac=log(exp(1));",
        "ad=log10(100);",
        "ae=floor(1.8);",
        "af=ceil(1.2);",
        "ag=int(-1.8);",
        "ah=bnot(0);",
        "ai=sigmoid(2,.5);",
        "aj=bitor(2,4);",
        "ak=bitand(7,3);",
        "al=invsqrt(4);",
        "am=rand(4);",
        "/* block comments should be ignored */",
        "an=0x10;",
        "an+=5;",
        "ao=an>=21;",
        "ap=an<=21;",
        "aq=an!=20;",
        "ar=!0;",
        "as=(3>2)&&(1<2);",
        "at=(0||5);",
        "au=7&3;",
        "av=2|4;",
        "aw=10;aw-=3;",
        "ax=2;ax*=4;",
        "ay=9;ay/=3;",
        "az=10;az%=4;"
    ].join("\n"));

    const scope = {};
    const host = { getosc: () => 0.42, getspec: (position, band) => 0.25 + position + band };
    runtime.run(scope, host);

    assertEqual(scope.x, 7, "scalar precedence");
    assertEqual(scope.y, 9, "scalar parentheses");
    assertEqual(scope.z, 2, "scalar unary");
    assertAlmost(scope.a, 1, "scalar sin");
    assertAlmost(scope.b, 1, "scalar cos");
    assertAlmost(scope.c, 0, "scalar acos");
    assertAlmost(scope.d, Math.PI / 2, "scalar atan2");
    assertEqual(scope.e, 3, "scalar sqrt");
    assertEqual(scope.f, 16, "scalar sqr");
    assertEqual(scope.g, 5, "scalar abs");
    assertEqual(scope.h, 3, "scalar min");
    assertEqual(scope.j, 5, "scalar max");
    assertEqual(scope.k, -1, "scalar sign");
    assertEqual(scope.l, 1, "scalar above");
    assertEqual(scope.m, 1, "scalar below");
    assertEqual(scope.n, 0, "scalar band");
    assertEqual(scope.o, 1, "scalar bor");
    assertEqual(scope.p, 1, "scalar equal");
    assertEqual(scope.q, 3, "scalar if");
    assertEqual(scope.r, 1, "scalar modulo");
    assertEqual(scope.s, 0.42, "scalar getosc");
    assertAlmost(scope.sa, 0.60, "scalar getspec");
    assertAlmost(scope.t, Math.tan(0.5), "scalar tan");
    assertAlmost(scope.u, Math.asin(0.5), "scalar asin");
    assertAlmost(scope.v, Math.atan(1), "scalar atan");
    assertEqual(scope.aa, 8, "scalar pow");
    assertAlmost(scope.ab, Math.E, "scalar exp");
    assertAlmost(scope.ac, 1, "scalar log");
    assertAlmost(scope.ad, 2, "scalar log10");
    assertEqual(scope.ae, 1, "scalar floor");
    assertEqual(scope.af, 2, "scalar ceil");
    assertEqual(scope.ag, -1, "scalar int");
    assertEqual(scope.ah, 1, "scalar bnot");
    assertAlmost(scope.ai, 1 / (1 + Math.exp(-1)), "scalar sigmoid");
    assertEqual(scope.aj, 6, "scalar bitor");
    assertEqual(scope.ak, 3, "scalar bitand");
    assertEqual(scope.al, 0.5, "scalar invsqrt");
    if (scope.am < 0 || scope.am >= 4) {
        fail(`scalar rand: expected value in [0, 4), got ${scope.am}`);
    }
    assertEqual(scope.an, 21, "scalar hex and add-assign");
    assertEqual(scope.ao, 1, "scalar greater-equal");
    assertEqual(scope.ap, 1, "scalar less-equal");
    assertEqual(scope.aq, 1, "scalar not-equal");
    assertEqual(scope.ar, 1, "scalar unary not");
    assertEqual(scope.as, 1, "scalar logical and");
    assertEqual(scope.at, 1, "scalar logical or");
    assertEqual(scope.au, 3, "scalar bitwise and");
    assertEqual(scope.av, 6, "scalar bitwise or");
    assertEqual(scope.aw, 7, "scalar subtract-assign");
    assertEqual(scope.ax, 8, "scalar multiply-assign");
    assertEqual(scope.ay, 3, "scalar divide-assign");
    assertEqual(scope.az, 2, "scalar modulo-assign");
}

function testSlotRuntime(avsEel) {
    const runtime = avsEel.compileSuite({
        init: "n=4;t=0;",
        frame: "t+=1;w=w/h;",
        beat: "t+=10;",
        point: "i=i*2;x=sin(i)+pow(2,3)+(0x4&7)+getspec(.2,.1,0);y=cos(i)+floor(1.8)+(2|4)+getspec(.2);red=i<1;green=(i>.5)&&!0;blue=if(red,.25,.75)+bitand(7,3)+(i>=.5);"
    });
    const scope = runtime.createScope({ w: 1920, h: 1080 });
    const host = makeHost();
    runtime.init.run(scope, host);
    runtime.frame.run(scope, host);
    runtime.beat.run(scope, host);

    const slots = runtime.slots(["n", "t", "w", "i", "x", "y", "red", "green", "blue"]);
    assertEqual(runtime.getSlot(scope, slots.n), 4, "slot init n");
    assertEqual(runtime.getSlot(scope, slots.t), 11, "slot frame and beat");
    assertAlmost(runtime.getSlot(scope, slots.w), 1920 / 1080, "slot frame aspect");

    runtime.setSlot(scope, slots.i, 0.25);
    runtime.point.run(scope, host);
    assertAlmost(runtime.getSlot(scope, slots.x), Math.sin(0.5) + 12.55, "slot point x");
    assertAlmost(runtime.getSlot(scope, slots.y), Math.cos(0.5) + 7.45, "slot point y");
    assertEqual(runtime.getSlot(scope, slots.red), 1, "slot point red");
    assertEqual(runtime.getSlot(scope, slots.green), 0, "slot point green");
    assertEqual(runtime.getSlot(scope, slots.blue), 4.25, "slot point blue");
}

function testNeonCoaster(context) {
    const preset = context.window.braviaAvsPresetDefinitions.neonCoaster;
    const runtime = context.window.braviaAvsEel.compileSuite(preset.superScope.eel);
    const scope = runtime.createScope({
        n: preset.superScope.sampleCount,
        tpi: Math.acos(-1),
        w: 1920,
        h: 1080
    });
    const host = makeHost();

    runtime.init.run(scope, host);
    runtime.set(scope, "w", 1920);
    runtime.set(scope, "h", 1080);
    runtime.frame.run(scope, host);

    const slots = runtime.slots(["n", "i", "x", "y", "red", "green", "blue", "t", "u", "mf"]);
    const snapshots = new Map([
        [0, { x: 0, y: 0, red: 0, green: 0, blue: 0 }],
        [2, {
            x: 0.3251094079158068,
            y: 1.0183462013379854,
            red: 0.7315681744291086,
            green: 1.2746791513169184,
            blue: 0.19259688422779808
        }],
        [240, {
            x: -1.2100000000000002,
            y: 1.2849017642974827,
            red: 0.34318208930897154,
            green: 0.6411377840243553,
            blue: 0.04749746491819793
        }],
        [479, {
            x: 0.09953146554233418,
            y: 1.5684414359533032,
            red: 0.8188183010833772,
            green: 1.17543233811009,
            blue: 0.4649224385074142
        }]
    ]);

    let drawn = 0;
    const start = process.hrtime.bigint();
    for (let point = 0; point < preset.superScope.sampleCount; point++) {
        runtime.setSlot(scope, slots.i, point / (preset.superScope.sampleCount - 1));
        runtime.point.run(scope, host);
        const current = {
            x: runtime.getSlot(scope, slots.x),
            y: runtime.getSlot(scope, slots.y),
            red: runtime.getSlot(scope, slots.red),
            green: runtime.getSlot(scope, slots.green),
            blue: runtime.getSlot(scope, slots.blue)
        };
        Object.entries(current).forEach(([name, value]) => assertFinite(value, `neon ${point} ${name}`));
        if (Math.max(current.red, current.green, current.blue) > 0) {
            drawn++;
        }
        const expected = snapshots.get(point);
        if (expected) {
            Object.entries(expected).forEach(([name, value]) => {
                assertAlmost(current[name], value, `neon snapshot ${point} ${name}`);
            });
        }
    }
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1000000;

    assertEqual(runtime.getSlot(scope, slots.n), 480, "neon n");
    assertAlmost(runtime.getSlot(scope, slots.t), 0.9979166666666667, "neon frame t");
    assertAlmost(runtime.getSlot(scope, slots.u), 31.753708333333332, "neon frame u");
    assertAlmost(runtime.getSlot(scope, slots.mf), 3.403969384729862, "neon init mf");
    assertEqual(drawn, 145, "neon drawn point count");
    return { elapsedMs };
}

function main() {
    const context = loadVisualizerContext();
    const avsEel = context.window.braviaAvsEel;
    if (!avsEel || typeof avsEel.compile !== "function" || typeof avsEel.compileSuite !== "function") {
        fail("AVS EEL runtime did not load");
    }

    testScalarRuntime(avsEel);
    testSlotRuntime(avsEel);
    const neon = testNeonCoaster(context);

    console.log(`AVS EEL tests passed. Neon 480-point frame interpreted in ${neon.elapsedMs.toFixed(2)} ms on Node.`);
}

main();
