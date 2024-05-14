<script setup>
import { Terminal } from '@xterm/xterm';
import { onMounted } from 'vue'
import { SimplePool, nip19 } from "nostr-tools";
import { FitAddon } from '@xterm/addon-fit';
import cj from 'color-json';

const pool = new SimplePool()
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

let relays = ['wss://nostr1.daedaluslabs.io', 'wss://nostr2.daedaluslabs.io', 'wss://nostr3.daedaluslabs.io', 'wss://nostr.dbtc.link'];
let nostrTerm = new Terminal({
    disableStdin: true,
    scrollback: 10,
    rows: 10,
    cols: 200,
    fontFamily: '"Ubuntu Mono", courier-new, courier, monospace, "Powerline Extra Symbols"'
});

const fitAddon = new FitAddon();
nostrTerm.loadAddon(fitAddon);

const sub = pool.subscribeMany(relays, [
    {
        kinds: [1],
        authors: [process.env.NOSTR_PUB],
    },
], {
    onevent(event) {
        const msgType = event.tags.find((v) => { return v[0] === 'type'; })[1];

        if (msgType === "priceUsd" && new Date(event.created_at * 1000) < new Date(Date.now() - 5000 * 60)) {
            return;
        } else if (new Date(event.created_at * 1000) < new Date(Date.now() - 5000 * 60)) {
            return;
        }

        const eventData = `{ "type": "${msgType}", "content": ${event.content}}`;
        nostrTerm.writeln(` > \x1b[32m${new Date(event.created_at * 1000).toLocaleString()}\x1b[0m ${cj(eventData, undefined, customColorMap, 0)}`);
    },
    oneose() {
        console.log('EOSE');
    }
})


let npub = nip19.npubEncode(process.env.NOSTR_PUB)
nostrTerm.writeln(` < Listening to \x1b[33m${npub}\x1b[0m`);

onMounted(() => {
    nostrTerm.open(document.getElementById('nostrTerminal'));
    fitAddon.fit();
});
</script>

<template>
    <h3>Nostr Data</h3>
    <div id="nostrTerminal" class="terminal"></div>
</template>