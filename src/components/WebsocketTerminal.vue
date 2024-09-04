<script setup>
import { Terminal } from '@xterm/xterm';
import { onMounted, ref } from 'vue'
import { FitAddon } from '@xterm/addon-fit';
import { WsConnection } from '../ws_connection';

const props = defineProps({
    componentId: "websocketConnection",
    version: "",
    socket: null,
})

const wsTerminal = ref(null);


let term = new Terminal({
    disableStdin: true,
    scrollback: 10,
    rows: 10,
    fontFamily: '"Ubuntu Mono", courier-new, courier, monospace, "Powerline Extra Symbols"',
});

const fitAddon = new FitAddon();
term.loadAddon(fitAddon);

const writeln = (data) => {
    term.writeln(data);
}


onMounted(() => {
    term.open(wsTerminal.value);
    fitAddon.fit();

});

defineExpose({
    writeln
})
</script>

<template>
    <h5>&nbsp;<div class="online-indicator" :id="componentId + '_indicator'">
            <span class="blink"></span>
        </div> Websocket Data {{ version }}</h5>
    <div ref="wsTerminal" class="terminal"></div>
</template>