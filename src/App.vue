<script setup lang="ts">
import { onMounted, reactive, ref, useTemplateRef, watch } from 'vue'
import Toastify from 'toastify-js'
import { confetti } from '@tsparticles/confetti'
import { Encoder, Decoder } from '@msgpack/msgpack'
import 'toastify-js/src/toastify.css'

import BTClockV4 from './components/BTClockV4.vue'
import NostrTerminal from './components/NostrTerminal.vue'
import TerminalPane from './components/TerminalPane.vue'
import { WsConnection } from './ws_connection'
import { colorizeJson, timestamp } from './terminal-log'
import {
    parseBlockHeight,
    parseBitcoinSupply,
    parseMarketCap,
    parseBtcPrice,
    parseSatsPerCurrency,
    parseFeeRate,
    parseHalving,
} from './btclock_v4/panel_texts'

const encoder = new Encoder()
const decoder = new Decoder()

const wsTerminal = useTemplateRef<InstanceType<typeof TerminalPane>>('wsTerminal')
const wsTerminal2 = useTemplateRef<InstanceType<typeof TerminalPane>>('wsTerminal2')

const INITIAL_BLOCK_HEIGHT = 859000
const blockHeight = ref<number>(INITIAL_BLOCK_HEIGHT)
const feeRate = ref<number>(5)
const currentPrice = ref<number>(60000)
const currentPriceOther = reactive<Record<string, number>>({
    EUR: 0,
    CAD: 0,
    GBP: 0,
    JPY: 0,
    AUD: 0,
})
const ignoreDataSource = ref<boolean>(false)
const showOtherCurrencies = ref<boolean>(false)
const showSatsSymbol = ref<boolean>(false)

const otherCurrencies = ['EUR', 'GBP', 'JPY', 'AUD', 'CAD'] as const

const websocketProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
const host = import.meta.env.DEV ? 'localhost:8080' : window.location.host
const websocketUrl1 = `${websocketProtocol}//${host}/api/v1/ws`
const websocketUrl2 = `${websocketProtocol}//${host}/api/v2/ws`

const socket1 = new WsConnection(websocketUrl1, 'blob', true)
const socket2 = new WsConnection(websocketUrl2, 'arraybuffer', true)

let lastSeenBlockHeight = 840000

function maybeCelebrateBlock(newHeight: number) {
    if (lastSeenBlockHeight !== 840000 && lastSeenBlockHeight !== newHeight) {
        confetti({ particleCount: 100, spread: 70, origin: { x: 1, y: 1 } })
        Toastify({
            text: `Block ${newHeight} has been found!`,
            duration: 3000,
            gravity: 'bottom',
        }).showToast()
    }
    lastSeenBlockHeight = newHeight
}

function wireV1() {
    socket1.on('message', (eventData: string) => {
        const data = JSON.parse(eventData)

        if (!ignoreDataSource.value) {
            if (data.block) {
                maybeCelebrateBlock(data.block.height)
                blockHeight.value = data.block.height
            } else if (data.bitcoin) {
                // Wire carries price as a string (DataStorage.lastPrice is
                // map[string]string on the server). Coerce at the boundary.
                currentPrice.value = Number(data.bitcoin)
            }
        }

        wsTerminal.value?.writeln(`\x1b[32m${timestamp()}\x1b[0m ${colorizeJson(data)}`)
    })
    socket1.open()
}

function wireV2() {
    socket2.on('open', () => {
        socket2.send(encoder.encode({ type: 'subscribe', eventType: 'price', currencies: ['USD'] }))
        socket2.send(encoder.encode({ type: 'subscribe', eventType: 'blockheight' }))
        socket2.send(encoder.encode({ type: 'subscribe', eventType: 'blockfee' }))
        socket2.send(encoder.encode({ type: 'subscribe', eventType: 'blockfee2' }))
    })

    socket2.on('send', (frame: Uint8Array) => {
        wsTerminal2.value?.writeln(
            `\x1b[32m${timestamp()}\x1b[0m >> ${colorizeJson(decoder.decode(frame))}`
        )
    })

    socket2.on('message', (eventData: ArrayBuffer) => {
        let data: any
        try {
            data = decoder.decode(eventData)
        } catch {
            console.log('Error decoding message', eventData)
            return
        }

        wsTerminal2.value?.writeln(`\x1b[32m${timestamp()}\x1b[0m << ${colorizeJson(data)}`)

        if (data.price) {
            const currency = Object.keys(data.price)[0]
            currentPriceOther[currency] = Number(data.price[currency])
        }
        if (data.blockfee2) feeRate.value = data.blockfee2
    })
    socket2.open()
}

watch(showOtherCurrencies, (show) => {
    const type = show ? 'subscribe' : 'unsubscribe'
    socket2.send(encoder.encode({ type, eventType: 'price', currencies: [...otherCurrencies] }))
})

onMounted(() => {
    wireV1()
    wireV2()
})
</script>

<template>
    <div class="navbar bg-base-200">
        <div class="w-full px-4">
            <span class="text-xl font-semibold">BTClock WebSocket Data Server</span>
        </div>
    </div>

    <form class="w-full px-4 my-4" id="dataForm">
        <fieldset class="space-y-3">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label class="input input-sm w-full">
                    <span class="label">Price</span>
                    <input type="number" min="0" placeholder="Price" v-model="currentPrice" />
                </label>
                <label class="input input-sm w-full">
                    <span class="label">Block Height</span>
                    <input type="number" min="0" placeholder="Block Height" v-model="blockHeight" />
                </label>
                <label class="input input-sm w-full">
                    <span class="label">Fee Rate</span>
                    <input type="number" min="0" placeholder="Fee Rate" v-model="feeRate" />
                </label>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label class="label cursor-pointer justify-start gap-2">
                    <input
                        type="checkbox"
                        class="checkbox checkbox-sm"
                        v-model="ignoreDataSource"
                    />
                    <span class="label-text">Ignore data source</span>
                </label>
                <label class="label cursor-pointer justify-start gap-2">
                    <input
                        type="checkbox"
                        class="checkbox checkbox-sm"
                        v-model="showOtherCurrencies"
                    />
                    <span class="label-text">Show other currencies</span>
                </label>
                <label class="label cursor-pointer justify-start gap-2">
                    <input type="checkbox" class="checkbox checkbox-sm" v-model="showSatsSymbol" />
                    <span class="label-text">Show sats symbol</span>
                </label>
            </div>
        </fieldset>
    </form>

    <div class="w-full px-2">
        <div class="flex flex-wrap -mx-2">
            <TerminalPane ref="wsTerminal" title="Websocket Data v1 (JSON) " :socket="socket1" />
            <TerminalPane
                ref="wsTerminal2"
                title="Websocket Data v2 (MsgPack) "
                :socket="socket2"
            />
            <NostrTerminal />
        </div>
    </div>

    <div class="preview-container" v-if="showOtherCurrencies">
        <template v-for="cur in otherCurrencies" :key="cur">
            <BTClockV4 :cells="parseBtcPrice(currentPriceOther[cur], cur)" />
            <BTClockV4
                :cells="
                    parseSatsPerCurrency(currentPriceOther[cur], cur, {
                        useSatsSymbol: showSatsSymbol,
                    })
                "
            />
            <BTClockV4 :cells="parseMarketCap(blockHeight, currentPriceOther[cur], cur)" />
        </template>
    </div>

    <div class="preview-container">
        <BTClockV4 :cells="parseBlockHeight(blockHeight)" title="Block Height" />
        <BTClockV4
            :cells="parseBitcoinSupply(blockHeight, { bigChars: true })"
            title="BTC Supply (big chars)"
        />
        <BTClockV4
            :cells="parseBitcoinSupply(blockHeight, { bigChars: true, showPercent: true })"
            title="BTC Supply (percentage)"
        />
        <BTClockV4 :cells="parseFeeRate(feeRate)" title="Fee Rate" />
        <BTClockV4
            :cells="parseHalving(blockHeight, { asBlocks: true })"
            title="Halving Countdown (Blocks)"
        />
        <BTClockV4
            :cells="parseHalving(blockHeight, { asBlocks: false })"
            title="Halving Countdown (Date)"
        />
        <BTClockV4
            :cells="parseSatsPerCurrency(currentPrice, 'USD', { useSatsSymbol: showSatsSymbol })"
            title="Sats per Currency"
        />
        <BTClockV4
            :cells="parseMarketCap(blockHeight, currentPrice, 'USD')"
            title="Market Cap (small chars)"
        />
        <BTClockV4
            :cells="parseMarketCap(blockHeight, currentPrice, 'USD', { bigChars: true })"
            title="Market Cap (big chars)"
        />
        <BTClockV4
            :cells="parseBtcPrice(currentPrice, 'USD', { suffix: true, shareDot: true })"
            title="Ticker (Suffix notation, compact)"
        />
        <BTClockV4
            :cells="parseBtcPrice(currentPrice, 'USD', { suffix: true })"
            title="Ticker (Suffix notation)"
        />
        <BTClockV4 :cells="parseBtcPrice(currentPrice, 'USD')" title="Ticker (Default)" />
        <BTClockV4
            :cells="
                parseBtcPrice(currentPrice, 'USD', { suffix: true, mowMode: true, shareDot: true })
            "
            title="Ticker (Mow Suffix notation, compact)"
        />
        <BTClockV4
            :cells="parseBtcPrice(currentPrice, 'USD', { suffix: true, mowMode: true })"
            title="Ticker (Mow Suffix notation)"
        />
    </div>
</template>
