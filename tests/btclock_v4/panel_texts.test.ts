// Parity tests against btclock_v4's host-side test_datahandler_parity.cpp.
// Each case mirrors a C++ TEST_CASE — same input, same expected cell layout —
// so the TS port stays byte-for-byte aligned with what the device emits.

import { describe, expect, it } from 'vitest'

import {
    parseBitcoinSupply,
    parseBlockHeight,
    parseBtcPrice,
    parseFeeRate,
    parseHalving,
    parseMarketCap,
    parseSatsPerCurrency,
} from '../../src/btclock_v4/panel_texts'

describe('parseBlockHeight (BuildBlockHeight)', () => {
    it('SixCharacterBlockHeight (999_999 keeps label)', () => {
        const out = parseBlockHeight(999_999)
        expect(out[0]).toBe('BLOCK/HEIGHT')
        expect(out[1]).toBe('9')
    })

    it('SevenCharacterBlockHeight (1_000_000 drops label)', () => {
        const out = parseBlockHeight(1_000_000)
        expect(out[0]).toBe('1')
        expect(out[1]).toBe('0')
    })

    it('MainnetCurrent (~900k still keeps label)', () => {
        const out = parseBlockHeight(900_123)
        expect(out).toEqual(['BLOCK/HEIGHT', '9', '0', '0', '1', '2', '3'])
    })

    it('PostLabelDrop (1_234_567 paints every panel)', () => {
        const out = parseBlockHeight(1_234_567)
        expect(out).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    })
})

describe('parseFeeRate (BuildFeeRate)', () => {
    it('FeeRateDisplay (21.21 → "21" integer-rounded)', () => {
        const out = parseFeeRate(21.21)
        expect(out[0]).toBe('FEE/RATE')
        expect(out[7 - 3]).toBe('2')
        expect(out[7 - 2]).toBe('1')
        expect(out[7 - 1]).toBe('sat/vB')
    })

    it('FeeRateDisplay2 (1.1 → "1.10" decimal)', () => {
        const out = parseFeeRate(1.1)
        expect(out[0]).toBe('FEE/RATE')
        expect(out[7 - 5]).toBe('1')
        expect(out[7 - 4]).toBe('.')
        expect(out[7 - 3]).toBe('1')
        expect(out[7 - 2]).toBe('0')
        expect(out[7 - 1]).toBe('sat/vB')
    })

    it('HighRate (150)', () => {
        const out = parseFeeRate(150)
        expect(out[7 - 4]).toBe('1')
        expect(out[7 - 3]).toBe('5')
        expect(out[7 - 2]).toBe('0')
    })

    it('BoundaryTen (10.0 → integer "10")', () => {
        const out = parseFeeRate(10.0)
        expect(out[7 - 3]).toBe('1')
        expect(out[7 - 2]).toBe('0')
    })
})

describe('parseBtcPrice (BuildBtcPrice — suffix / MOW / share-dot)', () => {
    it('PriceOf100kusd plain → label kept; "100000" packs the digit slots', () => {
        // V4's BuildBtcPrice diverged from old firmware: the integer-overflow
        // guard fires only on `digits >= n_panels` (7), so "100000" (6 digits)
        // stays in the label-path and the glyph drops to make room. The old
        // parity tests asserted `out[0]="$"` against the old firmware's
        // overflow-at-NUM_SCREENS behaviour — V4 doesn't reproduce that here.
        const out = parseBtcPrice(100000, 'USD')
        expect(out[0]).toBe('BTC/USD')
        expect(out.slice(1).join('')).toBe('100000')
    })

    it('PriceOf1MillionUsd (suffix mode)', () => {
        const out = parseBtcPrice(1_000_000, 'USD', { suffix: true })
        expect(out[0]).toBe('BTC/USD')
        expect(out[7 - 5]).toBe('1')
        expect(out[7 - 4]).toBe('.')
        expect(out[7 - 3]).toBe('0')
        expect(out[7 - 2]).toBe('0')
        expect(out[7 - 1]).toBe('M')
    })

    it('PriceSuffixMode (93_000 → 93.0K)', () => {
        const out = parseBtcPrice(93_000, 'USD', { suffix: true })
        expect(out[0]).toBe('BTC/USD')
        expect(out[7 - 5]).toBe('9')
        expect(out[7 - 4]).toBe('3')
        expect(out[7 - 3]).toBe('.')
        expect(out[7 - 2]).toBe('0')
        expect(out[7 - 1]).toBe('K')
    })

    it('PriceSuffixModeCompact1 (100k + shareDot → "$100.0K")', () => {
        const out = parseBtcPrice(100_000, 'USD', { suffix: true, shareDot: true })
        expect(out[0]).toBe('BTC/USD')
        expect(out[7 - 6]).toBe('$')
        expect(out[7 - 5]).toBe('1')
        expect(out[7 - 4]).toBe('0')
        expect(out[7 - 3]).toBe('0.')
        expect(out[7 - 2]).toBe('0')
        expect(out[7 - 1]).toBe('K')
    })

    it('PriceSuffixModeCompact2 (1M + shareDot → "$1.000M")', () => {
        const out = parseBtcPrice(1_000_000, 'USD', { suffix: true, shareDot: true })
        expect(out[0]).toBe('BTC/USD')
        expect(out[7 - 6]).toBe('$')
        expect(out[7 - 5]).toBe('1.')
        expect(out[7 - 4]).toBe('0')
        expect(out[7 - 3]).toBe('0')
        expect(out[7 - 2]).toBe('0')
        expect(out[7 - 1]).toBe('M')
    })

    it('PriceSuffixModeMow (93600 → "$.093M")', () => {
        const out = parseBtcPrice(93_600, 'USD', { suffix: true, mowMode: true })
        expect(out[0]).toBe('$')
        expect(out[7 - 5]).toBe('.')
        expect(out[7 - 4]).toBe('0')
        expect(out[7 - 3]).toBe('9')
        expect(out[7 - 2]).toBe('3')
        expect(out[7 - 1]).toBe('M')
    })

    it('PriceSuffixModeMowCompact (93600 + mow + shareDot → "MOW/UNITS … 0.093M")', () => {
        const out = parseBtcPrice(93_600, 'USD', {
            suffix: true,
            mowMode: true,
            shareDot: true,
        })
        expect(out[0]).toBe('MOW/UNITS')
        expect(out[7 - 6]).toBe('$')
        expect(out[7 - 5]).toBe('0.')
        expect(out[7 - 4]).toBe('0')
        expect(out[7 - 3]).toBe('9')
        expect(out[7 - 2]).toBe('3')
        expect(out[7 - 1]).toBe('M')
    })
})

describe('parseMarketCap (BuildMarketCap)', () => {
    it('McapLowerUsd (bigChars suffix, 26000 @ 810k → $507B)', () => {
        const out = parseMarketCap(810_000, 26_000, 'USD', { bigChars: true })
        expect(out[0]).toBe('USD/MCAP')
        expect(out[7 - 5]).toBe('$')
        expect(out[7 - 4]).toBe('5')
        expect(out[7 - 3]).toBe('0')
        expect(out[7 - 2]).toBe('7')
        expect(out[7 - 1]).toBe('B')
    })

    it('Mcap1TrillionUsd (bigChars suffix, 52000 @ 831k → $1.02T)', () => {
        const out = parseMarketCap(831_000, 52_000, 'USD', { bigChars: true })
        expect(out[0]).toBe('USD/MCAP')
        expect(out[7 - 6]).toBe('$')
        expect(out[7 - 5]).toBe('1')
        expect(out[7 - 4]).toBe('.')
        expect(out[7 - 3]).toBe('0')
        expect(out[7 - 2]).toBe('2')
        expect(out[7 - 1]).toBe('T')
    })

    it('Mcap1TrillionUsdSmallChars', () => {
        const out = parseMarketCap(831_000, 52_000, 'USD')
        expect(out[0]).toBe('USD/MCAP')
        expect(out[7 - 6]).toBe(' $ ')
        expect(out[7 - 5]).toBe('  1')
        expect(out[7 - 4]).toBe('020')
        expect(out[7 - 3]).toBe('825')
        expect(out[7 - 2]).toBe('000')
        expect(out[7 - 1]).toBe('000')
    })

    it('Mcap1TrillionEur (bigChars suffix, UTF-8 €)', () => {
        const out = parseMarketCap(831_000, 52_000, 'EUR', { bigChars: true })
        expect(out[0]).toBe('EUR/MCAP')
        expect(out[7 - 6]).toBe('€')
        expect(out[7 - 5]).toBe('1')
        expect(out[7 - 4]).toBe('.')
        expect(out[7 - 3]).toBe('0')
        expect(out[7 - 2]).toBe('2')
        expect(out[7 - 1]).toBe('T')
    })

    it('Mcap1TrillionEurSmallChars (UTF-8 € separator)', () => {
        const out = parseMarketCap(831_000, 52_000, 'EUR')
        expect(out[0]).toBe('EUR/MCAP')
        expect(out[7 - 6]).toBe(' € ')
        expect(out[7 - 5]).toBe('  1')
        expect(out[7 - 4]).toBe('020')
    })
})

describe('parseBitcoinSupply (BuildBitcoinSupply)', () => {
    it('BitcoinSupply (bigChars at 880k → "19.81M" packs all six tail cells)', () => {
        // V4's BuildBitcoinSupply bumped the formatter budget from
        // n_panels-2 (old firmware) to n_panels-1 so the magnitude fills
        // the full tail with no leading blank — pinned at 880k → "19.81M"
        // in test_panel_texts.cpp.
        const out = parseBitcoinSupply(880_000, { bigChars: true })
        expect(out).toEqual(['BTC/SUPPLY', '1', '9', '.', '8', '1', 'M'])
    })

    it('BitcoinSupplyPercentage (831k → 93.48%)', () => {
        const out = parseBitcoinSupply(831_000, { showPercent: true })
        expect(out[0]).toBe('BTC/SUPPLY')
        expect(out[7 - 6]).toBe('9')
        expect(out[7 - 5]).toBe('3')
        expect(out[7 - 4]).toBe('.')
        expect(out[7 - 3]).toBe('4')
        expect(out[7 - 2]).toBe('8')
        expect(out[7 - 1]).toBe('%')
    })

    it('BitcoinSupplySmallChars (655_987 → groups containing " 18", "537")', () => {
        const out = parseBitcoinSupply(655_987)
        expect(out[0]).toBe('BTC/SUPPLY')
        expect(out[7 - 3]).toBe(' 18')
        expect(out[7 - 2]).toBe('537')
    })
})

describe('parseSatsPerCurrency (BuildMoscowTime)', () => {
    it('USD in Moscow range gets MSCW/TIME label', () => {
        const out = parseSatsPerCurrency(60000, 'USD')
        expect(out[0]).toBe('MSCW/TIME')
        // 1e8/60000 = 1666.6666… → 1667
        const digits = out.slice(1).filter((c) => /^[0-9]$/.test(c))
        expect(digits.join('')).toBe('1667')
    })

    it('EUR keeps SATS/EUR label (never gets Moscow)', () => {
        const out = parseSatsPerCurrency(50000, 'EUR')
        expect(out[0]).toBe('SATS/EUR')
    })

    it('useSatsSymbol=true emits "STS" marker before the digits', () => {
        const out = parseSatsPerCurrency(60000, 'USD', { useSatsSymbol: true })
        expect(out).toContain('STS')
    })

    it('useSatsSymbol=false suppresses the marker', () => {
        const out = parseSatsPerCurrency(60000, 'USD', { useSatsSymbol: false })
        expect(out).not.toContain('STS')
    })
})

describe('parseHalving (BuildHalving)', () => {
    it('asBlocks=true emits HAL/VING + countdown digits', () => {
        const out = parseHalving(0, { asBlocks: true })
        expect(out[0]).toBe('HAL/VING')
        // height 0 → 210_000 blocks remaining, right-justified across 6 slots.
        const digits = out.slice(1).join('')
        expect(digits.replace(/\s/g, '')).toBe('210000')
    })

    it('TimeMode at block 0 (full interval → 3 years 363 days 8 hours)', () => {
        const out = parseHalving(0, { asBlocks: false })
        expect(out).toEqual([
            'BIT/COIN',
            'HAL/VING',
            '3/YRS',
            '363/DAYS',
            '8/HRS',
            '0/MINS',
            'TO/GO',
        ])
    })

    it('TimeMode near a halving (209_999 → 10 minutes total)', () => {
        const out = parseHalving(209_999, { asBlocks: false })
        expect(out[7 - 5]).toBe('0/YRS')
        expect(out[7 - 4]).toBe('0/DAYS')
        expect(out[7 - 3]).toBe('0/HRS')
        expect(out[7 - 2]).toBe('10/MINS')
    })

    it('TimeMode rolls over at exact halving block (0 ≡ 210_000)', () => {
        const a = parseHalving(0, { asBlocks: false })
        const b = parseHalving(210_000, { asBlocks: false })
        expect(a).toEqual(b)
    })
})
