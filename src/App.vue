<script setup lang="ts">
import { onMounted, reactive, ref, useTemplateRef, watch } from 'vue'
import Toastify from 'toastify-js'
import { confetti } from '@tsparticles/confetti'
import { Encoder, Decoder } from '@msgpack/msgpack'
import 'toastify-js/src/toastify.css'

import BTClock from './components/BTClock.vue'
import NostrTerminal from './components/NostrTerminal.vue'
import TerminalPane from './components/TerminalPane.vue'
import { WsConnection } from './ws_connection'
import { colorizeJson, timestamp } from './terminal-log'
import { CURRENCY_AUD, CURRENCY_CAD, CURRENCY_EUR, CURRENCY_GBP, CURRENCY_JPY } from './constants'

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

const otherCurrencies = [
    { code: 'EUR', symbol: CURRENCY_EUR },
    { code: 'GBP', symbol: CURRENCY_GBP },
    { code: 'JPY', symbol: CURRENCY_JPY },
    { code: 'AUD', symbol: CURRENCY_AUD },
    { code: 'CAD', symbol: CURRENCY_CAD },
] as const

const OTHER_CURRENCY_SUBSCRIPTION = otherCurrencies.map((c) => c.code)

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
                currentPrice.value = data.bitcoin
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
            currentPriceOther[currency] = data.price[currency]
        }
        if (data.blockfee2) feeRate.value = data.blockfee2
    })
    socket2.open()
}

watch(showOtherCurrencies, (show) => {
    const type = show ? 'subscribe' : 'unsubscribe'
    socket2.send(
        encoder.encode({ type, eventType: 'price', currencies: OTHER_CURRENCY_SUBSCRIPTION })
    )
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
        <template v-for="cur in otherCurrencies" :key="cur.code">
            <BTClock
                :data="currentPriceOther[cur.code]"
                method="parsePriceData"
                :params="[cur.symbol, false, false, false]"
            />
            <BTClock
                :data="currentPriceOther[cur.code]"
                method="parseSatsPerCurrency"
                :params="[cur.symbol, showSatsSymbol, true]"
            />
            <BTClock
                :data="blockHeight"
                method="parseMarketCap"
                :params="[currentPriceOther[cur.code], cur.symbol, false]"
            />
        </template>
    </div>

    <div class="preview-container">
        <BTClock :data="blockHeight" method="parseBlockHeight" title="Block Height" />
        <BTClock
            :data="blockHeight"
            method="parseBitcoinSupply"
            :params="[true, false]"
            title="BTC Supply (absolute)"
        />
        <BTClock
            :data="blockHeight"
            method="parseBitcoinSupply"
            :params="[true, true]"
            title="BTC Supply (percentage) "
        />
        <BTClock :data="feeRate" method="parseBlockFees" title="Fee Rate (rounded)" />
        <BTClock
            :data="blockHeight"
            method="parseHalvingCountdown"
            :params="[true]"
            title="Halving Countdown (Blocks)"
        />
        <BTClock
            :data="blockHeight"
            method="parseHalvingCountdown"
            :params="[false]"
            title="Halving Countdown (Date)"
        />
        <BTClock
            :data="currentPrice"
            method="parseSatsPerCurrency"
            :params="['$', showSatsSymbol, true]"
            title="Sats per Currency"
        />
        <BTClock
            :data="blockHeight"
            method="parseMarketCap"
            :params="[currentPrice, '$', false]"
            title="Market Cap (small chars)"
        />
        <BTClock
            :data="blockHeight"
            method="parseMarketCap"
            :params="[currentPrice, '$', true]"
            title="Market Cap (big chars)"
        />
        <BTClock
            :data="currentPrice"
            method="parsePriceData"
            :params="['$', true, false, true]"
            title="Ticker (Suffix notation, compact)"
        />
        <BTClock
            :data="currentPrice"
            method="parsePriceData"
            :params="['$', true, false, false]"
            title="Ticker (Suffix notation)"
        />
        <BTClock
            :data="currentPrice"
            method="parsePriceData"
            :params="['$', false, false, false]"
            title="Ticker (Default)"
        />
        <BTClock
            :data="currentPrice"
            method="parsePriceData"
            :params="['$', true, true, true]"
            title="Ticker (Mow Suffix notation, compact)"
        />
        <BTClock
            :data="currentPrice"
            method="parsePriceData"
            :params="['$', true, true, false]"
            title="Ticker (Mow Suffix notation)"
        />
    </div>
</template>
