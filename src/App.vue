<script setup lang="ts">
import BTClock from './components/BTClock.vue'
import NostrTerminal from './components/NostrTerminal.vue'
import WebsocketTerminal from './components/WebsocketTerminal.vue'
import cj from 'color-json';

import { ref, onMounted, watch } from 'vue'
import Toastify from "toastify-js";
import { tsParticles } from "@tsparticles/engine";
import { confetti } from "@tsparticles/confetti";
import { WsConnection } from "./ws_connection";
import "toastify-js/src/toastify.css"
import { CURRENCY_EUR, CURRENCY_GBP, CURRENCY_JPY, CURRENCY_AUD, CURRENCY_CAD, CURRENCY_USD } from './constants';

import { Encoder, Decoder } from "@msgpack/msgpack";

const encoder = new Encoder();
const decoder = new Decoder();

const wsTerminal = ref(null);
const wsTerminal2 = ref(null);

const customColorMap = {
    black: '\x1b[38;2;0;0;0m',
    red: '\x1b[38;2;249;133;123m',
    green: '\x1b[38;2;163;238;160m',
    yellow: '\x1b[38;2;209;154;102m',
    blue: '\x1b[36m',
    magenta: '\x1b[38;2;209;200;102m',
    cyan: '\x1b[38;2;75;167;239m',
    white: '\x1b[38;2;219;223;244m'
};

const blockHeight = ref();
blockHeight.value = 859000;
const feeRate = ref();
feeRate.value = 5;
const currentPrice = ref();
const currentPriceOther = ref();
currentPriceOther.value = {
    'EUR': 0,
    'CAD': 0,
    'GBP': 0,
    'JPY': 0,
    'AUD': 0,
};
currentPrice.value = 60000;
const ignoreDataSource = ref();
const showOtherCurrencies = ref(false);
const showSatsSymbol = ref(false);
const websocketProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
let websocketUrl1: string;
let websocketUrl2: string;

if (import.meta.env.DEV) {
    websocketUrl1 = websocketProtocol + '//localhost:8080/api/v1/ws';
    websocketUrl2 = websocketProtocol + '//localhost:8080/api/v2/ws';
} else {
    websocketUrl1 = websocketProtocol + '//' + window.location.host + '/api/v1/ws';
    websocketUrl2 = websocketProtocol + '//' + window.location.host + '/api/v2/ws';
}

const socket1 = new WsConnection(websocketUrl1, 'blob', true);
const socket2 = new WsConnection(websocketUrl2, 'arraybuffer', true);
let socket1BytesReceived = 0;
let socket2BytesReceived = 0;

function connectWebSocket() {
    let lastMessages = [];
    let currentBlockHeight = 840000;
    // Event handler for WebSocket open

    let isOpen = false;

    socket1.on('open', (event) => {
        isOpen = true;
        let timestamp = new Date().toLocaleString();
        wsTerminal.value.writeln(`\x1b[32m${timestamp}\x1b[36m WebSocket connection established`);

        console.log('WebSocket v1 connection established');
        document.getElementById('websocketConnection_indicator')?.classList.add('online');

    })

    socket1.on('message', (eventData) => {
        const data = JSON.parse(eventData);
        storeAndDisplayData(data);
        socket1BytesReceived = socket1.getBytesReceived();

    })

    socket1.on('close', (event) => {
        if (isOpen) {
            let timestamp = new Date().toLocaleString();
            wsTerminal.value.writeln(`\x1b[32m${timestamp}\x1b[36m WebSocket connection closed`);
            isOpen = false;
        }

        console.log('WebSocket connection closed');
        document.getElementById('websocketConnection')?.classList.remove('online');
    })

    socket1.on('error', (event) => {
        console.error('WebSocket 1 error:', event);
    })

    socket1.open();



    function storeAndDisplayData(data) {
        if (ignoreDataSource.value)
            return;

        if (data["block"]) {

            if (currentBlockHeight != 840000 && currentBlockHeight != data.block.height) {
                confetti({
                    particleCount: 100,
                    spread: 70,
                    origin: { x: 1, y: 1 },
                });

                Toastify({
                    text: `Block ${data.block.height} has been found!`,
                    duration: 3000,
                    gravity: 'bottom',
                }).showToast();
            }

            currentBlockHeight = data.block.height;
            blockHeight.value = currentBlockHeight;

        } else if (data['bitcoin']) {
            currentPrice.value = data['bitcoin'];
        } else if (data["mempool-blocks"]) {
            feeRate.value = data["mempool-blocks"][0].medianFee;
        }

        const timestamp = new Date().toLocaleString();
        const message = { timestamp, data: JSON.stringify(data) };

        wsTerminal.value.writeln(`\x1b[32m${timestamp}\x1b[0m ${cj(message.data, undefined, customColorMap, 0)}`);
        //    wsTerminal.value.writeln(`${message.data}`);

    }
}

function connectWebSocket2() {
    let isOpen = false;

    socket2.on('open', (event) => {
        isOpen = true;
        let timestamp = new Date().toLocaleString();
        wsTerminal2.value.writeln(`\x1b[32m${timestamp}\x1b[36m WebSocket connection established`);

        console.log('WebSocket v2 connection established');
        document.getElementById('websocketConection2_indicator')?.classList.add('online');
        socket2.send(encoder.encode({ "type": "subscribe", "eventType": "price", "currencies": ['USD'] }));
        socket2.send(encoder.encode({ "type": "subscribe", "eventType": "blockheight" }));
        socket2.send(encoder.encode({ "type": "subscribe", "eventType": "blockfee" }));

    })

    socket2.on('send', (event) => {
        let timestamp = new Date().toLocaleString();

        const message = { timestamp, data: JSON.stringify(decoder.decode(event)) };

        wsTerminal2.value.writeln(`\x1b[32m${timestamp}\x1b[0m >> ${cj(message.data, undefined, customColorMap, 0)}`);

    });

    socket2.on('message', (eventData) => {
        try {
            const data = decoder.decode(eventData);
            storeAndDisplayData2(data);
        } catch {
            console.log('Error decoding message', eventData);
        }
        socket2BytesReceived = socket2.getBytesReceived();

    })

    socket2.on('close', (event) => {
        if (isOpen) {
            let timestamp = new Date().toLocaleString();
            wsTerminal2.value.writeln(`\x1b[32m${timestamp}\x1b[36m WebSocket connection closed`);
            isOpen = false;
        }

        console.log('WebSocket connection closed');
        document.getElementById('websocketConnection')?.classList.remove('online');
    })

    socket2.on('error', (event) => {
        console.error('WebSocket error:', event);
    })

    socket2.open();

    function storeAndDisplayData2(data) {
        const timestamp = new Date().toLocaleString();
        const message = { timestamp, data: JSON.stringify(data) };

        wsTerminal2.value.writeln(`\x1b[32m${timestamp}\x1b[0m << ${cj(message.data, undefined, customColorMap, 0)}`);

        if (data.price) {
            let currency = Object.keys(data.price)[0];
            currentPriceOther.value[currency] = data.price[currency];
        }
    }
}

watch(showOtherCurrencies, async (show) => {
    if (show) {
        socket2.send(encoder.encode({ "type": "subscribe", "eventType": "price", "currencies": ['EUR', 'GBP', 'AUD', 'JPY', 'CAD'] }));
    } else {
        socket2.send(encoder.encode({ "type": "unsubscribe", "eventType": "price", "currencies": ['EUR', 'GBP', 'AUD', 'JPY', 'CAD'] }));
    }
})

onMounted(() => {
    connectWebSocket();
    connectWebSocket2();

})

</script>

<template class="pure-g">
    <h1>BTClock WebSocket Data Server</h1>
    <form class="container-fluid" id="dataForm">

        <fieldset>
            <div class="data-form">
                <div class="row">
                    <div class="control">
                        <label for="data-price">Price</label>
                        <input type="number" id="data-price" v-model="currentPrice" min="0" placeholder="Price" />
                    </div>
                    <div class="control">
                        <label for="data-blockHeight">Block Height</label>
                        <input type="number" id="data-blockHeight" v-model="blockHeight" min="0"
                            placeholder="Block Height" />
                    </div>
                    <div class="control">
                        <label for="data-feeRate">Fee Rate</label>
                        <input type="number" id="data-feeRate" v-model="feeRate" min="0" placeholder="Fee Rate" />
                    </div>
                </div>
                <div class="row">

                <div class="control">
                    <input type="checkbox" v-model="ignoreDataSource" id="ignore-external-data" /> &nbsp;
                    <label for="ignore-external-data" class="form-check-label">Ignore data source</label>
                </div>
                <div class="control">
                    <input type="checkbox" v-model="showOtherCurrencies" id="show-other-currencies" /> &nbsp;
                    <label for="show-other-currencies" class="form-check-label">Show other currencies</label>
                </div>
                <div class="control">
                    <input type="checkbox" v-model="showSatsSymbol" id="show-sats-symbol" /> &nbsp;
                    <label for="show-sats-symbol" class="form-check-label">Show sats symbol</label>
                </div>
                </div>
            </div>

        </fieldset>
    </form>
    <div class="container-fluid">
        <div class="row">
            <div id="terminalContainer" class="termContainer">
                <WebsocketTerminal componentId="websocketConnection" :socket="socket1"
                    :version="'v1 (JSON) '" ref="wsTerminal"></WebsocketTerminal>
            </div>
            <div id="terminal2Container" class="termContainer">
                <WebsocketTerminal componentId="websocketConection2" :socket="socket2"
                    :version="'v2 (MsgPack) '" ref="wsTerminal2"></WebsocketTerminal>
            </div>
            <div id="nostrContainer" class="termContainer">
                <NostrTerminal></NostrTerminal>
            </div>
        </div>

    </div>
    <div class="preview-container" v-if="showOtherCurrencies">
        <BTClock :data="currentPriceOther.EUR" method="parsePriceData" :params="[CURRENCY_EUR, false, false, false]"></BTClock>
        <BTClock :data="currentPriceOther.EUR" method="parseSatsPerCurrency" :params="[CURRENCY_EUR, showSatsSymbol]"></BTClock>
        <BTClock :data="blockHeight" method="parseMarketCap" :params="[currentPriceOther.EUR, CURRENCY_EUR, false]"></BTClock>

        <BTClock :data="currentPriceOther.GBP" method="parsePriceData" :params="[CURRENCY_GBP, false, false, false]"></BTClock>
        <BTClock :data="currentPriceOther.GBP" method="parseSatsPerCurrency" :params="[CURRENCY_GBP, showSatsSymbol]"></BTClock>
        <BTClock :data="blockHeight" method="parseMarketCap" :params="[currentPriceOther.GBP, CURRENCY_GBP, false]"></BTClock>

        <BTClock :data="currentPriceOther.JPY" method="parsePriceData" :params="[CURRENCY_JPY, false, false, false]"></BTClock>
        <BTClock :data="currentPriceOther.JPY" method="parseSatsPerCurrency" :params="[CURRENCY_JPY, showSatsSymbol]"></BTClock>
        <BTClock :data="blockHeight" method="parseMarketCap" :params="[currentPriceOther.JPY, CURRENCY_JPY, false]"></BTClock>

        <BTClock :data="currentPriceOther.AUD" method="parsePriceData" :params="[CURRENCY_AUD, false, false, false]"></BTClock>
        <BTClock :data="currentPriceOther.AUD" method="parseSatsPerCurrency" :params="[CURRENCY_AUD, showSatsSymbol]"></BTClock>
        <BTClock :data="blockHeight" method="parseMarketCap" :params="[currentPriceOther.AUD, CURRENCY_AUD, false]"></BTClock>

        <BTClock :data="currentPriceOther.CAD" method="parsePriceData" :params="[CURRENCY_CAD, false, false, false]"></BTClock>
        <BTClock :data="currentPriceOther.CAD" method="parseSatsPerCurrency" :params="[CURRENCY_CAD, showSatsSymbol]"></BTClock>
        <BTClock :data="blockHeight" method="parseMarketCap" :params="[currentPriceOther.CAD, CURRENCY_CAD, false]"></BTClock>

    </div>
    <div class="preview-container">
        <BTClock :data="blockHeight" method="parseBlockHeight"></BTClock>
        <BTClock :data="feeRate" method="parseBlockFees"></BTClock>
        <BTClock :data="blockHeight" method="parseHalvingCountdown" :params="[true]"></BTClock>
        <BTClock :data="blockHeight" method="parseHalvingCountdown" :params="[false]"></BTClock>
        <BTClock :data="currentPrice" method="parseSatsPerCurrency" :params="['$', showSatsSymbol]"></BTClock>
        <BTClock :data="blockHeight" method="parseMarketCap" :params="[currentPrice, '$', false]"></BTClock>
        <BTClock :data="blockHeight" method="parseMarketCap" :params="[currentPrice, '$', true]"></BTClock>
        <BTClock :data="currentPrice" method="parsePriceData" :params="['$', true, false, true]"></BTClock>
        <BTClock :data="currentPrice" method="parsePriceData" :params="['$', true, false, false]"></BTClock>
        <BTClock :data="currentPrice" method="parsePriceData" :params="['$', false, false, false]"></BTClock>
        <BTClock :data="currentPrice" method="parsePriceData" :params="['$', true, true, false]"></BTClock>
        <BTClock :data="currentPrice" method="parsePriceData" :params="['$', true, true, true]"></BTClock>
    </div>





</template>