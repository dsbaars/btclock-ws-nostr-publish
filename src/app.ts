import Toastify from "toastify-js";
import { tsParticles } from "@tsparticles/engine";
import { confetti } from "@tsparticles/confetti";
import { Terminal } from '@xterm/xterm';
import './app.scss';
import "toastify-js/src/toastify.css"

tsParticles.load({
    id: "tsparticles"
});

const isSplitText = (str) => {
    return str.includes('/');
};

// Function to create WebSocket connection
function connectWebSocket() {
    const websocketProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const websocketUrl = websocketProtocol + '//' + window.location.host + '/ws?prices=bitcoin&currency=usd';
    const socket = new WebSocket(websocketUrl);

    let lastMessages = [];
    let currentBlockHeight = 840000;
    // Event handler for WebSocket open
    socket.onopen = function (event) {
        console.log('WebSocket connection established');
    };

    // Event handler for receiving messages
    socket.onmessage = function (event) {
        const data = JSON.parse(event.data);
        storeAndDisplayData(data);
    };

    // Event handler for WebSocket close
    socket.onclose = function (event) {
        console.log('WebSocket connection closed');
    };

    // Event handler for WebSocket errors
    socket.onerror = function (error) {
        console.error('WebSocket error:', error);
    };

    function populateContainer(v, container) {
        let el = document.createElement('div');
        if (isSplitText(v)) {
            el.classList.add('splitText');

            v.split('/').forEach((part) => {
                let div = el.appendChild(document.createElement('div'));
                div.classList.add('flex-items');
                div.innerHTML = part;
            })

        } else if (v === " ") {
            el.classList.add('digit');
            el.innerHTML = "&nbsp;"
        } else if (v.length >= 3) {
            el.classList.add('mediumText');
            el.innerHTML = v;
        } else {
            el.classList.add('digit');
            el.innerHTML = v;
        }
        container.append(el);
    }

    var term = new Terminal({
        disableStdin: true,
        scrollback: 10,
        rows: 10,
        cols: 200,
    });
    term.open(document.getElementById('terminal'));

    function storeAndDisplayData(data) {

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


            let blockHeight = Module.parseBlockHeight(data.block.height);
            let halvingCountdown = Module.parseHalvingCountdown(data.block.height, true);


            let container = document.getElementById('blockHeight');

            container.innerHTML = '';
            blockHeight.forEach((v) => {
                populateContainer(v, container);
            });

            let halvingCountdownContainer = document.getElementById('halvingCountdown');

            halvingCountdownContainer.innerHTML = '';
            halvingCountdown.forEach((v) => {
                populateContainer(v, halvingCountdownContainer);
            });
            let halvingCountdown2 = Module.parseHalvingCountdown(data.block.height, false);

            let halvingCountdown2Container = document.getElementById('halvingCountdown2');

            halvingCountdown2Container.innerHTML = '';
            halvingCountdown2.forEach((v) => {
                populateContainer(v, halvingCountdown2Container);
            });
        } else if (data['bitcoin']) {
            let currentPrice = Module.parsePriceData(data.bitcoin, '$', false);
            let currentPrice2 = Module.parsePriceData(data.bitcoin, '$', true);

            let satsPerCurrency = Module.parseSatsPerCurrency(data.bitcoin, '$', false);
            let marketCap = Module.parseMarketCap(currentBlockHeight, data.bitcoin, '$', false);
            let marketCap2 = Module.parseMarketCap(currentBlockHeight, data.bitcoin, '$', true);

            let priceContainer = document.getElementById('currentPrice');
            let priceContainer2 = document.getElementById('currentPrice2');

            priceContainer.innerHTML = '';
            currentPrice.forEach((v) => {
                populateContainer(v, priceContainer);

            });

            priceContainer2.innerHTML = '';
            currentPrice2.forEach((v) => {
                populateContainer(v, priceContainer2);

            });


            let moscowContainer = document.getElementById('moscowTime');

            moscowContainer.innerHTML = '';
            satsPerCurrency.forEach((v) => {
                populateContainer(v, moscowContainer);

            });

            let mcapContainer = document.getElementById('marketCap');

            mcapContainer.innerHTML = '';
            marketCap.forEach((v) => {
                populateContainer(v, mcapContainer);

            });

            let mcapContainer2 = document.getElementById('marketCap2');

            mcapContainer2.innerHTML = '';
            marketCap2.forEach((v) => {
                populateContainer(v, mcapContainer2);

            });
        } else if (data["mempool-blocks"]) {
            let feeRate = Module.parseBlockFees(data["mempool-blocks"][0].medianFee);
            let container = document.getElementById('feeRate');

            container.innerHTML = '';
            feeRate.forEach((v) => {
                populateContainer(v, container);

            });
        }

        const timestamp = new Date().toLocaleString();
        const message = { timestamp, data: JSON.stringify(data) };
        lastMessages.unshift(message); // Add message to the beginning of the array

        if (lastMessages.length > 10) {
            lastMessages.pop(); // Remove oldest message if more than 10 messages
        }

        term.writeln(`\x1b[32m${timestamp}\x1b[0m ${message.data}`);
    }
}


// Connect to WebSocket when the page loads
window.onload = function () {
    connectWebSocket();
};