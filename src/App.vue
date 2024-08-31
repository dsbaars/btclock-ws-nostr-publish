<script setup>
import BTClock from './components/BTClock.vue'
import NostrTerminal from './components/NostrTerminal.vue'
import WebsocketTerminal from './components/WebsocketTerminal.vue'
import cj from 'color-json';

import { ref, onMounted } from 'vue'
import Toastify from "toastify-js";
import { tsParticles } from "@tsparticles/engine";
import { confetti } from "@tsparticles/confetti";
import { WsConnection } from "./ws_connection";
import "toastify-js/src/toastify.css"
import { CURRENCY_EUR, CURRENCY_GBP, CURRENCY_JPY, CURRENCY_AUD, CURRENCY_CAD, CURRENCY_USD } from './constants';

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
currentPriceOther.value={};
currentPrice.value = 60000;
const ignoreDataSource = ref();
const showOtherCurrencies = ref(false);

function connectWebSocket() {
    const websocketProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const websocketUrl = websocketProtocol + '//' + window.location.host + '/ws?prices=bitcoin&currency=usd';

    const socket = new WsConnection(websocketUrl);

    let lastMessages = [];
    let currentBlockHeight = 840000;
    // Event handler for WebSocket open

    let isOpen = false;

    socket.on('open', (event) => {
        isOpen = true;
        let timestamp = new Date().toLocaleString();
        wsTerminal.value.writeln(`\x1b[32m${timestamp}\x1b[36m WebSocket connection established`);

        console.log('WebSocket v1 connection established');
        document.getElementById('websocketConnection_indicator')?.classList.add('online');

    })

    socket.on('message', (eventData) => {
        const data = JSON.parse(eventData);
        storeAndDisplayData(data);
    })

    socket.on('close', (event) => {
        if (isOpen) {
            let timestamp = new Date().toLocaleString();
            wsTerminal.value.writeln(`\x1b[32m${timestamp}\x1b[36m WebSocket connection closed`);
            isOpen = false;
        }

        console.log('WebSocket connection closed');
        document.getElementById('websocketConnection')?.classList.remove('online');
    })

    socket.on('error', (event) => {
        console.error('WebSocket error:', event);
    })

    socket.open();

  

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
    const websocketProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const websocketUrl = websocketProtocol + '//' + window.location.host + '/api/v2/ws';

    const socket = new WsConnection(websocketUrl);

    let lastMessages = [];
    let currentBlockHeight = 840000;
    // Event handler for WebSocket open

    let isOpen = false;

    socket.on('open', (event) => {
        isOpen = true;
        let timestamp = new Date().toLocaleString();
        wsTerminal2.value.writeln(`\x1b[32m${timestamp}\x1b[36m WebSocket connection established`);

        console.log('WebSocket v2 connection established');
        document.getElementById('websocketConection2_indicator')?.classList.add('online');
        socket.send(JSON.stringify({ "type": "subscribe", "eventType":  "price"}));
        socket.send(JSON.stringify({ "type": "subscribe", "eventType":  "blockheight"}));
        socket.send(JSON.stringify({ "type": "subscribe", "eventType":  "blockfee"}));

    })

    socket.on('message', (eventData) => {
        const data = JSON.parse(eventData);
        storeAndDisplayData2(data);
    })

    socket.on('close', (event) => {
        if (isOpen) {
            let timestamp = new Date().toLocaleString();
            wsTerminal2.value.writeln(`\x1b[32m${timestamp}\x1b[36m WebSocket connection closed`);
            isOpen = false;
        }

        console.log('WebSocket connection closed');
        document.getElementById('websocketConnection')?.classList.remove('online');
    })

    socket.on('error', (event) => {
        console.error('WebSocket error:', event);
    })

    socket.open();

    function storeAndDisplayData2(data) {
        const timestamp = new Date().toLocaleString();
        const message = { timestamp, data: JSON.stringify(data) };

        wsTerminal2.value.writeln(`\x1b[32m${timestamp}\x1b[0m ${cj(message.data, undefined, customColorMap, 0)}`);
        console.log(data.price);

        if (data.price) {
            currentPriceOther.value = data.price;
        }
    }


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
                <div class="form-check-row">
                    <input type="checkbox" v-model="ignoreDataSource" id="ignore-external-data" /> &nbsp;
                    <label for="ignore-external-data" class="form-check-label">Ignore data source</label>
                </div>
                <div class="form-check-row">
                    <input type="checkbox" v-model="showOtherCurrencies" id="show-other-currencies" /> &nbsp;
                    <label for="show-other-currencies" class="form-check-label">Show other currencies</label>
                </div>
            </div>
           
        </fieldset>
    </form>
    <div class="preview-container">
        <BTClock :data="blockHeight" method="parseBlockHeight"></BTClock>
        <BTClock :data="feeRate" method="parseBlockFees"></BTClock>
        <BTClock :data="blockHeight" method="parseHalvingCountdown" :params="[true]"></BTClock>
        <BTClock :data="blockHeight" method="parseHalvingCountdown" :params="[false]"></BTClock>
        <BTClock :data="blockHeight" method="parseMarketCap" :params="[currentPrice, '$', false]"></BTClock>
        <BTClock :data="blockHeight" method="parseMarketCap" :params="[currentPrice, '$', true]"></BTClock>
        <BTClock :data="currentPrice" method="parsePriceData" :params="['$', true]"></BTClock>
        <BTClock :data="currentPrice" method="parsePriceData" :params="['$', false]"></BTClock>


        <BTClock :data="currentPrice" method="parseSatsPerCurrency" :params="['$', false]"></BTClock>
    </div>
    <div class="preview-container" v-if="showOtherCurrencies">
        <BTClock :data="currentPriceOther.EUR" method="parsePriceData" :params="[CURRENCY_EUR, false]"></BTClock>
        <BTClock :data="currentPriceOther.EUR" method="parseSatsPerCurrency" :params="[CURRENCY_EUR, false]"></BTClock>

        <BTClock :data="currentPriceOther.GBP" method="parsePriceData" :params="[CURRENCY_GBP, false]"></BTClock>
        <BTClock :data="currentPriceOther.GBP" method="parseSatsPerCurrency" :params="[CURRENCY_GBP, false]"></BTClock>

        <BTClock :data="currentPriceOther.JPY" method="parsePriceData" :params="[CURRENCY_JPY, false]"></BTClock>
        <BTClock :data="currentPriceOther.JPY" method="parseSatsPerCurrency" :params="[CURRENCY_JPY, false]"></BTClock>

        <BTClock :data="currentPriceOther.AUD" method="parsePriceData" :params="[CURRENCY_AUD, false]"></BTClock>
        <BTClock :data="currentPriceOther.AUD" method="parseSatsPerCurrency" :params="[CURRENCY_AUD, false]"></BTClock>

        <BTClock :data="currentPriceOther.CAD" method="parsePriceData" :params="[CURRENCY_CAD, false]"></BTClock>
        <BTClock :data="currentPriceOther.CAD" method="parseSatsPerCurrency" :params="[CURRENCY_CAD, false]"></BTClock>

    </div>
    <div class="container-fluid">
        <div class="row">
            <div id="terminalContainer" class="termContainer">
                <WebsocketTerminal componentId="websocketConnection" version="v1" ref="wsTerminal"></WebsocketTerminal>
            </div>
            <div id="terminal2Container" class="termContainer">
                <WebsocketTerminal componentId="websocketConection2" version="v2" ref="wsTerminal2"></WebsocketTerminal>
            </div>
            <div id="nostrContainer" class="termContainer">
                <NostrTerminal></NostrTerminal>
            </div>
        </div>

    </div>



</template>