#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const SIGNATURE = Buffer.from("Nullsoft AVS Preset 0.2\x1a", "binary");

const EFFECTS = {
    21: "comment",
    36: "superScope",
    40: "lineMode",
    42: "comment",
    44: "fastBrightness"
};

const LINE_BLEND_MODES = {
    0: "replace",
    1: "additive",
    2: "maximum",
    3: "average",
    4: "subtractive1",
    5: "subtractive2",
    6: "multiply",
    7: "adjustable",
    8: "xor",
    9: "minimum"
};

function usage() {
    console.error("Usage: node tools/extract-avs-preset.js <input.avs> <output.js>");
    process.exit(2);
}

function readInt32(buffer, state) {
    if (state.offset + 4 > buffer.length) {
        throw new Error("Unexpected end of AVS data");
    }
    const value = buffer.readInt32LE(state.offset);
    state.offset += 4;
    return value;
}

function readUInt32(buffer, state) {
    if (state.offset + 4 > buffer.length) {
        throw new Error("Unexpected end of AVS data");
    }
    const value = buffer.readUInt32LE(state.offset);
    state.offset += 4;
    return value >>> 0;
}

function readAvsString(buffer, state) {
    const size = readInt32(buffer, state);
    if (size <= 0 || state.offset + size > buffer.length) {
        return "";
    }
    const value = buffer.slice(state.offset, state.offset + size)
            .toString("latin1")
            .replace(/\0$/, "");
    state.offset += size;
    return value;
}

function stripRuntimeIrrelevantEel(text) {
    return text
            .replace(/\r\n/g, "\n")
            .replace(/\0/g, "")
            .replace(/[\u00a3\u00a4][^;\r\n]*(?=;|$)/g, "")
            .split("\n")
            .map((line) => {
                const trimmed = line.trim();
                if (!trimmed.startsWith("\u00a4")) {
                    return trimmed;
                }
                const statementStart = trimmed.indexOf(";");
                return statementStart >= 0 ? trimmed.slice(statementStart + 1).trim() : "";
            })
            .filter((line) => line.length > 0 && !line.startsWith("//"))
            .join("\n");
}

function colorToHex(color) {
    return "#" + (color & 0xffffff).toString(16).padStart(6, "0");
}

function decodeChannelMode(raw) {
    const channelBits = raw & 3;
    const source = (raw & 4) ? "spectrum" : "waveform";
    const channel = channelBits === 0 ? "left" : channelBits === 1 ? "right" : "center";
    return { raw, source, channel };
}

function decodeLineMode(raw) {
    const unsigned = raw >>> 0;
    const blendModeId = unsigned & 0xff;
    return {
        raw: unsigned,
        appliesToFollowingRenderers: (unsigned & 0x80000000) !== 0,
        blendModeId,
        blendMode: LINE_BLEND_MODES[blendModeId] || "unknown",
        adjustableBlend: (unsigned >>> 8) & 0xff,
        lineWidth: (unsigned >>> 16) & 0xff
    };
}

function decodeFastBrightness(config) {
    const state = { offset: 0 };
    const direction = config.length >= 4 ? readInt32(config, state) : 0;
    return {
        direction,
        operation: direction === 1 ? "halve" : "double"
    };
}

function decodeSuperScope(config) {
    const state = { offset: 0 };
    const marker = config[state.offset++];
    let point = "";
    let frame = "";
    let beat = "";
    let init = "";

    if (marker === 1) {
        point = readAvsString(config, state);
        frame = readAvsString(config, state);
        beat = readAvsString(config, state);
        init = readAvsString(config, state);
    } else {
        state.offset = 0;
        const block = config.slice(state.offset, state.offset + 1024);
        state.offset += block.length;
        point = block.slice(0, 256).toString("latin1").replace(/\0.*$/s, "");
        frame = block.slice(256, 512).toString("latin1").replace(/\0.*$/s, "");
        beat = block.slice(512, 768).toString("latin1").replace(/\0.*$/s, "");
        init = block.slice(768, 1024).toString("latin1").replace(/\0.*$/s, "");
    }

    const channelModeRaw = readInt32(config, state);
    const numColors = readInt32(config, state);
    const colors = [];
    for (let index = 0; index < numColors; index++) {
        colors.push(readUInt32(config, state));
    }
    const drawModeRaw = readInt32(config, state);
    const initCode = stripRuntimeIrrelevantEel(init);
    const sampleMatch = initCode.match(/(?:^|;)n\s*=\s*([0-9]+)/);

    return {
        channelMode: decodeChannelMode(channelModeRaw),
        drawModeRaw,
        drawMode: drawModeRaw ? "lines" : "points",
        sampleCount: sampleMatch ? Number(sampleMatch[1]) : null,
        colors: colors.map((color) => ({
            raw: color,
            hex: colorToHex(color)
        })),
        eel: {
            init: initCode,
            frame: stripRuntimeIrrelevantEel(frame),
            beat: stripRuntimeIrrelevantEel(beat),
            point: stripRuntimeIrrelevantEel(point)
        }
    };
}

function displayNameFromFile(inputPath) {
    return path.basename(inputPath, ".avs").replace(/\s+-\s+/g, " ");
}

function parsePreset(inputPath) {
    const data = fs.readFileSync(inputPath);
    if (data.length < SIGNATURE.length || !data.slice(0, SIGNATURE.length).equals(SIGNATURE)) {
        throw new Error("Unsupported AVS preset signature");
    }

    const state = { offset: SIGNATURE.length };
    let rootMode = data[state.offset++];
    if (rootMode & 0x80) {
        rootMode = (rootMode & ~0x80) | readInt32(data, state);
    }

    const effectOrder = [];
    const preset = {
        schemaVersion: 1,
        id: "neonCoaster",
        displayName: displayNameFromFile(inputPath),
        source: {
            format: "Nullsoft AVS Preset 0.2",
            fileName: path.basename(inputPath)
        },
        root: {
            mode: rootMode
        },
        effectOrder
    };

    while (state.offset < data.length) {
        const sourceOffset = state.offset;
        const effectId = readInt32(data, state);
        const configLength = readInt32(data, state);
        if (configLength < 0 || state.offset + configLength > data.length) {
            throw new Error(`Invalid config length for effect ${effectId}`);
        }
        const config = data.slice(state.offset, state.offset + configLength);
        state.offset += configLength;

        const type = EFFECTS[effectId];
        if (!type) {
            continue;
        }

        if (type === "comment") {
            continue;
        }

        effectOrder.push({ type, sourceEffectId: effectId, sourceOffset });
        if (type === "fastBrightness") {
            preset.fastBrightness = decodeFastBrightness(config);
        } else if (type === "lineMode") {
            preset.lineMode = decodeLineMode(config.readUInt32LE(0));
        } else if (type === "superScope") {
            preset.superScope = decodeSuperScope(config);
        }
    }

    if (!preset.fastBrightness || !preset.lineMode || !preset.superScope) {
        throw new Error("Preset did not contain the expected Neon Coaster runtime effects");
    }
    return preset;
}

function writePresetModule(outputPath, preset) {
    const body = JSON.stringify(preset, null, 4);
    const content = [
        "// Generated by tools/extract-avs-preset.js. Do not edit by hand.",
        "// This file contains structured AVS preset data, not executable EEL code.",
        "window.braviaAvsPresetDefinitions = window.braviaAvsPresetDefinitions || {};",
        `window.braviaAvsPresetDefinitions.${preset.id} = ${body};`,
        ""
    ].join("\n");
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, content, "utf8");
}

if (process.argv.length !== 4) {
    usage();
}

const inputPath = process.argv[2];
const outputPath = process.argv[3];
const preset = parsePreset(inputPath);
writePresetModule(outputPath, preset);
console.log(`Extracted ${preset.displayName} to ${outputPath}`);
