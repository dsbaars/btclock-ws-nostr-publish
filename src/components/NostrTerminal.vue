<script setup lang="ts">
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue'
import { SimplePool, nip19 } from 'nostr-tools'
import { colorizeJson } from '../terminal-log'

/** Must match server/publisher/nostr.ts BTCLOCK_EVENT_KIND. */
const BTCLOCK_EVENT_KIND = 30078

const relays = ['wss://nostr.dbtc.link']
const pool = new SimplePool()
const termEl = useTemplateRef<HTMLDivElement>('termEl')

const term = new Terminal({
    disableStdin: true,
    scrollback: 10,
    rows: 10,
    cols: 200,
    fontFamily: '"Ubuntu Mono", courier-new, courier, monospace, "Powerline Extra Symbols"',
})
const fit = new FitAddon()
term.loadAddon(fit)

const FIVE_MINUTES_MS = 5 * 60 * 1000
let sub: { close: () => void } | null = null

onMounted(() => {
    if (termEl.value) {
        term.open(termEl.value)
        fit.fit()
    }

    const pubkey = process.env.NOSTR_PUB
    if (!pubkey) {
        term.writeln(' < NOSTR_PUB not configured, Nostr feed disabled.')
        return
    }

    term.writeln(` < Listening to \x1b[33m${nip19.npubEncode(pubkey)}\x1b[0m`)

    sub = pool.subscribeMany(
        relays,
        [{ kinds: [BTCLOCK_EVENT_KIND], authors: [pubkey] }],
        {
            onevent(event) {
                const dTag = event.tags.find((v) => v[0] === 'd')?.[1]
                if (!dTag) return
                if (Date.now() - event.created_at * 1000 > FIVE_MINUTES_MS) return

                const payload: Record<string, unknown> = {
                    slot: dTag,
                    content: event.content,
                }
                if (dTag.startsWith('price:')) {
                    payload.block = event.tags.find((v) => v[0] === 'block')?.[1]
                    payload.fee = event.tags.find((v) => v[0] === 'medianFee')?.[1]
                }
                const ts = new Date(event.created_at * 1000).toLocaleTimeString()
                term.writeln(` > \x1b[32m${ts}\x1b[0m ${colorizeJson(payload)}`)
            },
            oneose() {
                console.log('EOSE')
            },
        }
    )
})

onBeforeUnmount(() => {
    sub?.close()
    term.dispose()
})
</script>

<template>
    <section class="w-full lg:basis-1/3 lg:max-w-[33.333%] px-2">
        <h5 class="font-semibold">Nostr Data</h5>
        <div ref="termEl" class="terminal"></div>
    </section>
</template>
