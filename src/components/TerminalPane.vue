<script setup lang="ts">
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import type { WsConnection } from '../ws_connection'

const props = defineProps<{
    title: string
    socket?: WsConnection
}>()

const online = ref(false)
const termEl = useTemplateRef<HTMLDivElement>('termEl')

const term = new Terminal({
    disableStdin: true,
    scrollback: 10,
    rows: 10,
    fontFamily: '"Ubuntu Mono", courier-new, courier, monospace, "Powerline Extra Symbols"',
})
const fit = new FitAddon()
term.loadAddon(fit)

function ts() {
    return new Date().toLocaleTimeString()
}

function writeln(data: string) {
    term.writeln(data)
}

function bindSocket(sock: WsConnection) {
    sock.on('open', () => {
        online.value = true
        writeln(`\x1b[32m${ts()}\x1b[36m WebSocket connection established`)
    })
    sock.on('close', () => {
        if (online.value) {
            writeln(`\x1b[32m${ts()}\x1b[36m WebSocket connection closed`)
            online.value = false
        }
    })
    sock.on('error', (e) => console.error('WebSocket error:', e))
}

onMounted(() => {
    if (termEl.value) {
        term.open(termEl.value)
        fit.fit()
    }
    if (props.socket) bindSocket(props.socket)
})

onBeforeUnmount(() => term.dispose())

defineExpose({ writeln })
</script>

<template>
    <section class="w-full lg:basis-1/3 lg:max-w-[33.333%] px-2">
        <h5 class="flex items-center gap-2 font-semibold">
            <span class="online-indicator" :class="{ online }">
                <span class="blink"></span>
            </span>
            <span>{{ title }}</span>
        </h5>
        <div ref="termEl" class="terminal"></div>
    </section>
</template>
