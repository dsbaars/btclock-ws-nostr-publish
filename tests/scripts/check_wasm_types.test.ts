import { describe, it, expect } from 'vitest'
import { checkDrift } from '../../scripts/check_wasm_types.mjs'

const CPP = `
emscripten::val parseSomethingArray(std::uint32_t price, const std::string &currencySymbol, bool useMscwTime)
{
    return emscripten::val::null();
}

emscripten::val parseNoArgsArray()
{
    return emscripten::val::null();
}

emscripten::val arrayToStringArray(const std::array<std::string, 7> &arr)
{
    return emscripten::val::null();
}

EMSCRIPTEN_BINDINGS(my_module)
{
    emscripten::function("parseSomething", &parseSomethingArray);
    emscripten::function("parseNoArgs", &parseNoArgsArray);
    emscripten::function("arrayToStringArray", &arrayToStringArray);
}
`

const TS_OK = `
export interface BTClockModule {
    parseSomething(price: number, currencySymbol: string, useMscwTime: boolean): string[]
    parseNoArgs(): string[]
}
`

describe('checkDrift', () => {
    it('passes when C++ and TS align', () => {
        const r = checkDrift({ cppSource: CPP, tsSource: TS_OK })
        expect(r.errors).toEqual([])
        expect(r.checkedCount).toBe(2)
    })

    it('silently skips helpers whose C++ params use unmappable types', () => {
        // arrayToStringArray is bound but not in BTClockModule — it's a helper.
        const r = checkDrift({ cppSource: CPP, tsSource: TS_OK })
        expect(r.errors.find((e) => e.includes('arrayToStringArray'))).toBeUndefined()
    })

    it('parses params with & attached to the name (no space)', () => {
        // Regression: firmware uses `const std::string &currencySymbol` style.
        const r = checkDrift({ cppSource: CPP, tsSource: TS_OK })
        expect(r.errors).toEqual([])
    })

    it('flags a C++ binding missing from BTClockModule', () => {
        const ts = `interface BTClockModule { parseNoArgs(): string[] }`
        const r = checkDrift({ cppSource: CPP, tsSource: ts })
        expect(r.errors).toContain('C++ binding "parseSomething" is missing from BTClockModule')
    })

    it('flags an arity mismatch', () => {
        const ts = `
interface BTClockModule {
    parseSomething(price: number, currencySymbol: string): string[]
    parseNoArgs(): string[]
}
`
        const r = checkDrift({ cppSource: CPP, tsSource: ts })
        expect(r.errors.some((e) => e.includes('arity mismatch'))).toBe(true)
    })

    it('flags a param type mismatch', () => {
        const ts = `
interface BTClockModule {
    parseSomething(price: number, currencySymbol: string, useMscwTime: string): string[]
    parseNoArgs(): string[]
}
`
        const r = checkDrift({ cppSource: CPP, tsSource: ts })
        expect(r.errors.some((e) => e.includes('param 3'))).toBe(true)
    })

    it('flags a stale TS method with no matching C++ binding', () => {
        const ts = `
interface BTClockModule {
    parseSomething(price: number, currencySymbol: string, useMscwTime: boolean): string[]
    parseNoArgs(): string[]
    parseGhost(x: number): string[]
}
`
        const r = checkDrift({ cppSource: CPP, tsSource: ts })
        expect(r.errors).toContain('BTClockModule method "parseGhost" has no matching C++ binding')
    })

    it('returns a diagnostic when no EMSCRIPTEN_BINDINGS block is present', () => {
        const r = checkDrift({ cppSource: '// no bindings', tsSource: TS_OK })
        expect(r.errors[0]).toMatch(/EMSCRIPTEN_BINDINGS/)
    })

    it('returns a diagnostic when BTClockModule interface is absent', () => {
        const r = checkDrift({ cppSource: CPP, tsSource: '// no interface' })
        expect(r.errors[0]).toMatch(/BTClockModule/)
    })
})
