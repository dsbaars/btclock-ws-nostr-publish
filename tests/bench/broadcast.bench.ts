/**
 * In-process broadcast benchmarks for the Node Ws1/Ws2 publishers.
 *
 * Each benchmark:
 *  1. builds a publisher
 *  2. attaches N FakeSocket clients (subscribed to the event under test)
 *  3. emits one broadcast event per iteration
 *  4. records per-event wall-clock
 *
 * Run with:
 *   pnpm exec vitest bench tests/bench/broadcast.bench.ts
 */
import { bench, describe, beforeEach } from 'vitest'
import EventEmitter from 'node:events'
import { Encoder } from '@msgpack/msgpack'
import { Ws1Publisher } from '../../server/publisher/ws1'
import { Ws2Publisher } from '../../server/publisher/ws2'
import { DataStorage } from '../../server/storage'
import { FakeSocket } from '../helpers/fake-socket'

const encoder = new Encoder()

function seedStorage() {
    DataStorage.lastPrice = new Map<string, string>()
    DataStorage.lastPrice.set('USD', '79000')
    DataStorage.lastPrice.set('EUR', '67000')
    DataStorage.lastBlock = 946211
    DataStorage.lastMedianFee = 12.5
}

const CLIENT_COUNTS = [100, 1000, 5000] as const

describe('Ws2 — broadcast price update to N subscribers', () => {
    for (const N of CLIENT_COUNTS) {
        let emitter: EventEmitter
        let pub: Ws2Publisher

        beforeEach(() => {
            seedStorage()
            emitter = new EventEmitter()
            pub = new Ws2Publisher(emitter)
            // Wire N clients, each subscribed to price:USD.
            for (let i = 0; i < N; i++) {
                const sock = new FakeSocket() as unknown as import('ws').WebSocket
                pub.newClient(sock)
                sock.emit(
                    'message',
                    encoder.encode({ type: 'subscribe', eventType: 'price', currency: 'USD' })
                )
            }
        })

        bench(`Ws2 price broadcast @ N=${N}`, () => {
            emitter.emit('newPrice', { pair: 'USD', price: '79001' })
        })
    }
})

describe('Ws1 — broadcast price update to N subscribers (USD only)', () => {
    for (const N of CLIENT_COUNTS) {
        let emitter: EventEmitter
        let pub: Ws1Publisher

        beforeEach(() => {
            seedStorage()
            emitter = new EventEmitter()
            pub = new Ws1Publisher(emitter)
            for (let i = 0; i < N; i++) {
                const sock = new FakeSocket() as unknown as import('ws').WebSocket
                pub.newClient(sock)
            }
        })

        bench(`Ws1 price broadcast @ N=${N}`, () => {
            emitter.emit('newPrice', { pair: 'USD', price: '79001' })
        })
    }
})

describe('Ws2 — broadcast new block to N subscribers', () => {
    for (const N of CLIENT_COUNTS) {
        let emitter: EventEmitter
        let pub: Ws2Publisher

        beforeEach(() => {
            seedStorage()
            emitter = new EventEmitter()
            pub = new Ws2Publisher(emitter)
            for (let i = 0; i < N; i++) {
                const sock = new FakeSocket() as unknown as import('ws').WebSocket
                pub.newClient(sock)
                sock.emit('message', encoder.encode({ type: 'subscribe', eventType: 'blockheight' }))
            }
        })

        bench(`Ws2 block broadcast @ N=${N}`, () => {
            DataStorage.lastBlock += 1
            emitter.emit('newBlock')
        })
    }
})
