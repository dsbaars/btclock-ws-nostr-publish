// Port of main/screens/btc_price_suffix_layout.hpp::LayoutBtcPriceSuffixStrings.
// Returns the per-cell strings AND the label decision (label path vs.
// overflow path with glyph in cells[0]).

import { formatNumberWithSuffix } from './screen_math'

export interface SuffixLayout {
    cells: string[] // length === panels
    label: string // "" on the overflow path
}

export function layoutBtcPriceSuffixStrings(
    priceInt: number,
    currency: string,
    symbolUtf8: string | null,
    panels: number,
    mowMode: boolean,
    shareDot: boolean
): SuffixLayout {
    const numChars = mowMode || shareDot ? panels - 1 : panels - 2
    const numStr = formatNumberWithSuffix(priceInt, numChars, mowMode)
    const hasSymbol = !!symbolUtf8 && symbolUtf8.length > 0
    const rawCellsLen = (hasSymbol ? 1 : 0) + numStr.length
    const dotPos = shareDot ? numStr.indexOf('.') : -1
    const foldSavings = dotPos > 0 ? 1 : 0
    const cellsLen = rawCellsLen - foldSavings

    const out: string[] = Array(panels).fill('')

    if (cellsLen < panels) {
        // Label path. Panel 0 stays empty; caller paints the label.
        const label = mowMode ? 'MOW/UNITS' : `BTC/${currency}`
        const digitCells = panels - 1
        const pad = cellsLen < digitCells ? digitCells - cellsLen : 0
        let idx = 1 + pad
        if (hasSymbol) out[idx++] = symbolUtf8!
        for (let i = 0; i < numStr.length && idx < panels; ++i) {
            if (foldSavings && i + 1 === dotPos) {
                out[idx++] = numStr[i] + '.'
                ++i // skip the dot byte
            } else {
                out[idx++] = numStr[i]
            }
        }
        return { cells: out, label }
    }

    // Overflow path: priceString fills (or exceeds) all panels cells.
    let idx = 0
    if (hasSymbol && idx < panels) out[idx++] = symbolUtf8!
    for (let i = 0; i < numStr.length && idx < panels; ++i, ++idx) {
        out[idx] = numStr[i]
    }
    return { cells: out, label: '' }
}
