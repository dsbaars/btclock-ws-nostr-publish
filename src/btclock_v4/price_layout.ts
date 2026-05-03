// Port of main/screens/price_layout.hpp::LayoutBtcPriceStrings. Returns
// the per-cell strings for a non-suffix BTC price render. The currency
// glyph occupies its own cell (UTF-8 codepoint, can be multi-byte); '.'
// gets its own cell when emitted; blanks render as ''.

import { splitCodepoints } from './screen_math'

export function priceDecimalPlaces(price: number): number {
    if (!(price > 0)) return 0
    if (price >= 100000) return 0
    if (price >= 100) return 1
    if (price >= 1) return 2
    if (price >= 0.01) return 3
    return 0
}

// Internal: write the formatted string into a slot array, with optional
// glyph in the slot before the first non-blank char. Mirrors LayoutBtcPrice.
function layoutBtcPrice(
    price: number,
    useSymbol: boolean,
    slots: number
): { digits: string[]; isSym: boolean[] } {
    const digits: string[] = Array(slots).fill(' ')
    const isSym: boolean[] = Array(slots).fill(false)
    if (!(price >= 0)) return { digits, isSym }

    // V8 (8-panel → 7 digit slots) keeps the integer-only behaviour.
    // Sub-dollar precision only applies on the 7-panel boards.
    const decimals = slots >= 7 ? 0 : priceDecimalPlaces(price)
    let buf = price.toFixed(decimals)

    let emitSymbol = false
    if (useSymbol && buf.length + 1 <= slots) {
        emitSymbol = true
    } else if (buf.length <= slots) {
        emitSymbol = false
    } else {
        // Too wide with chosen decimals — try integer-only.
        buf = price.toFixed(0)
        if (useSymbol && buf.length + 1 <= slots) {
            emitSymbol = true
        } else if (buf.length > slots) {
            // Still too wide — truncate from the left, drop glyph.
            const start = buf.length - slots
            for (let i = 0; i < slots; ++i) digits[i] = buf[start + i]
            return { digits, isSym }
        }
    }

    const contentSlots = emitSymbol ? slots - 1 : slots
    const pad = contentSlots - buf.length
    const dstBase = emitSymbol ? 1 : 0
    for (let i = 0; i < buf.length; ++i) {
        digits[dstBase + pad + i] = buf[i]
    }
    if (emitSymbol) isSym[pad] = true
    return { digits, isSym }
}

export function layoutBtcPriceStrings(
    price: number,
    symbolUtf8: string | null,
    slots: number
): string[] {
    const useSymbol = !!symbolUtf8 && symbolUtf8.length > 0
    const { digits, isSym } = layoutBtcPrice(price, useSymbol, slots)
    const out: string[] = []
    for (let i = 0; i < slots; ++i) {
        if (isSym[i]) {
            out.push(symbolUtf8!)
        } else if (digits[i] !== ' ') {
            out.push(digits[i])
        } else {
            out.push('')
        }
    }
    // Defensive — keep cells codepoint-clean (no surrogate pairs split
    // across cells) even though the inputs above are ASCII / single
    // codepoints already.
    return out.map((c) => (splitCodepoints(c).length > 1 ? c : c))
}
