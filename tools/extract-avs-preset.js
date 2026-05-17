#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const SIGNATURE = Buffer.from("Nullsoft AVS Preset 0.2\x1a", "binary");

const EFFECT_NAMES = new Map([
    [-2, "Effect List"],
    [0, "Effect List"],
    [1, "Simple"],
    [2, "Dot Plane"],
    [3, "Oscilloscope Star"],
    [4, "Blur"],
    [5, "Bass Spin"],
    [6, "Color Fade"],
    [7, "Color Map"],
    [8, "Brightness"],
    [9, "Interference"],
    [10, "Channel Shift"],
    [11, "Dynamic Movement"],
    [12, "Scatter"],
    [13, "Dot Grid"],
    [14, "Stack"],
    [15, "Dot Fountain"],
    [16, "Water Bump"],
    [17, "Buffer Save"],
    [18, "Buffer Save"],
    [19, "Movement"],
    [20, "Bump"],
    [21, "Comment"],
    [22, "Blitter Feedback"],
    [23, "Noise"],
    [24, "Color Reduction"],
    [25, "Clear Screen"],
    [26, "Color Clip"],
    [27, "Mirror"],
    [28, "Starfield"],
    [29, "Text"],
    [30, "Bump Mapping"],
    [31, "Mosaic"],
    [32, "Water"],
    [33, "Video Delay"],
    [34, "SuperScope II"],
    [35, "Dynamic Distance Modifier"],
    [36, "SuperScope"],
    [37, "Texer"],
    [38, "Texer II"],
    [39, "Multiplier"],
    [40, "Line Mode"],
    [41, "Picture"],
    [42, "Comment"],
    [43, "Dynamic Movement"],
    [44, "Fast Brightness"],
    [45, "Trans / Movement"],
    [46, "Color Modifier"],
    [47, "Convolution Filter"]
]);

const EFFECT_TYPES = new Map([
    [-2, "effectList"],
    [0, "effectList"],
    [1, "simple"],
    [3, "oscilloscopeStar"],
    [6, "colorFade"],
    [12, "scatter"],
    [15, "dotFountain"],
    [18, "bufferSave"],
    [20, "bump"],
    [21, "comment"],
    [25, "clearScreen"],
    [36, "superScope"],
    [33, "videoDelay"],
    [37, "texer"],
    [38, "texer2"],
    [40, "lineMode"],
    [42, "comment"],
    [43, "dynamicMovement"],
    [44, "fastBrightness"]
]);

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
    console.error("Usage: node tools/extract-avs-preset.js <input.avs> <output.js> [--id presetId]");
    process.exit(2);
}

function parseArgs(argv) {
    const positional = [];
    const options = { id: "" };
    for (let index = 2; index < argv.length; index++) {
        const arg = argv[index];
        if (arg === "--id") {
            options.id = argv[++index] || "";
        } else if (arg === "--help" || arg === "-h") {
            usage();
        } else {
            positional.push(arg);
        }
    }
    if (positional.length !== 2) {
        usage();
    }
    return {
        inputPath: positional[0],
        outputPath: positional[1],
        id: options.id
    };
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

function readInt32At(buffer, offset, fallback = 0) {
    return offset + 4 <= buffer.length ? buffer.readInt32LE(offset) : fallback;
}

function readUInt32At(buffer, offset, fallback = 0) {
    return offset + 4 <= buffer.length ? buffer.readUInt32LE(offset) >>> 0 : fallback;
}

function readSizedStringAt(buffer, offset) {
    if (offset + 4 > buffer.length) {
        return { value: "", nextOffset: offset };
    }
    const size = buffer.readInt32LE(offset);
    const start = offset + 4;
    const end = start + size;
    if (size < 0 || end > buffer.length) {
        return { value: "", nextOffset: offset };
    }
    return {
        value: buffer.slice(start, end).toString("latin1").replace(/\0$/, ""),
        nextOffset: end
    };
}

function stripRuntimeIrrelevantEel(text) {
    return text
            .replace(/\r\n/g, "\n")
            .replace(/\0/g, "")
            .replace(/[\u00a3\u00a4][^;\r\n]*(?=;|$)/g, "")
            .split("\n")
            .map((line) => {
                let trimmed = line.trim();
                trimmed = trimmed.replace(/^;+\s*/, "");
                if (!trimmed.startsWith("\u00a4")) {
                    return trimmed;
                }
                const statementStart = trimmed.indexOf(";");
                return statementStart >= 0 ? trimmed.slice(statementStart + 1).trim().replace(/^;+\s*/, "") : "";
            })
            .filter((line) => line.length > 0 && !line.startsWith("//"))
            .join("\n");
}

function colorToHex(color) {
    const red = color & 0xff;
    const green = (color >>> 8) & 0xff;
    const blue = (color >>> 16) & 0xff;
    return "#" + [red, green, blue]
            .map((component) => component.toString(16).padStart(2, "0"))
            .join("");
}

function previewText(buffer, maxLength = 80) {
    return buffer
            .toString("latin1")
            .replace(/\0/g, ".")
            .replace(/\r/g, "\\r")
            .replace(/\n/g, "\\n")
            .slice(0, maxLength);
}

function previewInts(buffer, maxCount = 8) {
    const count = Math.min(maxCount, Math.floor(buffer.length / 4));
    const values = [];
    for (let index = 0; index < count; index++) {
        values.push(buffer.readInt32LE(index * 4));
    }
    return values;
}

function decodeChannelMode(raw) {
    const channelBits = raw & 3;
    const source = (raw & 4) ? "spectrum" : "waveform";
    const channel = channelBits === 0 ? "left" : channelBits === 1 ? "right" : "center";
    return { raw, source, channel };
}

function decodeLineMode(config) {
    const raw = readUInt32At(config, 0);
    const blendModeId = raw & 0xff;
    return {
        raw,
        appliesToFollowingRenderers: (raw & 0x80000000) !== 0,
        blendModeId,
        blendMode: LINE_BLEND_MODES[blendModeId] || "unknown",
        adjustableBlend: (raw >>> 8) & 0xff,
        lineWidth: (raw >>> 16) & 0xff
    };
}

function decodeFastBrightness(config) {
    const direction = readInt32At(config, 0);
    return {
        direction,
        operation: direction === 1 ? "halve" : "double"
    };
}

function decodeEffectListMode(mode) {
    return {
        modeRaw: mode >>> 0,
        clearFrameBuffer: (mode & 1) !== 0,
        enabled: ((mode & 2) ^ 2) !== 0,
        blendInMode: (mode >>> 8) & 31,
        blendOutMode: (((mode >>> 16) & 31) ^ 1),
        extendedDataSize: (mode >>> 24) & 0xff
    };
}

function decodeEffectList(config, nestedOffset) {
    let pos = 0;
    let mode = 0;
    if (pos < config.length) {
        mode = config[pos++];
    }
    if (mode & 0x80) {
        mode = ((mode & ~0x80) | readUInt32At(config, pos)) >>> 0;
        pos += 4;
    }

    const settings = decodeEffectListMode(mode);
    settings.nestedOffset = nestedOffset;

    const extendedEnd = Math.min(config.length, settings.extendedDataSize + 5);
    if (extendedEnd > 5) {
        if (pos + 4 <= extendedEnd) {
            settings.inBlendValue = readInt32At(config, pos);
            pos += 4;
        }
        if (pos + 4 <= extendedEnd) {
            settings.outBlendValue = readInt32At(config, pos);
            pos += 4;
        }
        if (pos + 4 <= extendedEnd) {
            settings.bufferIn = readInt32At(config, pos);
            pos += 4;
        }
        if (pos + 4 <= extendedEnd) {
            settings.bufferOut = readInt32At(config, pos);
            pos += 4;
        }
        if (pos + 4 <= extendedEnd) {
            settings.inInvert = readInt32At(config, pos);
            pos += 4;
        }
        if (pos + 4 <= extendedEnd) {
            settings.outInvert = readInt32At(config, pos);
            pos += 4;
        }
        if (pos < extendedEnd - 4 && pos + 4 <= extendedEnd) {
            settings.beatRender = readInt32At(config, pos);
            pos += 4;
        }
        if (pos < extendedEnd - 4 && pos + 4 <= extendedEnd) {
            settings.beatRenderFrames = readInt32At(config, pos);
        }
    }

    return settings;
}

function decodeIntegerConfig(config, names) {
    const values = {};
    for (let index = 0; index < names.length; index++) {
        values[names[index]] = readInt32At(config, index * 4);
    }
    values.ints = previewInts(config);
    return values;
}

function decodeBufferSave(config) {
    return {
        direction: readInt32At(config, 0),
        bufferIndex: readInt32At(config, 4),
        blendMode: readInt32At(config, 8),
        adjustableBlend: config.length >= 16 ? readInt32At(config, 12) : 128,
        ints: previewInts(config)
    };
}

function decodeDotFountain(config) {
    const colorRaw = readUInt32At(config, 0);
    const settings = {
        colorRaw,
        colorHex: colorToHex(colorRaw),
        marker: config.length > 4 ? config[4] : 0
    };
    if (settings.marker === 1) {
        const code = readSizedStringAt(config, 5);
        settings.eel = {
            point: stripRuntimeIrrelevantEel(code.value)
        };
        settings.tailInts = [];
        for (let offset = code.nextOffset; offset + 4 <= config.length; offset += 4) {
            settings.tailInts.push(config.readInt32LE(offset));
        }
    } else {
        settings.ints = previewInts(config);
    }
    return settings;
}

function decodeSimple(config) {
    const effect = readInt32At(config, 0, 40);
    const configuredColorCount = config.length >= 8 ? readInt32At(config, 4) : 1;
    const colorCount = configuredColorCount > 0 && configuredColorCount <= 16 ? configuredColorCount : 0;
    const colors = [];
    for (let index = 0; index < colorCount && 8 + index * 4 + 4 <= config.length; index++) {
        const color = readUInt32At(config, 8 + index * 4);
        colors.push({ raw: color, hex: colorToHex(color) });
    }
    if (config.length === 0) {
        colors.push({ raw: 0xffffff, hex: "#ffffff" });
    }

    const renderModeId = effect & 3;
    const renderModes = ["solidAnalyzer", "lineAnalyzer", "lineScope", "solidScope"];
    const channelId = (effect >>> 2) & 3;
    const yPositionId = (effect >>> 4) & 3;
    return {
        effect,
        renderModeId,
        renderMode: renderModes[renderModeId] || "unknown",
        source: renderModeId > 1 ? "waveform" : "spectrum",
        channel: channelId === 0 ? "left" : channelId === 1 ? "right" : "center",
        yPosition: yPositionId,
        dots: (effect & (1 << 6)) !== 0,
        colorCount: colors.length,
        colors,
        ints: previewInts(config)
    };
}

function decodeOscilloscopeStar(config) {
    const effect = readInt32At(config, 0, 40);
    const configuredColorCount = config.length >= 8 ? readInt32At(config, 4) : 1;
    const colors = [];
    let colorCount = configuredColorCount;
    let offset = 8;
    if (configuredColorCount > 16) {
        colorCount = 1;
        colors.push({ raw: 0xffffff, hex: "#ffffff" });
    } else if (configuredColorCount > 0) {
        colorCount = configuredColorCount;
        for (let index = 0; index < colorCount; index++) {
            if (offset + 4 <= config.length) {
                const color = readUInt32At(config, offset);
                colors.push({ raw: color, hex: colorToHex(color) });
                offset += 4;
            } else {
                colors.push({ raw: index === 0 ? 0xffffff : 0, hex: index === 0 ? "#ffffff" : "#000000" });
            }
        }
    } else {
        colorCount = 0;
    }

    const channelId = (effect >>> 2) & 3;
    return {
        effect,
        configuredColorCount,
        colorCount,
        colors,
        channel: channelId === 0 ? "left" : channelId === 1 ? "right" : "center",
        yPosition: effect >>> 4,
        size: readInt32At(config, offset, 8),
        rotation: readInt32At(config, offset + 4, 3),
        ints: previewInts(config)
    };
}

function decodeClearScreen(config) {
    const colorRaw = readUInt32At(config, 4);
    return {
        enabled: readInt32At(config, 0, 1),
        colorRaw,
        colorHex: colorToHex(colorRaw),
        blend: readInt32At(config, 8),
        blendAverage: readInt32At(config, 12),
        onlyFirst: readInt32At(config, 16),
        ints: previewInts(config)
    };
}

function decodeScatter(config) {
    return {
        enabled: readInt32At(config, 0, 1),
        ints: previewInts(config)
    };
}

function decodeColorFade(config) {
    const faders = [
        readInt32At(config, 4, 8),
        readInt32At(config, 8, -8),
        readInt32At(config, 12, -8)
    ];
    return {
        enabled: readInt32At(config, 0, 1),
        faders,
        beatFaders: [
            readInt32At(config, 16, faders[0]),
            readInt32At(config, 20, faders[1]),
            readInt32At(config, 24, faders[2])
        ],
        ints: previewInts(config)
    };
}

function decodeEelBlockConfig(config) {
    const settings = {
        marker: config.length > 0 ? config[0] : 0,
        eel: {},
        tailInts: []
    };
    if (settings.marker === 1) {
        let offset = 1;
        const names = ["point", "frame", "beat", "init"];
        for (const name of names) {
            const block = readSizedStringAt(config, offset);
            if (block.nextOffset === offset) {
                break;
            }
            settings.eel[name] = stripRuntimeIrrelevantEel(block.value);
            offset = block.nextOffset;
        }
        for (; offset + 4 <= config.length; offset += 4) {
            settings.tailInts.push(config.readInt32LE(offset));
        }
    } else {
        settings.ints = previewInts(config);
    }
    return settings;
}

function decodeDynamicMovement(config) {
    const settings = decodeEelBlockConfig(config);
    const tail = settings.tailInts || [];
    settings.subpixel = tail.length > 0 ? tail[0] : 1;
    settings.rectCoords = tail.length > 1 ? tail[1] : 0;
    settings.xResolution = tail.length > 2 ? tail[2] : 16;
    settings.yResolution = tail.length > 3 ? tail[3] : 16;
    settings.blend = tail.length > 4 ? tail[4] : 0;
    settings.wrap = tail.length > 5 ? tail[5] : 0;
    settings.bufferNumber = tail.length > 6 ? tail[6] : 0;
    settings.noMovement = tail.length > 7 ? tail[7] : 0;
    return settings;
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
    const drawModeRaw = state.offset + 4 <= config.length ? readInt32(config, state) : 0;
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

function decodeEffectSettings(effectId, config) {
    if (effectId === 1) {
        return decodeSimple(config);
    }
    if (effectId === 3) {
        return decodeOscilloscopeStar(config);
    }
    if (effectId === 6) {
        return decodeColorFade(config);
    }
    if (effectId === 15) {
        return decodeDotFountain(config);
    }
    if (effectId === 18) {
        return decodeBufferSave(config);
    }
    if (effectId === 20) {
        return decodeIntegerConfig(config, ["enabled", "onBeat", "durationFrames", "depth", "beatDepth", "blend", "blendAverage"]);
    }
    if (effectId === 12) {
        return decodeScatter(config);
    }
    if (effectId === 25) {
        return decodeClearScreen(config);
    }
    if (effectId === 33) {
        return decodeIntegerConfig(config, ["enabled", "useBeats", "delay"]);
    }
    if (effectId === 36) {
        return decodeSuperScope(config);
    }
    if (effectId === 37 || effectId === 38) {
        return decodeIntegerConfig(config, ["resourceId"]);
    }
    if (effectId === 40) {
        return decodeLineMode(config);
    }
    if (effectId === 43) {
        return decodeDynamicMovement(config);
    }
    if (effectId === 44) {
        return decodeFastBrightness(config);
    }
    return {
        length: config.length,
        ints: previewInts(config),
        preview: previewText(config)
    };
}

function isPlausibleEffectId(effectId) {
    return effectId === -2 || (effectId >= 1 && effectId <= 60);
}

function findNestedEffectOffset(config) {
    let best = null;
    for (let offset = 0; offset + 8 <= config.length; offset++) {
        let cursor = offset;
        let count = 0;
        while (cursor + 8 <= config.length) {
            const effectId = config.readInt32LE(cursor);
            const configLength = config.readInt32LE(cursor + 4);
            if (!isPlausibleEffectId(effectId)
                    || configLength < 0
                    || cursor + 8 + configLength > config.length) {
                break;
            }
            cursor += 8 + configLength;
            count++;
        }
        if (cursor === config.length && count > 0) {
            const coverage = config.length - offset;
            if (!best || count > best.count || (count === best.count && coverage > best.coverage)) {
                best = { offset, count, coverage };
            }
        }
    }
    return best ? best.offset : -1;
}

function parseEffectChunks(buffer, startOffset, depth) {
    const effects = [];
    const warnings = [];
    let offset = startOffset;
    while (offset < buffer.length) {
        const sourceOffset = offset;
        if (offset + 8 > buffer.length) {
            warnings.push(`Stopped at truncated effect header at offset ${sourceOffset}`);
            break;
        }

        const effectId = buffer.readInt32LE(offset);
        const configLength = buffer.readInt32LE(offset + 4);
        offset += 8;
        if (configLength < 0 || offset + configLength > buffer.length) {
            effects.push({
                type: "unsupported",
                name: EFFECT_NAMES.get(effectId) || `External or Unknown ${effectId}`,
                sourceEffectId: effectId,
                sourceOffset,
                configLength: null,
                opaque: true
            });
            warnings.push(`Stopped at opaque or malformed effect ${effectId} at offset ${sourceOffset}`);
            break;
        }

        const config = buffer.slice(offset, offset + configLength);
        offset += configLength;

        const type = EFFECT_TYPES.get(effectId) || "unsupported";
        if (type === "comment") {
            continue;
        }

        const effect = {
            type,
            name: EFFECT_NAMES.get(effectId) || `Unknown ${effectId}`,
            sourceEffectId: effectId,
            sourceOffset,
            configLength,
            opaque: false
        };

        if (type === "effectList" && depth < 8) {
            const nestedOffset = findNestedEffectOffset(config);
            effect.settings = decodeEffectList(config, nestedOffset);
            if (nestedOffset >= 0) {
                const parsed = parseEffectChunks(config, nestedOffset, depth + 1);
                effect.nestedOffset = nestedOffset;
                effect.effects = parsed.effects;
                warnings.push(...parsed.warnings.map((warning) => `nested:${warning}`));
            } else {
                effect.opaque = true;
                warnings.push(`Could not locate nested effects in Effect List at offset ${sourceOffset}`);
            }
        } else {
            effect.settings = decodeEffectSettings(effectId, config);
        }

        effects.push(effect);
    }
    return { effects, warnings };
}

function flattenEffects(effects) {
    const flattened = [];
    for (const effect of effects) {
        flattened.push(effect);
        if (effect.effects && effect.effects.length > 0) {
            flattened.push(...flattenEffects(effect.effects));
        }
    }
    return flattened;
}

function idFromFile(inputPath) {
    const base = path.basename(inputPath, ".avs")
            .replace(/^[^-]+-\s*/, "")
            .replace(/[^a-zA-Z0-9]+(.)/g, (_, character) => character.toUpperCase())
            .replace(/^[^a-zA-Z_]+/, "");
    if (!base) {
        return "avsPreset";
    }
    return base[0].toLowerCase() + base.slice(1);
}

function displayNameFromFile(inputPath) {
    return path.basename(inputPath, ".avs").replace(/^([^-]+?)\s*-\s*/, "$1 ");
}

function parsePreset(inputPath, presetId) {
    const data = fs.readFileSync(inputPath);
    if (data.length < SIGNATURE.length || !data.slice(0, SIGNATURE.length).equals(SIGNATURE)) {
        throw new Error("Unsupported AVS preset signature");
    }

    const state = { offset: SIGNATURE.length };
    let rootMode = data[state.offset++];
    if (rootMode & 0x80) {
        rootMode = (rootMode & ~0x80) | readInt32(data, state);
    }

    const parsed = parseEffectChunks(data, state.offset, 0);
    const flattened = flattenEffects(parsed.effects);
    const firstFastBrightness = flattened.find((effect) => effect.type === "fastBrightness");
    const firstLineMode = flattened.find((effect) => effect.type === "lineMode");
    const firstSuperScope = flattened.find((effect) => effect.type === "superScope");

    const preset = {
        schemaVersion: 3,
        id: presetId || idFromFile(inputPath),
        displayName: displayNameFromFile(inputPath),
        source: {
            format: "Nullsoft AVS Preset 0.2",
            fileName: path.basename(inputPath)
        },
        root: decodeEffectListMode(rootMode),
        effectOrder: flattened.map((effect) => ({
            type: effect.type,
            sourceEffectId: effect.sourceEffectId,
            sourceOffset: effect.sourceOffset
        })),
        effects: parsed.effects
    };

    if (firstFastBrightness) {
        preset.fastBrightness = firstFastBrightness.settings;
    }
    if (firstLineMode) {
        preset.lineMode = firstLineMode.settings;
    }
    if (firstSuperScope) {
        preset.superScope = firstSuperScope.settings;
    }
    if (parsed.warnings.length > 0) {
        preset.extractionWarnings = parsed.warnings;
    }

    return preset;
}

function writePresetModule(outputPath, preset) {
    const body = JSON.stringify(preset, null, 4);
    const content = [
        "// Generated by tools/extract-avs-preset.js. Do not edit by hand.",
        "// This file contains structured AVS preset data, not executable EEL code.",
        "window.braviaAvsPresetDefinitions = window.braviaAvsPresetDefinitions || {};",
        `window.braviaAvsPresetDefinitions[${JSON.stringify(preset.id)}] = ${body};`,
        ""
    ].join("\n");
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, content, "utf8");
}

const options = parseArgs(process.argv);
const preset = parsePreset(options.inputPath, options.id);
writePresetModule(options.outputPath, preset);
console.log(`Extracted ${preset.displayName} to ${options.outputPath}`);
