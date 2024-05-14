import Toastify from "toastify-js";
import { tsParticles } from "@tsparticles/engine";
import { confetti } from "@tsparticles/confetti";
import { Terminal } from '@xterm/xterm';
import './app.scss';
import "toastify-js/src/toastify.css"
import { Relay } from 'nostr-tools/relay'
import { SimplePool, nip19 } from "nostr-tools";
import { WsConnection } from "./ws_connection";

// const relay = await Relay.connect('wss://nostr1.daedaluslabs.io')
// console.log(`connected to ${relay.url}`)

const pool = new SimplePool()

let relays = ['wss://nostr1.daedaluslabs.io', 'wss://nostr2.daedaluslabs.io', 'wss://nostr3.daedaluslabs.io', 'wss://nostr.dbtc.link'];


var nostrTerm = new Terminal({
    disableStdin: true,
    scrollback: 10,
    rows: 10,
    cols: 200,
});
nostrTerm.open(document.getElementById('nostrTerminal'));

const sub = pool.subscribeMany(relays, [
    {
        kinds: [1],
        authors: [process.env.NOSTR_PUB],
    },
  ], {
    onevent(event) {
      const msgType = event.tags.find((v) => { return v[0] === 'type'; })[1];

      //console.log('we got the event we wanted:', event)
      if (msgType === "priceUsd" && new Date(event.created_at * 1000) < new Date(Date.now() - 5000 * 60)) {
        return;
      } else if (new Date(event.created_at * 1000) < new Date(Date.now() - 5000 * 60)) {
        return;
      }

      nostrTerm.writeln(` > \x1b[32m${new Date(event.created_at * 1000).toLocaleString()}\x1b[0m { type: ${msgType}, content: ${event.content}}`);

    },
    oneose() {
        console.log('EOSE');
     // sub.close()
    }
  })


let npub = nip19.npubEncode(process.env.NOSTR_PUB)
nostrTerm.writeln(` < Listening to \x1b[33m${npub}\x1b[0m`);

console.log(npub);

tsParticles.load({
    id: "tsparticles"
});

window.formOnChange = (event) => {
    console.log(event);
}

const isSplitText = (str) => {
    return str.includes('/');
};



Array.from(document.getElementsByClassName('btclock')).forEach(element => {

    for (let char of [..."LOADING"]) {
        let l = document.createElement('div');
        l.classList.add('digit');
        l.innerHTML = char;
        element.append(l);
    }
});

// Function to create WebSocket connection
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
        term.writeln(`\x1b[32m${timestamp}\x1b[36m WebSocket connection established`);

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
            term.writeln(`\x1b[32m${timestamp}\x1b[36m WebSocket connection closed`);
            isOpen = false;
        }

        console.log('WebSocket connection closed');
        document.getElementById('websocketConnection')?.classList.remove('online');
    })

    socket.on('error', (event) => {
        console.error('WebSocket error:', event);
    })

    socket.open();


//     setInterval(() => {
// //        console.log("Readystate", socket.readyState);
//         if (socket.readyState == socket.CLOSED) {
//             connectWebSocket();
//         }
//     }, 1000);


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