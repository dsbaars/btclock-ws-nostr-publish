<script setup lang="ts">
// Pure-presentation BTClock preview. Takes a per-panel `cells` array
// (output of any parse* helper in src/btclock_v4/panel_texts.ts) and
// renders it with the existing webfonts loaded in app.css — no WASM,
// no embedded font blobs.

import type { Cells } from '../btclock_v4/panel_texts'

defineProps<{ cells: Cells; title?: string }>()

const codepointCount = (s: string): number => Array.from(s).length

// "X." (digit + shared dot) renders as one digit cell — the suffix
// share_dot path emits this 2-char cell intentionally so the WebUI
// preview matches what the EPD paints in that slot.
const isDigitCell = (s: string): boolean => {
    if (codepointCount(s) === 1) return true
    if (s.length === 2 && s[1] === '.') return true
    return false
}

const splitParts = (s: string): [string, string] => {
    const idx = s.indexOf('/')
    if (idx < 0) return [s, '']
    return [s.slice(0, idx), s.slice(idx + 1)]
}

// Device's DrawSplitText draws the pill bar at the *shorter* ink width
// of the two text lines. We mirror that by sizing a hidden span with
// the shorter string and overlaying the divider on top — the divider's
// rendered width then tracks the actual font metrics.
const shorterPart = (s: string): string => {
    const [a, b] = splitParts(s)
    return a.length <= b.length ? a : b
}
</script>

<template>
    <small v-if="title" class="block md:hidden text-center btclockv4-title">{{ title }}</small>
    <div class="btclockv4" :class="{ tooltip: !!title }" :data-tip="title ?? ''">
        <template v-for="(c, i) in cells" :key="i">
            <div v-if="c.includes('/')" class="cell split">
                <span class="line top">{{ splitParts(c)[0] }}</span>
                <span class="divider" aria-hidden="true">{{ shorterPart(c) }}</span>
                <span class="line bottom">{{ splitParts(c)[1] }}</span>
            </div>
            <div v-else-if="c === 'STS'" class="cell sats">S</div>
            <div v-else-if="c === ''" class="cell blank" aria-hidden="true"></div>
            <div v-else-if="isDigitCell(c)" class="cell digit">{{ c }}</div>
            <div v-else class="cell medium">{{ c }}</div>
        </template>
    </div>
</template>

<style scoped>
/* Chassis: black backdrop, rounded corners. Sized to its content so
   it sits naturally inside the preview-container flex grid (multiple
   per row on wide screens). */
.btclockv4 {
    background: #000;
    border-radius: 10px;
    padding: 12px;
    margin: 12px 0;
    display: inline-flex;
    gap: 8px;
    width: max-content;
    max-width: 100%;
    box-sizing: border-box;
}

.btclockv4-title {
    margin-top: 8px;
    margin-bottom: 4px;
}

/* One panel — fixed width, height derived from the device's 122:250
   portrait aspect (rotated EPD). 4.5rem ≈ 72 px on default settings →
   panel ~72×148 px, which fits 7 panels in ~620 px and lets two
   BTClockV4 instances sit side-by-side on a 1280 px viewport. */
.cell {
    width: 4.5rem;
    aspect-ratio: 122 / 250;
    background: #fff;
    color: #000;
    border: 2px solid #d4af37;
    border-radius: 7px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    font-family: 'Antonio', sans-serif;
    font-weight: 400;
    line-height: 1;
    box-sizing: border-box;
    padding: 0.4rem 0.25rem;
    /* Enables cqi (% of cell width) for child sizing — labels & divider
       scale with the cell so the text fills the panel like the device's
       FitTextPx does. */
    container-type: size;
}

/* Big bold digit — Antonio condensed at 4rem on a 4.5rem-wide cell
   gives a glyph ~2.4rem wide, so single digits ('9', '$', '€') and
   the share-dot pair ("1.") both fit horizontally with margin. */
.cell.digit {
    font-size: 4rem;
}

.cell.sats {
    font-family: 'Satoshi Symbol', sans-serif;
    font-size: 3.6rem;
}

.cell.blank {
    /* intentionally empty */
}

/* "Medium text" — captions like "CHF" or 3-digit small-chars groups
   (" 18", "537", " $ "). Half the digit font-size to match the device's
   kSmallGroupPx=90 vs kDigitPx=180. `white-space: pre` keeps the
   leading/trailing spaces in groups like " $ " visible (so the glyph
   stays centred instead of left-aligning). Antonio's narrow metrics
   keep three chars well within the cell at 1.6rem on a 4.5rem panel. */
.cell.medium {
    font-family: 'Antonio', sans-serif;
    font-weight: 400;
    font-size: 1.6rem;
    text-align: center;
    white-space: pre;
}

/* Split-text label cell. Mirrors DrawSplitText: top text, centred pill
   divider, bottom text — both lines at the same size, divider crossing
   the panel's vertical centre. */
.cell.split {
    /* Match the device: labels share the digit font (Antonio condensed),
       NOT Oswald — see fonts_app.cpp's `label()` defaults. */
    font-family: 'Antonio', sans-serif;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0;
    gap: 0.25rem;
    padding: 0.5rem 0.15rem;
}

/* Lines auto-fit the panel via container-query units: 38cqi (= 38% of
   cell width) is tuned so the widest 6-char label ("HEIGHT", "SUPPLY")
   in Antonio Regular renders at ~95% of cell width — matches the
   device's FitTextPx, which shrinks pixel_height to fit the wider of
   the two strings. Shorter labels render proportionally narrower at
   the same font-size, so the divider (driven by the shorter line via
   the same font metrics) scales accordingly. */
.cell.split .line {
    font-size: 38cqi;
    text-align: center;
    white-space: nowrap;
}

/* Pill divider — width tracks the *shorter* of the two text lines.
   We render an invisible sizer span containing that shorter string at
   the same font metrics, so the wrapper inherits its width naturally;
   the divider is absolutely positioned to fill the wrapper's box. */
/* Pill divider — the element renders the *shorter* of the two text
   lines invisibly (color: transparent) at the same font metrics as
   the .line spans. Its width therefore tracks the actual rendered ink
   width of the shorter text, mirroring the device's DrawSplitText.
   The visible pill is a 3px black box-shadow centered on the element. */
.cell.split .divider {
    color: transparent;
    background: #000;
    height: 3px;
    line-height: 0;
    border-radius: 999px;
    /* Match .line font-size + weight so the rendered character width
       is the same as what .line draws — the divider then tracks the
       shorter line's actual ink width. */
    font-size: 38cqi;
    font-weight: 400;
    white-space: nowrap;
    overflow: hidden;
    /* Vertical breathing room around the bar. */
    margin: 0.15rem 0;
    /* Cap so a long label like "HEIGHT" doesn't push the bar past the
       cell — the device's bar caps at the cell width minus padding. */
    max-width: 90%;
}

/* Mobile: cells shrink so 7 still fit on a 360-class viewport. */
@media (max-width: 540px) {
    .cell {
        width: 2.5rem;
    }
    .cell.digit {
        font-size: 2.2rem;
    }
    .cell.sats {
        font-size: 2rem;
    }
    .cell.medium {
        font-size: 0.65rem;
    }
    /* Mobile inherits the same cqi-based sizing — no override needed. */
}
</style>
