<script setup lang="ts">
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue'
import { SimplePool, nip19 } from 'nostr-tools'
import { colorizeJson } from '../terminal-log'

/** Must match server/publisher/nostr.ts BTCLOCK_EVENT_KIND. */
const BTCLOCK_EVENT_KIND = 30078

/** Injected at build time via vite-plugin-environment; see vite.config.ts. */
const relays = (process.env.NOSTR_RELAYS ?? 'wss://relay.primal.net')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
const pool = new SimplePool()
const termEl = useTemplateRef<HTMLDivElement>('termEl')

const term = new Terminal({
    disableStdin: true,
    scrollback: 100,
    rows: 14,
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

    const npub = nip19.npubEncode(pubkey)
    term.writeln(` < relays  \x1b[36m${relays.join(', ')}\x1b[0m`)
    term.writeln(` < kind    \x1b[36m${BTCLOCK_EVENT_KIND}\x1b[0m  (parameterized-replaceable, NIP-78)`)
    term.writeln(` < author  \x1b[33m${npub}\x1b[0m`)
    term.writeln(` < hex     \x1b[90m${pubkey}\x1b[0m`)
    term.writeln(` < waiting for first event\u2026`)

    let firstEventShown = false

    sub = pool.subscribeMany(
        relays,
        [{ kinds: [BTCLOCK_EVENT_KIND], authors: [pubkey] }],
        {
            onevent(event) {
                const dTag = event.tags.find((v) => v[0] === 'd')?.[1]
                if (!dTag) return
                if (Date.now() - event.created_at * 1000 > FIVE_MINUTES_MS) return

                if (!firstEventShown) {
                    firstEventShown = true
                    term.writeln(' < \x1b[32msubscription live\x1b[0m')
                }

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
                if (!firstEventShown) {
                    term.writeln(' < end of stored events, listening for live updates\u2026')
                }
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
