import WebSocket from 'ws'
import { DataStorage } from '../storage'
import EventEmitter from 'node:events'
import { PriceUpdate } from '../price-sources/ws-price-source'
import { metrics } from '../metrics'

/** WebSocket backpressure ceiling: close sockets whose send buffer exceeds this. */
const BACKPRESSURE_LIMIT = 1_000_000

/**
 * Gated text send. Returns true if queued, false if dropped because the
 * socket is closed or over the backpressure limit.
 */
function safeSendText(client: WebSocket, frame: string): boolean {
    // FakeSocket has no readyState — treat undefined as OPEN to stay test-friendly.
    const rs = (client as WebSocket).readyState
    if (rs !== undefined && rs !== WebSocket.OPEN) return false
    const buffered = (client as WebSocket).bufferedAmount ?? 0
    if (buffered >= BACKPRESSURE_LIMIT) {
        const tagged = client as WebSocket & { __btclockBackpressureClosed?: boolean }
        if (!tagged.__btclockBackpressureClosed) {
            tagged.__btclockBackpressureClosed = true
            metrics.onBackpressureDrop('v1')
            try {
                client.close(1013, 'backpressure')
            } catch {
                // best-effort close; ignore
            }
        }
        return false
    }
    client.send(frame)
    return true
}

export class Ws1Publisher {
    protected clients: Set<WebSocket> = new Set()
    protected lastRoundFee: number

    constructor(emitter: EventEmitter) {
        this.clients = new Set()

        emitter.on('newPrice', (update: PriceUpdate) => {
            if (update.pair != 'USD') return
            this.onNewPrice()
        })
        emitter.on('newFee', () => {
            this.onNewFee()
        })
        emitter.on('newBlock', () => {
            this.onNewBlock()
        })
        this.lastRoundFee = 0
    }

    /** Test/metrics introspection. */
    stats() {
        return { clients: this.clients.size }
    }

    newClient(socket: WebSocket) {
        this.clients.add(socket)

        safeSendText(socket, JSON.stringify({ bitcoin: DataStorage.lastPrice.get('USD') }))
        safeSendText(socket, JSON.stringify({ block: { height: DataStorage.lastBlock } }))
        safeSendText(
            socket,
            JSON.stringify({
                'mempool-blocks': [{ medianFee: Math.round(DataStorage.lastMedianFee) }],
            })
        )

        socket.on('close', () => {
            this.clients.delete(socket)
        })
    }

    onNewPrice() {
        if (!this.clients.size) return
        // §3.6 — stringify once, reuse across fan-out.
        const output = JSON.stringify({ bitcoin: DataStorage.lastPrice.get('USD') })
        const bytes = Buffer.byteLength(output)
        const start = process.hrtime.bigint()

        let sent = 0
        for (const client of this.clients) {
            if (safeSendText(client, output)) sent++
        }

        metrics.onFanout('v1', 'price', sent, bytes, Number(process.hrtime.bigint() - start) / 1e9)
    }

    onNewBlock() {
        if (!this.clients.size) return
        const output = JSON.stringify({ block: { height: DataStorage.lastBlock } })
        const bytes = Buffer.byteLength(output)
        const start = process.hrtime.bigint()

        let sent = 0
        for (const client of this.clients) {
            if (safeSendText(client, output)) sent++
        }

        metrics.onFanout(
            'v1',
            'blockheight',
            sent,
            bytes,
            Number(process.hrtime.bigint() - start) / 1e9
        )
    }

    onNewFee() {
        if (this.lastRoundFee == Math.round(DataStorage.lastMedianFee)) {
            return
        }
        if (!this.clients.size) {
            this.lastRoundFee = Math.round(DataStorage.lastMedianFee)
            return
        }

        const output = JSON.stringify({
            'mempool-blocks': [{ medianFee: Math.round(DataStorage.lastMedianFee) }],
        })
        const bytes = Buffer.byteLength(output)
        const start = process.hrtime.bigint()

        let sent = 0
        for (const client of this.clients) {
            if (safeSendText(client, output)) sent++
        }

        metrics.onFanout(
            'v1',
            'blockfee',
            sent,
            bytes,
            Number(process.hrtime.bigint() - start) / 1e9
        )

        this.lastRoundFee = Math.round(DataStorage.lastMedianFee)
    }
}
