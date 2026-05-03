// Port of main/screens/fee_rate_layout.hpp::LayoutFeeRate. Returns a
// fixed-size right-justified char array (as a string[] of length 1 per
// cell, so blanks survive Array operations cleanly).
//
// Rules (kept identical to the C++):
//   - fee < 0 / NaN          → all blanks (no value yet).
//   - integer-valued (after  → render integer, no dot.
//     rounding to 2 dp)
//   - fractional             → "X.YY" (two decimals, half-away-from-zero).
//   - overflow               → drop decimals first, then truncate leading
//                              integer digits as a last resort.

export function layoutFeeRate(feeSatsVb: number, slots: number): string[] {
    const out: string[] = Array(slots).fill(' ')
    if (!(feeSatsVb >= 0)) return out

    // Round to 2 dp first so the integer-valued check below works on
    // the *displayed* rounded value (41.999999 → 42, not "41.99").
    const roundedCents = Math.round(feeSatsVb * 100)
    const rounded = roundedCents / 100
    const integerValued = roundedCents % 100 === 0

    let buf = integerValued ? String(Math.round(rounded)) : rounded.toFixed(2)

    if (buf.length > slots) {
        // Drop decimals first.
        buf = String(Math.round(rounded))
        if (buf.length > slots) {
            // Last resort: truncate from the left.
            const start = buf.length - slots
            return buf.slice(start, start + slots).split('')
        }
    }

    const pad = slots - buf.length
    for (let i = pad; i < slots; ++i) out[i] = buf[i - pad]
    return out
}
