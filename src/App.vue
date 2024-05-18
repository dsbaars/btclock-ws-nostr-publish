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

const wsTerminal = ref(null);
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
blockHeight.value = 843401;
const feeRate = ref();
feeRate.value = 15;
const currentPrice = ref();
currentPrice.value = 60000;
const ignoreDataSource = ref();

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

        console.log('WebSocket connection established');
        document.getElementById('websocketConnection')?.classList.add('online');
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

onMounted(() => {
    connectWebSocket();
})

</script>

<template class="pure-g">
    <h1>BTClock WebSocket Data Server</h1>
    <form class="pure-form pure-form-stacked" id="dataForm">

        <fieldset>
            <div class="pure-g pure-u-1-3">
                <div class="pure-u-1-3"> <label for="data-price">Price</label>
                    <input type="number" id="data-price" v-model="currentPrice" min="0" placeholder="Price" />
                </div>
                <div class="pure-u-1-3">
                    <label for="data-blockHeight">Block Height</label>
                    <input type="number" id="data-blockHeight" v-model="blockHeight" min="0"
                        placeholder="Block Height" />
                </div>
                <div class="pure-u-1-3">
                    <label for="data-feeRate">Fee Rate</label>
                    <input type="number" id="data-feeRate" v-model="feeRate" min="0" placeholder="Fee Rate" />
                </div>

            </div>
            <div>
                <label for="ignore-external-data" class="pure-checkbox small">
                    <input type="checkbox" v-model="ignoreDataSource" id="ignore-external-data" /> Ignore data source
                </label>
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
    <div class="pure-g">
        <div class="pure-u-1-2">
            <div id="terminalContainer" class="termContainer">
                <WebsocketTerminal ref="wsTerminal"></WebsocketTerminal>
            </div>
        </div>
        <div class="pure-u-1-2">
            <div id="nostrContainer" class="termContainer">
                <NostrTerminal></NostrTerminal>
            </div>
        </div>
    </div>



</template>