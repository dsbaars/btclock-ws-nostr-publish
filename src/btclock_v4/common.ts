// Shared text-mode helpers ported from main/screens/common.cpp +
// panel_texts.cpp (the *Local copies). Keeps the input contract simple:
// the caller hands us a numeric price; we round/clamp consistently with
// the C++ string-based path so the parsers match the device byte-for-byte.

// 1e8 / price, rounded half-up, clamped to [0, 4e9). Returns -1 on
// non-positive / non-finite input or out-of-range.
export function satsPerUnit(price: number): number {
    if (!(price > 0)) return -1
    const sats = 1e8 / price
    if (sats > 4e9) return -1
    return Math.round(sats)
}

// Integer part of price, rounded half-up. Returns -1 on negative /
// non-finite input or if the value exceeds the 6-digit display range.
export function priceInt(price: number): number {
    if (!Number.isFinite(price)) return -1
    if (price < 0) return -1
    if (price > 2e9) return -1
    return Math.round(price)
}

// Same as priceInt but preserves the fractional part. -1 on invalid.
export function priceDouble(price: number): number {
    if (!Number.isFinite(price)) return -1
    if (price < 0) return -1
    if (price > 2e9) return -1
    return price
}

// UTF-8 currency symbol for an ISO code, or "" if no glyph is available.
// Matches CurrencySymbolUtf8 / CurrencySymbolLocal. CAD/AUD share '$';
// CHF has no single-char glyph so we return the ISO code itself
// (renderer fits ~3 chars at the medium font size).
export function currencySymbolUtf8(ccy: string): string {
    switch (ccy) {
        case 'USD':
            return '$'
        case 'EUR':
            return '€'
        case 'GBP':
            return '£'
        case 'JPY':
            return '¥'
        case 'CAD':
            return '$'
        case 'AUD':
            return '$'
        case 'CHF':
            return 'CHF'
        default:
            return ''
    }
}

// Single-char slot for a digit; empty string for ' ' padding. Mirrors
// CharSlot in panel_texts.cpp so blank cells visually equal across the
// ASCII-only and multi-byte paths.
export function charSlot(c: string): string {
    return c === ' ' ? '' : c
}
