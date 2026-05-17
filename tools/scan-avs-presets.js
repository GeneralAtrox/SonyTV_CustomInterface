#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_PRESET_DIR = "C:\\Program Files (x86)\\Winamp\\Plugins\\AVS";
const SIGNATURE = Buffer.from("Nullsoft AVS Preset 0.2\x1a", "binary");

const SUPPORTED_EFFECT_IDS = new Set([3, 6, 15, 18, 21, 36, 37, 38, 40, 42, 43, 44]);
const EFFECT_NAMES = new Map([
    [-2, "Effect List"],
    [0, "Effect List"],
    [1, "Simple"],
    [2, "Dot Plane"],
    [3, "Oscilloscope"],
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
    [18, "Buffer Blit"],
    [19, "Movement"],
    [20, "Bump"],
    [21, "Comment"],
    [22, "Blitter Feedback"],
    [23, "Noise"],
    [24, "Color Reduction"],
    [25, "Multiplexer"],
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
    [43, "Render State"],
    [44, "Fast Brightness"],
    [45, "Trans / Movement"],
    [46, "Color Modifier"],
    [47, "Convolution Filter"]
]);

function usage() {
    console.error([
        "Usage: node tools/scan-avs-presets.js [preset-dir] [--filter text] [--limit n] [--json output.json]",
        "",
        `Default preset-dir: ${DEFAULT_PRESET_DIR}`
    ].join("\n"));
    process.exit(2);
}

function parseArgs(argv) {
    const options = {
        presetDir: DEFAULT_PRESET_DIR,
        filter: "",
        limit: 0,
        jsonPath: ""
    };
    const positional = [];
    for (let index = 2; index < argv.length; index++) {
        const arg = argv[index];
        if (arg === "--filter") {
            options.filter = argv[++index] || "";
        } else if (arg === "--limit") {
            options.limit = Number(argv[++index] || "0") || 0;
        } else if (arg === "--json") {
            options.jsonPath = argv[++index] || "";
        } else if (arg === "--help" || arg === "-h") {
            usage();
        } else {
            positional.push(arg);
        }
    }
    if (positional.length > 0) {
        options.presetDir = positional[0];
    }
    return options;
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

function walkAvsFiles(rootDir) {
    const files = [];
    const stack = [rootDir];
    while (stack.length > 0) {
        const current = stack.pop();
        let entries;
        try {
            entries = fs.readdirSync(current, { withFileTypes: true });
        } catch (error) {
            continue;
        }
        for (const entry of entries) {
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                stack.push(fullPath);
            } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".avs")) {
                files.push(fullPath);
            }
        }
    }
    files.sort((left, right) => left.localeCompare(right));
    return files;
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

    if (state.offset + 8 > config.length) {
        throw new Error("SuperScope config is too short");
    }
    const channelModeRaw = readInt32(config, state);
    const numColors = readInt32(config, state);
    for (let index = 0; index < numColors; index++) {
        readUInt32(config, state);
    }
    const drawModeRaw = state.offset + 4 <= config.length ? readInt32(config, state) : 0;
    return {
        channelModeRaw,
        drawModeRaw,
        eel: {
            init: stripRuntimeIrrelevantEel(init),
            frame: stripRuntimeIrrelevantEel(frame),
            beat: stripRuntimeIrrelevantEel(beat),
            point: stripRuntimeIrrelevantEel(point)
        }
    };
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

function summarizeCode(text) {
    return stripRuntimeIrrelevantEel(text)
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 96);
}

function decodeLineMode(config) {
    const raw = readUInt32At(config, 0);
    return {
        raw,
        blendModeId: raw & 0xff,
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

function decodeIntegerConfig(config, names) {
    const values = {};
    for (let index = 0; index < names.length; index++) {
        values[names[index]] = readInt32At(config, index * 4);
    }
    values.ints = previewInts(config);
    return values;
}

function decodeDotFountain(config) {
    const summary = {
        colorRaw: readUInt32At(config, 0),
        marker: config.length > 4 ? config[4] : 0,
        code: "",
        tailInts: []
    };
    if (summary.marker === 1) {
        const code = readSizedStringAt(config, 5);
        summary.code = summarizeCode(code.value);
        for (let offset = code.nextOffset; offset + 4 <= config.length; offset += 4) {
            summary.tailInts.push(config.readInt32LE(offset));
        }
    } else {
        summary.ints = previewInts(config);
    }
    return summary;
}

function decodeEelBlockConfig(config) {
    const summary = {
        marker: config.length > 0 ? config[0] : 0,
        code: {},
        tailInts: []
    };
    if (summary.marker === 1) {
        let offset = 1;
        const names = ["point", "frame", "beat", "init"];
        for (const name of names) {
            const block = readSizedStringAt(config, offset);
            if (block.nextOffset === offset) {
                break;
            }
            summary.code[name] = summarizeCode(block.value);
            offset = block.nextOffset;
        }
        for (; offset + 4 <= config.length; offset += 4) {
            summary.tailInts.push(config.readInt32LE(offset));
        }
    } else {
        summary.ints = previewInts(config);
    }
    return summary;
}

function decodeEffectConfig(effectId, config) {
    if (effectId === 3) {
        return decodeIntegerConfig(config, ["mode", "flags"]);
    }
    if (effectId === 6) {
        return decodeIntegerConfig(config, ["mode"]);
    }
    if (effectId === 15) {
        return decodeDotFountain(config);
    }
    if (effectId === 18) {
        return decodeIntegerConfig(config, ["sourceBuffer", "destinationBuffer", "mode"]);
    }
    if (effectId === 37 || effectId === 38) {
        return decodeIntegerConfig(config, ["resourceId"]);
    }
    if (effectId === 40) {
        return decodeLineMode(config);
    }
    if (effectId === 43) {
        return decodeEelBlockConfig(config);
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

function effectIsSupported(effect) {
    if (effect.id === -2) {
        return effect.children.length > 0 && effect.children.every(effectIsSupported);
    }
    return SUPPORTED_EFFECT_IDS.has(effect.id);
}

function flattenEffects(effects) {
    const flattened = [];
    for (const effect of effects) {
        flattened.push(effect);
        if (effect.children && effect.children.length > 0) {
            flattened.push(...flattenEffects(effect.children));
        }
    }
    return flattened;
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
                id: effectId,
                name: EFFECT_NAMES.get(effectId) || `External or Unknown ${effectId}`,
                supported: false,
                configLength: null,
                sourceOffset,
                opaque: true,
                children: [],
                superScope: null
            });
            warnings.push(`Stopped at opaque or malformed effect ${effectId} at offset ${sourceOffset}`);
            break;
        }

        const config = buffer.slice(offset, offset + configLength);
        offset += configLength;

        let children = [];
        if (effectId === -2 && depth < 8) {
            const nestedOffset = findNestedEffectOffset(config);
            if (nestedOffset >= 0) {
                const parsed = parseEffectChunks(config, nestedOffset, depth + 1);
                children = parsed.effects;
                warnings.push(...parsed.warnings.map((warning) => `nested:${warning}`));
            } else {
                warnings.push(`Could not locate nested effects in Effect List at offset ${sourceOffset}`);
            }
        }

        const effect = {
            id: effectId,
            name: EFFECT_NAMES.get(effectId) || `Unknown ${effectId}`,
            supported: false,
            configLength,
            sourceOffset,
            opaque: false,
            children,
            superScope: effectId === 36 ? decodeSuperScope(config) : null,
            configSummary: decodeEffectConfig(effectId, config)
        };
        effect.supported = effectIsSupported(effect);
        effects.push(effect);
    }
    return { effects, warnings };
}

function parsePresetFile(filePath) {
    const data = fs.readFileSync(filePath);
    if (data.length < SIGNATURE.length || !data.slice(0, SIGNATURE.length).equals(SIGNATURE)) {
        throw new Error("Unsupported AVS preset signature");
    }

    const state = { offset: SIGNATURE.length };
    let rootMode = data[state.offset++];
    if (rootMode & 0x80) {
        rootMode = (rootMode & ~0x80) | readInt32(data, state);
    }

    const parsed = parseEffectChunks(data, state.offset, 0);
    return { rootMode, effects: parsed.effects, warnings: parsed.warnings };
}

function loadEelRuntime() {
    const context = { console, Math };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(
            fs.readFileSync(path.join(ROOT, "app/src/main/assets/visualizer/avs-eel.js"), "utf8"),
            context,
            { filename: "avs-eel.js" }
    );
    return context.window.braviaAvsEel;
}

function scanEel(runtime, effects) {
    const errors = [];
    for (let index = 0; index < effects.length; index++) {
        const effect = effects[index];
        if (effect.children && effect.children.length > 0) {
            errors.push(...scanEel(runtime, effect.children));
        }
        if (!effect.superScope) {
            continue;
        }
        try {
            runtime.compileSuite(effect.superScope.eel);
        } catch (error) {
            errors.push({
                effectIndex: index,
                effectId: effect.id,
                message: error.message
            });
        }
    }
    return errors;
}

function summarizePreset(filePath, rootDir, runtime) {
    try {
        const parsed = parsePresetFile(filePath);
        const flattenedEffects = flattenEffects(parsed.effects);
        const unsupported = flattenedEffects.filter((effect) => !effect.supported);
        const eelErrors = scanEel(runtime, parsed.effects);
        const superScopeCount = flattenedEffects.filter((effect) => effect.superScope).length;
        return {
            file: path.relative(rootDir, filePath),
            path: filePath,
            okToExtractNow: unsupported.length === 0 && eelErrors.length === 0,
            superScopeRunnable: superScopeCount > 0 && eelErrors.length === 0,
            effectCount: flattenedEffects.length,
            effects: flattenedEffects.map((effect) => ({
                id: effect.id,
                name: effect.name,
                supported: effect.supported,
                opaque: Boolean(effect.opaque),
                hasSuperScopeEel: Boolean(effect.superScope),
                configSummary: effect.configSummary
            })),
            unsupportedEffects: unsupported.map((effect) => ({
                id: effect.id,
                name: effect.name
            })),
            eelErrors,
            warnings: parsed.warnings
        };
    } catch (error) {
        return {
            file: path.relative(rootDir, filePath),
            path: filePath,
            okToExtractNow: false,
            superScopeRunnable: false,
            effectCount: 0,
            effects: [],
            unsupportedEffects: [],
            eelErrors: [],
            warnings: [],
            parseError: error.message
        };
    }
}

function formatEffectList(effects) {
    return effects
            .map((effect) => `${effect.name}#${effect.id}${effect.supported ? "" : "!"}`)
            .join(" -> ");
}

function formatSummary(summary) {
    if (!summary) {
        return "";
    }
    const parts = [];
    for (const [key, value] of Object.entries(summary)) {
        if (key === "code") {
            if (typeof value === "string") {
                if (value) {
                    parts.push(`${key}="${value}"`);
                }
            } else {
                const codeParts = Object.entries(value)
                        .filter((entry) => entry[1])
                        .map((entry) => `${entry[0]}="${entry[1]}"`);
                if (codeParts.length > 0) {
                    parts.push(`code:{${codeParts.join("; ")}}`);
                }
            }
        } else if (Array.isArray(value)) {
            if (value.length > 0) {
                parts.push(`${key}=[${value.slice(0, 8).join(",")}${value.length > 8 ? ",..." : ""}]`);
            }
        } else if (typeof value === "string") {
            if (value) {
                parts.push(`${key}="${value}"`);
            }
        } else {
            parts.push(`${key}=${value}`);
        }
    }
    return parts.join(", ");
}

function main() {
    const options = parseArgs(process.argv);
    if (!fs.existsSync(options.presetDir)) {
        throw new Error(`Preset directory does not exist: ${options.presetDir}`);
    }

    const runtime = loadEelRuntime();
    let files = walkAvsFiles(options.presetDir);
    if (options.filter) {
        const needle = options.filter.toLowerCase();
        files = files.filter((file) => file.toLowerCase().includes(needle));
    }
    if (options.limit > 0) {
        files = files.slice(0, options.limit);
    }

    const results = files.map((file) => summarizePreset(file, options.presetDir, runtime));
    const extractable = results.filter((result) => result.okToExtractNow);
    const runnableSuperScopes = results.filter((result) => result.superScopeRunnable);
    const parseErrors = results.filter((result) => result.parseError);
    const eelErrors = results.filter((result) => result.eelErrors.length > 0);

    console.log(`Scanned ${results.length} AVS presets in ${options.presetDir}`);
    console.log(`Full effect stack supported: ${extractable.length}`);
    console.log(`SuperScope EEL compiles: ${runnableSuperScopes.length}`);
    console.log(`Preset parse errors: ${parseErrors.length}`);
    console.log(`EEL compile errors: ${eelErrors.length}`);
    console.log("");

    const interesting = results
            .filter((result) => result.okToExtractNow || result.superScopeRunnable || result.file.toLowerCase().includes("neon")
                    || result.file.toLowerCase().includes("containment")
                    || result.file.toLowerCase().includes("speeder")
                    || result.file.toLowerCase().includes("zero-g")
                    || result.file.toLowerCase().includes("tuggummi"))
            .slice(0, 30);

    for (const result of interesting) {
        const status = result.okToExtractNow ? "OK" : (result.superScopeRunnable ? "PARTIAL" : "BLOCKED");
        console.log(`[${status}] ${result.file}`);
        if (result.parseError) {
            console.log(`  parse: ${result.parseError}`);
            continue;
        }
        console.log(`  effects: ${formatEffectList(result.effects)}`);
        if (result.unsupportedEffects.length > 0) {
            console.log(`  unsupported: ${result.unsupportedEffects.map((effect) => `${effect.name}#${effect.id}`).join(", ")}`);
        }
        const summarized = result.effects
                .filter((effect) => effect.configSummary
                        && (effect.id === 3 || effect.id === 6 || effect.id === 15 || effect.id === 18
                                || effect.id === 37 || effect.id === 38 || effect.id === 40
                                || effect.id === 43 || effect.id === 44))
                .slice(0, 10);
        for (const effect of summarized) {
            console.log(`  config ${effect.name}#${effect.id}: ${formatSummary(effect.configSummary)}`);
        }
        if (result.eelErrors.length > 0) {
            console.log(`  eel: ${result.eelErrors.map((error) => error.message).join(" | ")}`);
        }
        if (result.warnings.length > 0) {
            console.log(`  warnings: ${result.warnings.join(" | ")}`);
        }
    }

    if (options.jsonPath) {
        fs.mkdirSync(path.dirname(path.resolve(options.jsonPath)), { recursive: true });
        fs.writeFileSync(options.jsonPath, JSON.stringify({
            presetDir: options.presetDir,
            scannedAt: new Date().toISOString(),
            results
        }, null, 2));
        console.log("");
        console.log(`Wrote ${options.jsonPath}`);
    }
}

main();
