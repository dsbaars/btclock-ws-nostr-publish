import WebSocket from 'ws'
import { DataStorage } from '../storage'
import EventEmitter from 'node:events'
import { Encoder, Decoder } from '@msgpack/msgpack'
import { PriceUpdate } from '../price-sources/ws-price-source'
import { v2Message, V2Message } from './ws2-schema'
import { metrics } from '../metrics'

const encoder = new Encoder()
const decoder = new Decoder()

/** WebSocket backpressure ceiling: close sockets whose send buffer exceeds this. */
const BACKPRESSURE_LIMIT = 1_000_000

/**
 * Gated send. Returns true if the frame was queued to the socket, false if we
 * dropped it because the socket is either not open, over the backpressure
 * limit, or we've already marked it for termination.
 */
function safeSend(client: WebSocket, frame: Uint8Array, proto: 'v1' | 'v2'): boolean {
    // FakeSocket has no readyState — treat undefined as OPEN to stay test-friendly.
    const rs = (client as WebSocket).readyState
    if (rs !== undefined && rs !== WebSocket.OPEN) return false
    // FakeSocket has no bufferedAmount — treat undefined as 0.
    const buffered = (client as WebSocket).bufferedAmount ?? 0
    if (buffered >= BACKPRESSURE_LIMIT) {
        const tagged = client as WebSocket & { __btclockBackpressureClosed?: boolean }
        if (!tagged.__btclockBackpressureClosed) {
            tagged.__btclockBackpressureClosed = true
            metrics.onBackpressureDrop(proto)
            try {
                client.close(1013, 'backpressure')
            } catch {
                // best-effort close; ignore
            }
        }
        return false
    }
    client.send(frame, { binary: true })
    return true
}

type ClientState = {
    eventTypes: Set<string>
    currencies: Set<string>
}

export class Ws2Publisher {
    private clients: Map<WebSocket, ClientState> = new Map()
    private currenciesClientMap: Map<string, Set<WebSocket>> = new Map()
    /** Indexed subscriber sets — O(K) fan-out instead of O(N). */
    private blockheightClients: Set<WebSocket> = new Set()
    private blockfeeClients: Set<WebSocket> = new Set()
    private blockfee2Clients: Set<WebSocket> = new Set()
    protected lastRoundFee: number

    constructor(emitter: EventEmitter) {
        emitter.on('newPrice', (update) => {
            this.onNewPrice(update)
        })
        emitter.on('newFee', () => {
            this.onNewFee()
        })
        emitter.on('newBlock', () => {
            this.onNewBlock()
        })

        for (const c of ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD']) {
            this.currenciesClientMap.set(c, new Set<WebSocket>())
        }

        this.lastRoundFee = 0
    }

    /** Test/metrics introspection — size of each indexed subscriber set. */
    stats() {
        return {
            clients: this.clients.size,
            blockheight: this.blockheightClients.size,
            blockfee: this.blockfeeClients.size,
            blockfee2: this.blockfee2Clients.size,
            currencies: Object.fromEntries(
                Array.from(this.currenciesClientMap.entries()).map(([k, v]) => [k, v.size])
            ),
        }
    }

    newClient(socket: WebSocket) {
        this.clients.set(socket, { eventTypes: new Set(), currencies: new Set() })
        // Welcome is tiny; encode once here.
        safeSend(socket, encoder.encode({ msg: 'Welcome' }), 'v2')

        socket.on('message', (msg) => {
            let decoded: unknown
            try {
                decoded = decoder.decode(msg as Uint8Array | ArrayBuffer)
            } catch {
                safeSend(socket, encoder.encode({ error: 'invalid message' }), 'v2')
                return
            }

            const parsed = v2Message.safeParse(decoded)
            if (!parsed.success) {
                safeSend(socket, encoder.encode({ error: 'invalid message' }), 'v2')
                return
            }

            this.handleMessage(socket, parsed.data)
        })

        socket.on('close', () => {
            const state = this.clients.get(socket)
            if (!state) return

            // Only iterate currencies the client actually subscribed to (§2.4).
            for (const currency of state.currencies) {
                this.currenciesClientMap.get(currency)?.delete(socket)
            }

            // Drop from indexed event-type sets — cheap even if not present.
            this.blockheightClients.delete(socket)
            this.blockfeeClients.delete(socket)
            this.blockfee2Clients.delete(socket)

            this.clients.delete(socket)
        })
    }

    private handleMessage(socket: WebSocket, message: V2Message) {
        if (message.type === 'subscribe') {
            this.subscribe(socket, message.eventType)
            switch (message.eventType) {
                case 'price':
                    if ('currency' in message && message.currency) {
                        this.subscribeCurrency(socket, message.currency)
                    } else if ('currencies' in message && message.currencies) {
                        for (const c of message.currencies) {
                            this.subscribeCurrency(socket, c)
                        }
                    }
                    break
                case 'blockfee':
                    this.blockfeeClients.add(socket)
                    safeSend(
                        socket,
                        encoder.encode({ blockfee: Math.round(DataStorage.lastMedianFee) }),
                        'v2'
                    )
                    break
                case 'blockfee2':
                    this.blockfee2Clients.add(socket)
                    safeSend(socket, encoder.encode({ blockfee2: DataStorage.lastMedianFee }), 'v2')
                    break
                case 'blockheight':
                    this.blockheightClients.add(socket)
                    safeSend(socket, encoder.encode({ blockheight: DataStorage.lastBlock }), 'v2')
                    break
            }
        } else {
            // unsubscribe
            this.unsubscribe(socket, message.eventType)
            switch (message.eventType) {
                case 'price':
                    if ('currency' in message && message.currency) {
                        this.unsubscribeCurrency(socket, message.currency)
                    } else if ('currencies' in message && message.currencies) {
                        for (const c of message.currencies) {
                            this.unsubscribeCurrency(socket, c)
                        }
                    }
                    break
                case 'blockfee':
                    this.blockfeeClients.delete(socket)
                    break
                case 'blockfee2':
                    this.blockfee2Clients.delete(socket)
                    break
                case 'blockheight':
                    this.blockheightClients.delete(socket)
                    break
            }
        }
    }

    subscribe(client: WebSocket, eventType: string) {
        const state = this.clients.get(client)
        if (state) {
            state.eventTypes.add(eventType)
        }
    }

    subscribeCurrency(client: WebSocket, currency: string) {
        if (!this.currenciesClientMap.has(currency)) {
            if (DataStorage.lastPrice.get(currency) != null) {
                this.currenciesClientMap.set(currency, new Set<WebSocket>())
            } else {
                safeSend(client, encoder.encode({ error: `${currency} does not exist.` }), 'v2')
                return
            }
        }

        this.currenciesClientMap.get(currency)?.add(client)
        this.clients.get(client)?.currencies.add(currency)
        safeSend(client, encoder.encode({ msg: `Subscribed to ${currency}` }), 'v2')
        safeSend(
            client,
            encoder.encode({ price: { [currency]: DataStorage.lastPrice.get(currency)! } }),
            'v2'
        )
    }

    unsubscribeCurrency(client: WebSocket, currency: string) {
        this.currenciesClientMap.get(currency)?.delete(client)
        this.clients.get(client)?.currencies.delete(currency)
        safeSend(client, encoder.encode({ msg: `Unsubscribed to ${currency}` }), 'v2')
    }

    unsubscribe(client: WebSocket, eventType: string) {
        const state = this.clients.get(client)
        if (state) {
            state.eventTypes.delete(eventType)
        }
    }

    onNewPrice(update: PriceUpdate) {
        const clients = this.currenciesClientMap.get(update.pair)
        if (!clients?.size) return

        // §2.1 — encode once, fan out many.
        const frame = encoder.encode({ price: { [update.pair]: update.price } })
        const bytes = frame.byteLength
        const start = process.hrtime.bigint()

        let sent = 0
        for (const client of clients) {
            if (safeSend(client, frame, 'v2')) sent++
        }

        metrics.onFanout('v2', 'price', sent, bytes, Number(process.hrtime.bigint() - start) / 1e9)
    }

    onNewBlock() {
        if (!this.blockheightClients.size) return

        // §2.1 — encode once, fan out many. §2.2 — walk indexed set only.
        const frame = encoder.encode({ blockheight: DataStorage.lastBlock })
        const bytes = frame.byteLength
        const start = process.hrtime.bigint()

        let sent = 0
        for (const client of this.blockheightClients) {
            if (safeSend(client, frame, 'v2')) sent++
        }

        metrics.onFanout(
            'v2',
            'blockheight',
            sent,
            bytes,
            Number(process.hrtime.bigint() - start) / 1e9
        )
    }

    onNewFee() {
        const rounded = Math.round(DataStorage.lastMedianFee)
        if (this.lastRoundFee !== rounded && this.blockfeeClients.size > 0) {
            const frame = encoder.encode({ blockfee: rounded })
            const bytes = frame.byteLength
            const start = process.hrtime.bigint()

            let sent = 0
            for (const client of this.blockfeeClients) {
                if (safeSend(client, frame, 'v2')) sent++
            }

            metrics.onFanout(
                'v2',
                'blockfee',
                sent,
                bytes,
                Number(process.hrtime.bigint() - start) / 1e9
            )
        }
        if (this.lastRoundFee !== rounded) this.lastRoundFee = rounded

        if (this.blockfee2Clients.size > 0) {
            const frame = encoder.encode({
                blockfee2: Math.round(DataStorage.lastMedianFee * 100) / 100,
            })
            const bytes = frame.byteLength
            const start = process.hrtime.bigint()

            let sent = 0
            for (const client of this.blockfee2Clients) {
                if (safeSend(client, frame, 'v2')) sent++
            }

            metrics.onFanout(
                'v2',
                'blockfee2',
                sent,
                bytes,
                Number(process.hrtime.bigint() - start) / 1e9
            )
        }
    }
}
