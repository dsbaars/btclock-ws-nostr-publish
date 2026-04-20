#!/usr/bin/env node
// Verify that the BTClockModule interface in btclock_module.ts stays in sync
// with the embind bindings in data_handler.cpp. Helper bindings (ones whose C++
// params use types we can't translate, e.g. std::array / std::vector) are
// silently skipped — they're not meant to be called from the WebUI.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const CPP_TO_TS = new Map([
    ['std::uint32_t', 'number'],
    ['uint32_t', 'number'],
    ['std::int32_t', 'number'],
    ['int32_t', 'number'],
    ['std::uint16_t', 'number'],
    ['std::int16_t', 'number'],
    ['std::uint8_t', 'number'],
    ['std::int8_t', 'number'],
    ['size_t', 'number'],
    ['float', 'number'],
    ['double', 'number'],
    ['bool', 'boolean'],
    ['std::string', 'string'],
    ['char', 'string'],
])

function mapType(raw) {
    const normalized = raw
        .replace(/\bconst\b/g, '')
        .replace(/&/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    return CPP_TO_TS.get(normalized) ?? null
}

export function checkDrift({ cppSource, tsSource }) {
    const bindBlock = cppSource.match(/EMSCRIPTEN_BINDINGS\s*\([^)]*\)\s*\{([\s\S]*?)\}/)
    if (!bindBlock) {
        return {
            errors: ['No EMSCRIPTEN_BINDINGS block found in C++ source'],
            checkedCount: 0,
        }
    }

    const bindings = [
        ...bindBlock[1].matchAll(/emscripten::function\s*\(\s*"(\w+)"\s*,\s*&(\w+)\s*\)/g),
    ].map((m) => ({ jsName: m[1], cppName: m[2] }))

    const expected = new Map()
    for (const { jsName, cppName } of bindings) {
        const sig = cppSource.match(
            new RegExp(`emscripten::val\\s+${cppName}\\s*\\(([^)]*)\\)`, 'm')
        )
        if (!sig) continue
        const raw = sig[1].trim()
        if (!raw) {
            expected.set(jsName, [])
            continue
        }
        const params = raw.split(',').map((p) => {
            const noDefault = p.split('=')[0].trim()
            // Everything up to the final identifier is the C++ type.
            const nm = noDefault.match(/^(.*?)([A-Za-z_]\w*)$/)
            if (!nm) return null
            return mapType(nm[1])
        })
        expected.set(jsName, params)
    }

    const iface = tsSource.match(/interface\s+BTClockModule\s*\{([\s\S]*?)\}/)
    if (!iface) {
        return {
            errors: ['interface BTClockModule not found in TS source'],
            checkedCount: 0,
        }
    }

    const actual = new Map()
    const memberRe = /^\s*(\w+)\s*\(([\s\S]*?)\)\s*:\s*([^\n;]+)/gm
    for (const m of iface[1].matchAll(memberRe)) {
        const name = m[1]
        const raw = m[2].trim()
        const params = raw ? raw.split(',').map((p) => p.split(':')[1]?.trim()) : []
        actual.set(name, params)
    }

    const errors = []
    let checkedCount = 0
    for (const [name, exp] of expected) {
        const act = actual.get(name)
        const hasUnmappable = exp.some((t) => t === null)
        if (!act) {
            if (!hasUnmappable) {
                errors.push(`C++ binding "${name}" is missing from BTClockModule`)
            }
            continue
        }
        if (hasUnmappable) {
            errors.push(
                `${name}: C++ signature uses types this checker can't map — update scripts/check_wasm_types.mjs`
            )
            continue
        }
        if (exp.length !== act.length) {
            errors.push(`${name}: arity mismatch (C++ ${exp.length}, TS ${act.length})`)
            continue
        }
        let ok = true
        for (let i = 0; i < exp.length; i++) {
            if (exp[i] !== act[i]) {
                errors.push(`${name} param ${i + 1}: C++ ${exp[i]} vs TS ${act[i]}`)
                ok = false
            }
        }
        if (ok) checkedCount++
    }
    for (const name of actual.keys()) {
        if (!expected.has(name)) {
            errors.push(`BTClockModule method "${name}" has no matching C++ binding`)
        }
    }

    return { errors, checkedCount }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
    const [, , cppPath, tsPath] = process.argv
    if (!cppPath || !tsPath) {
        console.error('usage: check_wasm_types.mjs <data_handler.cpp> <btclock_module.ts>')
        process.exit(2)
    }
    const result = checkDrift({
        cppSource: readFileSync(cppPath, 'utf8'),
        tsSource: readFileSync(tsPath, 'utf8'),
    })
    if (result.errors.length) {
        console.error(`embind <-> BTClockModule drift (${cppPath} vs ${tsPath}):`)
        for (const e of result.errors) console.error('  - ' + e)
        process.exit(1)
    }
    const n = result.checkedCount
    console.log(`embind <-> BTClockModule in sync (${n} function${n === 1 ? '' : 's'})`)
}
