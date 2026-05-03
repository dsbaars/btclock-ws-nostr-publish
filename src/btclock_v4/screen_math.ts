// Pure-logic helpers ported from btclock_v4 main/screens/screen_math.{hpp,cpp}.
// JS is single-precision-or-arbitrary integer; the C++ uses uint32_t/uint64_t.
// All values handled here fit comfortably in Number's safe-integer range
// (max market cap ~= 21M * 2e9 = 4.2e16 < 2^53). No bigint required.

export const HALVING_INTERVAL = 210000
export const MAX_HALVING_ERAS = 33
export const MAX_SUPPLY_BTC = 21000000

// Blocks remaining until the *next* halving. At an exact halving block
// the countdown resets to a full interval — matches old firmware.
export function halvingCountdown(height: number): number {
    const h = Math.max(0, Math.floor(height))
    return HALVING_INTERVAL - (h % HALVING_INTERVAL)
}

// Cumulative circulating supply in whole BTC at `height`.
export function supplyAtBlock(height: number): number {
    let sats = 0
    let reward = 5_000_000_000 // 50 BTC in sats
    let h = Math.max(0, Math.floor(height))
    for (let era = 0; era < MAX_HALVING_ERAS && h > 0; ++era) {
        const inEra = h >= HALVING_INTERVAL ? HALVING_INTERVAL : h
        sats += inEra * reward
        h -= inEra
        reward = Math.floor(reward / 2)
    }
    const btc = Math.floor(sats / 100_000_000)
    return Math.min(btc, MAX_SUPPLY_BTC)
}

// Market cap in integer currency units = price * supply_btc. Both inputs
// already integer-rounded upstream.
export function marketCap(priceInt: number, height: number): number {
    return Math.max(0, Math.floor(priceInt)) * supplyAtBlock(height)
}

export interface HalvingTimeBreakdown {
    years: number
    days: number
    hours: number
    minutes: number
}

export function halvingCountdownBreakdown(height: number): HalvingTimeBreakdown {
    const blocks = halvingCountdown(height)
    let minutes = blocks * 10
    const years = Math.floor(minutes / 525_600)
    minutes -= years * 525_600
    const days = Math.floor(minutes / 1440)
    minutes -= days * 1440
    const hours = Math.floor(minutes / 60)
    minutes -= hours * 60
    return { years, days, hours, minutes }
}

// Right-justify the decimal form of `v` into `slots` chars; leading
// positions get ' '. Leading digits truncated when wider than `slots`.
export function formatDigits(v: number, slots: number): string {
    const buf = String(Math.max(0, Math.floor(v)))
    if (buf.length > slots) return buf.slice(buf.length - slots)
    return ' '.repeat(slots - buf.length) + buf
}

// Three-digit-group layout shared by Market Cap (small-chars mode) and
// Bitcoin Supply (small-chars mode). Mirrors SmallCharsGroups in
// screen_math.cpp byte-for-byte.
export function smallCharsGroups(value: number, ccyCell: string, slots: number): string[] {
    const out: string[] = Array(slots).fill('')
    let s = String(Math.max(0, Math.floor(value)))
    const len = s.length
    const leading = (3 - (len % 3)) % 3
    s = ' '.repeat(leading) + s
    const groups = (len + leading) / 3
    if (groups + 1 <= slots) {
        const sep = slots - groups - 1
        out[sep] = ccyCell === '' ? ' ' : ccyCell
        for (let i = 0; i < groups; ++i) {
            out[slots - groups + i] = s.substr(i * 3, 3)
        }
    } else {
        const keep = slots
        const excess = groups - keep
        for (let i = 0; i < keep; ++i) {
            out[i] = s.substr((excess + i) * 3, 3)
        }
    }
    return out
}

// K/M/B/T/Q suffix form. Mirrors v3 utils.cpp::formatNumberWithSuffix
// and the v4 port in screen_math.cpp.
export function formatNumberWithSuffix(num: number, numCharacters = 4, mowMode = false): string {
    const Q = 1_000_000_000_000_000
    const T = 1_000_000_000_000
    const B = 1_000_000_000
    const M = 1_000_000
    const K = 1000

    if (num === 0) return mowMode ? '0M' : '0'

    let n = Math.max(0, Math.floor(num))
    let value = n
    const digits = Math.floor(Math.log10(value)) + 1
    let suffix: string

    if (n >= Q || digits > 15) {
        value = n / Q
        suffix = 'Q'
    } else if (n >= T || digits > 12) {
        value = n / T
        suffix = 'T'
    } else if (n >= B || digits > 9) {
        value = n / B
        suffix = 'B'
    } else if (n >= M || digits > 6 || (mowMode && n >= K)) {
        value = n / M
        suffix = 'M'
    } else if (!mowMode && (n >= K || digits > 3)) {
        value = n / K
        suffix = 'K'
    } else if (!mowMode) {
        return String(n)
    } else {
        value = n / M
        suffix = 'M'
    }

    // %.6f-like fixed render so the slicing below mirrors the C++ port,
    // which goes through snprintf("%.6f") rather than std::to_string(double).
    const fixed6 = value.toFixed(6)

    let result: string
    if (mowMode) {
        // MOW truncates (never rounds) to preserve at-time value.
        const dot = fixed6.indexOf('.')
        const take = dot < 0 ? fixed6.length : dot + 2
        result = fixed6.slice(0, take) + suffix
    } else {
        result = `${Math.round(value)}${suffix}`
    }

    if (result.length < numCharacters) {
        const restLen = mowMode ? numCharacters - result.length : numCharacters - result.length - 1
        if (mowMode) {
            const dot = fixed6.indexOf('.')
            const take = dot < 0 ? fixed6.length : dot + 2 + restLen
            result = fixed6.slice(0, take) + suffix
        } else {
            result = `${value.toFixed(restLen)}${suffix}`
        }
    }

    return result
}

// UTF-8-aware codepoint split (mirrors SplitUtf8Codepoints in panel_texts.cpp).
// In JS strings are UTF-16 sequences — Array.from() splits at codepoint
// boundaries, which is what we want (multi-byte glyphs land in one cell).
export function splitCodepoints(s: string): string[] {
    return Array.from(s)
}
