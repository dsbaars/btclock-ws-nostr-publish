import { beforeEach, describe, expect, it } from 'vitest'
import EventEmitter from 'node:events'
import { Encoder } from '@msgpack/msgpack'
import { Ws1Publisher } from '../../server/publisher/ws1'
import { Ws2Publisher } from '../../server/publisher/ws2'
import { DataStorage } from '../../server/storage'
import { FakeSocket, asWs } from '../helpers/fake-socket'

const encoder = new Encoder()

function resetStorage() {
    DataStorage.lastPrice = new Map<string, string>()
    DataStorage.lastPrice.set('USD', '50000')
    DataStorage.lastPrice.set('EUR', '45000')
    DataStorage.lastPrice.set('GBP', '38000')
    DataStorage.lastBlock = 800000
    DataStorage.lastMedianFee = 12.5
}

describe('§2.3 backpressure — ws2', () => {
    let emitter: EventEmitter
    let pub: Ws2Publisher

    beforeEach(() => {
        resetStorage()
        emitter = new EventEmitter()
        pub = new Ws2Publisher(emitter)
    })

    it('closes a slow client with code 1013 when bufferedAmount crosses 1MB', () => {
        const slow = new FakeSocket()
        pub.newClient(asWs(slow))
        slow.simulateMessage(encoder.encode({ type: 'subscribe', eventType: 'blockheight' }))
        slow.sent.length = 0

        // Push the socket over the backpressure ceiling, then emit.
        slow.bufferedAmount = 2_000_000
        DataStorage.lastBlock = 800001
        emitter.emit('newBlock')

        expect(slow.sent).toEqual([])
        expect(slow.closeFrame).toEqual({ code: 1013, reason: 'backpressure' })
    })

    it('does not double-close a socket that stays over the ceiling', () => {
        const slow = new FakeSocket()
        pub.newClient(asWs(slow))
        slow.simulateMessage(encoder.encode({ type: 'subscribe', eventType: 'blockheight' }))
        slow.bufferedAmount = 2_000_000

        let closes = 0
        slow.on('close', () => closes++)

        DataStorage.lastBlock = 800001
        emitter.emit('newBlock')
        DataStorage.lastBlock = 800002
        emitter.emit('newBlock')
        DataStorage.lastBlock = 800003
        emitter.emit('newBlock')

        expect(closes).toBe(1)
    })

    it('healthy clients keep receiving while a sibling is backpressured', () => {
        const healthy = new FakeSocket()
        const slow = new FakeSocket()
        pub.newClient(asWs(healthy))
        pub.newClient(asWs(slow))
        healthy.simulateMessage(encoder.encode({ type: 'subscribe', eventType: 'blockheight' }))
        slow.simulateMessage(encoder.encode({ type: 'subscribe', eventType: 'blockheight' }))
        healthy.sent.length = 0
        slow.sent.length = 0
        slow.bufferedAmount = 2_000_000

        DataStorage.lastBlock = 800001
        emitter.emit('newBlock')

        expect(healthy.sent).toHaveLength(1)
        expect(slow.sent).toEqual([])
    })
})

describe('§2.3 backpressure — ws1', () => {
    let emitter: EventEmitter
    let pub: Ws1Publisher

    beforeEach(() => {
        resetStorage()
        emitter = new EventEmitter()
        pub = new Ws1Publisher(emitter)
    })

    it('closes a slow client with code 1013 on block broadcast', () => {
        const slow = new FakeSocket()
        pub.newClient(asWs(slow))
        slow.sent.length = 0
        slow.bufferedAmount = 2_000_000

        DataStorage.lastBlock = 800001
        emitter.emit('newBlock')

        expect(slow.sent).toEqual([])
        expect(slow.closeFrame).toEqual({ code: 1013, reason: 'backpressure' })
    })
})

describe('§2.2 indexed subscriber sets — ws2', () => {
    let emitter: EventEmitter
    let pub: Ws2Publisher

    beforeEach(() => {
        resetStorage()
        emitter = new EventEmitter()
        pub = new Ws2Publisher(emitter)
    })

    it('subscribe + unsubscribe round-trip leaves all indexed sets empty', () => {
        const s = new FakeSocket()
        pub.newClient(asWs(s))

        s.simulateMessage(encoder.encode({ type: 'subscribe', eventType: 'blockheight' }))
        s.simulateMessage(encoder.encode({ type: 'subscribe', eventType: 'blockfee' }))
        s.simulateMessage(encoder.encode({ type: 'subscribe', eventType: 'blockfee2' }))
        s.simulateMessage(
            encoder.encode({ type: 'subscribe', eventType: 'price', currency: 'USD' })
        )

        let stats = pub.stats()
        expect(stats).toMatchObject({
            clients: 1,
            blockheight: 1,
            blockfee: 1,
            blockfee2: 1,
        })
        expect(stats.currencies.USD).toBe(1)

        s.simulateMessage(encoder.encode({ type: 'unsubscribe', eventType: 'blockheight' }))
        s.simulateMessage(encoder.encode({ type: 'unsubscribe', eventType: 'blockfee' }))
        s.simulateMessage(encoder.encode({ type: 'unsubscribe', eventType: 'blockfee2' }))
        s.simulateMessage(
            encoder.encode({ type: 'unsubscribe', eventType: 'price', currency: 'USD' })
        )

        stats = pub.stats()
        expect(stats).toMatchObject({
            clients: 1,
            blockheight: 0,
            blockfee: 0,
            blockfee2: 0,
        })
        expect(stats.currencies.USD).toBe(0)
    })

    it('close removes the client from every indexed set exactly once', () => {
        const a = new FakeSocket()
        const b = new FakeSocket()
        pub.newClient(asWs(a))
        pub.newClient(asWs(b))

        for (const eventType of ['blockheight', 'blockfee', 'blockfee2']) {
            a.simulateMessage(encoder.encode({ type: 'subscribe', eventType }))
            b.simulateMessage(encoder.encode({ type: 'subscribe', eventType }))
        }
        a.simulateMessage(
            encoder.encode({ type: 'subscribe', eventType: 'price', currencies: ['USD', 'EUR'] })
        )

        a.close()

        const stats = pub.stats()
        expect(stats.clients).toBe(1)
        expect(stats.blockheight).toBe(1)
        expect(stats.blockfee).toBe(1)
        expect(stats.blockfee2).toBe(1)
        expect(stats.currencies.USD).toBe(0)
        expect(stats.currencies.EUR).toBe(0)
    })
})

describe('§2.6 inbound schema validation — ws2', () => {
    let emitter: EventEmitter
    let pub: Ws2Publisher

    beforeEach(() => {
        resetStorage()
        emitter = new EventEmitter()
        pub = new Ws2Publisher(emitter)
    })

    it('rejects a non-msgpack payload with {error: "invalid message"}', async () => {
        const { Decoder } = await import('@msgpack/msgpack')
        const decoder = new Decoder()
        const s = new FakeSocket()
        pub.newClient(asWs(s))
        s.sent.length = 0

        // Not valid msgpack.
        s.simulateMessage(Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff]))

        expect(s.sent).toHaveLength(1)
        expect(decoder.decode(s.sent[0] as Uint8Array)).toEqual({ error: 'invalid message' })
    })

    it('rejects msgpack with the wrong shape with {error: "invalid message"}', async () => {
        const { Decoder } = await import('@msgpack/msgpack')
        const decoder = new Decoder()
        const s = new FakeSocket()
        pub.newClient(asWs(s))
        s.sent.length = 0

        // Valid msgpack but not a subscribe/unsubscribe.
        s.simulateMessage(encoder.encode({ type: 'nonsense', eventType: 'blockheight' }))

        expect(s.sent).toHaveLength(1)
        expect(decoder.decode(s.sent[0] as Uint8Array)).toEqual({ error: 'invalid message' })
    })
})
