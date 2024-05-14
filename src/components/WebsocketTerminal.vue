<script setup>
import { Terminal } from '@xterm/xterm';
import { onMounted } from 'vue'
import { FitAddon } from '@xterm/addon-fit';

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
    term.open(document.getElementById('terminal'));
    fitAddon.fit();
});

defineExpose({
    writeln
})
</script>

<template>
    <h3>&nbsp;<div class="online-indicator" id="websocketConnection">
            <span class="blink"></span>
        </div> Websocket Data</h3>
    <div id="terminal" class="terminal"></div>
</template>