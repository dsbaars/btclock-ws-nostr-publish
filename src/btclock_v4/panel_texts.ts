// High-level data handlers that mirror main/screens/panel_texts.cpp's
// Build* functions byte-for-byte. Each returns the per-panel cell array
// the WebUI's BTClockV4 component renders verbatim — same shape the
// device's /api/status mirror exposes, so the preview here matches what
// the EPD will actually paint when the same data lands on the board.
//
// Cell encoding (matches v4 panel_texts):
//   ""           → blank cell
//   contains "/" → split-text label  (e.g. "BLOCK/HEIGHT", "sat/vB",
//                  "5/YRS")
//   "STS"        → sats glyph marker (rendered with Satoshi Symbol font)
//   "X."         → digit cell with shared trailing dot (suffix share_dot)
//   single char  → digit cell ("0".."9", "$", "€", "%", "K", "M", …)
//   3+ chars     → medium-text cell ("CHF", "021", " 24", …)

import {
    formatDigits,
    formatNumberWithSuffix,
    halvingCountdown,
    halvingCountdownBreakdown,
    marketCap,
    smallCharsGroups,
    splitCodepoints,
    supplyAtBlock,
} from './screen_math'
import { charSlot, currencySymbolUtf8, priceInt, satsPerUnit } from './common'
import { layoutBtcPriceStrings } from './price_layout'
import { layoutBtcPriceSuffixStrings } from './btc_price_suffix_layout'
import { layoutFeeRate } from './fee_rate_layout'

export type Cells = string[]

// Block height (BuildBlockHeight). Drops the label when the height
// needs every panel.
export function parseBlockHeight(height: number, panels = 7): Cells {
    const h = Math.max(0, Math.floor(height))
    const buf = String(h)
    if (buf.length >= panels) {
        // Overflow: one digit per slot, truncate leading digits if wider.
        const start = buf.length > panels ? buf.length - panels : 0
        const out: string[] = []
        for (let i = 0; i < panels; ++i) out.push(buf[start + i])
        return out
    }
    const out: string[] = ['BLOCK/HEIGHT']
    const digitSlots = panels - 1
    const digits = formatDigits(h, digitSlots)
    for (let i = 0; i < digitSlots; ++i) out.push(charSlot(digits[i]))
    return out
}

// Bitcoin supply. `bigChars` packs the magnitude into the inner panels
// with a K/M/B/T suffix; `showPercent` renders "NN.NN%" digit-per-cell;
// default is the small-chars three-digit-group layout.
export function parseBitcoinSupply(
    height: number,
    opts: { bigChars?: boolean; showPercent?: boolean } = {},
    panels = 7
): Cells {
    const supply = supplyAtBlock(height)
    if (opts.showPercent) {
        const out: string[] = ['BTC/SUPPLY']
        const frac = Math.round((supply / 20999999.9769) * 10000) / 100
        let s = `${frac.toFixed(2)}%`
        if (s.length < panels) s = ' '.repeat(panels - s.length) + s
        for (let i = 1; i < panels; ++i) out.push(charSlot(s[i]))
        if (out.length > 0) out[out.length - 1] = '%'
        return out
    }
    if (opts.bigChars) {
        const s = formatNumberWithSuffix(supply, panels - 1)
        return emitBigCharsFrame('BTC/SUPPLY', s, panels)
    }
    return emitSmallCharsGroups('BTC/SUPPLY', supply, '', panels)
}

// Market cap. `bigChars` paints the "<sym><N.NN>T" big-chars suffix form;
// `shareDot` folds "X." into one cell; default is the small-chars
// three-digit-group layout with " <CCY> " separator.
export function parseMarketCap(
    height: number,
    price: number,
    currency: string,
    opts: { bigChars?: boolean; shareDot?: boolean } = {},
    panels = 7
): Cells {
    const pi = priceInt(price)
    const cap = pi < 0 ? 0 : marketCap(pi, height)
    if (opts.bigChars) {
        const sym = currencySymbolUtf8(currency)
        const glyph = sym !== '' ? sym : currency
        const budget = panels - (opts.shareDot ? 1 : 2)
        const s = glyph + formatNumberWithSuffix(cap, budget)
        if (!opts.shareDot) {
            return emitBigCharsFrame(`${currency}/MCAP`, s, panels)
        }
        // Fold "." into preceding cell, then right-align tail.
        let cells = splitCodepoints(s)
        const dotPos = cells.indexOf('.')
        if (dotPos > 0) {
            cells[dotPos - 1] = cells[dotPos - 1] + '.'
            cells.splice(dotPos, 1)
        }
        const out: string[] = [`${currency}/MCAP`]
        if (panels <= 1) return out
        const tailSlots = panels - 1
        if (cells.length < tailSlots) {
            cells = Array(tailSlots - cells.length)
                .fill(' ')
                .concat(cells)
        } else if (cells.length > tailSlots) {
            cells = cells.slice(cells.length - tailSlots)
        }
        for (const c of cells) out.push(c === ' ' ? '' : c)
        return out
    }
    // Small-chars: " <CCY> " separator + three-digit groups.
    const sym = currencySymbolUtf8(currency)
    const glyph = sym !== '' ? sym : currency
    const ccyCell = ` ${glyph} `
    return emitSmallCharsGroups(`${currency}/MCAP`, cap, ccyCell, panels)
}

// BTC price. Default: integer / sub-dollar-decimal layout. `suffix`
// (and `mowMode` / `shareDot`) switch to the suffix-suffix MOW path
// — same firmware fall-through that v3 parsePriceData implemented.
export function parseBtcPrice(
    price: number,
    currency: string,
    opts: { suffix?: boolean; mowMode?: boolean; shareDot?: boolean } = {},
    panels = 7
): Cells {
    const sym = currencySymbolUtf8(currency)
    const pi = priceInt(price)
    const integerOverflow = pi >= 0 && String(pi).length >= panels
    const goSuffix = (opts.suffix || integerOverflow) && pi >= 0

    if (goSuffix) {
        const { cells, label } = layoutBtcPriceSuffixStrings(
            pi,
            currency,
            sym,
            panels,
            !!opts.mowMode,
            !!opts.shareDot
        )
        if (label === '') return cells
        // Label path: panel 0 = label, then digits.
        const out: string[] = [label]
        for (let i = 1; i < panels; ++i) out.push(cells[i] ?? '')
        return out
    }

    // Plain integer / sub-dollar-decimal path. 7 panels → 6 digit slots.
    const out: string[] = [`BTC/${currency}`]
    const slots = panels - 1
    const cells = layoutBtcPriceStrings(price, sym, slots)
    for (const c of cells) out.push(c)
    return out
}

// Sats per unit currency (Moscow Time). Label flips to "MSCW/TIME" when
// USD + sats in the classic 0..100k window; otherwise "SATS/<CCY>".
// `useSatsSymbol` decides whether the marker cell carries "STS".
export function parseSatsPerCurrency(
    price: number,
    currency: string,
    opts: { useSatsSymbol?: boolean; useMscwTime?: boolean } = {},
    panels = 7
): Cells {
    const sats = satsPerUnit(price)
    const moscow =
        opts.useMscwTime !== false && currency === 'USD' && sats > 0 && sats < 100000
    const out: string[] = [moscow ? 'MSCW/TIME' : `SATS/${currency}`]

    const digitSlots = panels >= 1 ? panels - 1 : 0
    const digits: string[] = Array(digitSlots).fill(' ')
    const isSats: boolean[] = Array(digitSlots).fill(false)
    if (sats >= 0 && digitSlots > 0) {
        const buf = String(sats)
        if (buf.length >= digitSlots) {
            const start = buf.length - digitSlots
            for (let i = 0; i < digitSlots; ++i) digits[i] = buf[start + i]
        } else {
            const pad = digitSlots - buf.length
            for (let i = 0; i < digitSlots; ++i) {
                digits[i] = i < pad ? ' ' : buf[i - pad]
            }
            if (pad > 0 && opts.useSatsSymbol !== false) {
                isSats[pad - 1] = true
                digits[pad - 1] = ' '
            }
        }
    }
    for (let i = 0; i < digitSlots; ++i) {
        if (isSats[i]) out.push('STS')
        else out.push(charSlot(digits[i]))
    }
    return out
}

// Block fee rate. Panel 0 = "FEE/RATE", inner = digits, last = "sat/vB".
export function parseFeeRate(feeSatsVb: number, panels = 7): Cells {
    const out: string[] = ['FEE/RATE']
    const digitSlots = panels >= 2 ? panels - 2 : 0
    const fee = feeSatsVb >= 0 ? feeSatsVb : -1
    const digits = layoutFeeRate(fee, digitSlots)
    for (let i = 0; i < digitSlots; ++i) out.push(charSlot(digits[i]))
    out.push('sat/vB')
    return out
}

// Halving countdown. Default `asBlocks=true` (label + N digits remaining);
// `asBlocks=false` emits the years/days/hours/mins breakdown cells.
export function parseHalving(
    height: number,
    opts: { asBlocks?: boolean } = {},
    panels = 7
): Cells {
    const asBlocks = opts.asBlocks !== false
    if (asBlocks) {
        const rem = halvingCountdown(height)
        const out: string[] = ['HAL/VING']
        const digitSlots = panels - 1
        const digits = formatDigits(rem, digitSlots)
        for (let i = 0; i < digitSlots; ++i) out.push(charSlot(digits[i]))
        return out
    }
    // Time mode anchored at the trailing 7 slots.
    const tb = halvingCountdownBreakdown(height)
    const s7: string[] = [
        'BIT/COIN',
        'HAL/VING',
        `${tb.years}/YRS`,
        `${tb.days}/DAYS`,
        `${tb.hours}/HRS`,
        `${tb.minutes}/MINS`,
        'TO/GO',
    ]
    if (panels < 7) return s7.slice(7 - panels)
    const out: string[] = []
    for (let i = 0; i < panels - 7; ++i) out.push('')
    for (const c of s7) out.push(c)
    return out
}

// --- internal helpers (mirror panel_texts.cpp) ---

function emitBigCharsFrame(label: string, s: string, panels: number): Cells {
    const out: Cells = [label]
    if (panels <= 1) return out
    const tailSlots = panels - 1
    let cells = splitCodepoints(s)
    if (cells.length < tailSlots) {
        cells = Array(tailSlots - cells.length)
            .fill(' ')
            .concat(cells)
    } else if (cells.length > tailSlots) {
        cells = cells.slice(cells.length - tailSlots)
    }
    for (const c of cells) out.push(c === ' ' ? '' : c)
    return out
}

function emitSmallCharsGroups(
    label: string,
    value: number,
    ccyCell: string,
    panels: number
): Cells {
    const out: Cells = Array(panels).fill('')
    out[0] = label
    if (panels <= 1) return out
    const groups = smallCharsGroups(value, ccyCell, panels - 1)
    for (let i = 0; i < groups.length; ++i) out[1 + i] = groups[i]
    return out
}
