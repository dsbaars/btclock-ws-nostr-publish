import { beforeEach, describe, expect, it } from 'vitest'
import EventEmitter from 'node:events'
import { Encoder, Decoder } from '@msgpack/msgpack'
import { Ws2Publisher } from '../../server/publisher/ws2'
import { DataStorage } from '../../server/storage'
import { FakeSocket, asWs } from '../helpers/fake-socket'

const encoder = new Encoder()
const decoder = new Decoder()

function decodeFrames(socket: FakeSocket): Array<Record<string, unknown>> {
    return socket.sent.map((s) => decoder.decode(s as Uint8Array) as Record<string, unknown>)
}

function resetStorage() {
    DataStorage.lastPrice = new Map<string, string>()
    DataStorage.lastPrice.set('USD', '50000')
    DataStorage.lastPrice.set('EUR', '45000')
    DataStorage.lastPrice.set('GBP', '38000')
    DataStorage.lastBlock = 800000
    DataStorage.lastMedianFee = 12.5
}

describe('Ws2Publisher (MessagePack subscription protocol)', () => {
    let emitter: EventEmitter
    let pub: Ws2Publisher

    beforeEach(() => {
        resetStorage()
        emitter = new EventEmitter()
        pub = new Ws2Publisher(emitter)
    })

    it('sends Welcome frame on new client connect', () => {
        const socket = new FakeSocket()
        pub.newClient(asWs(socket))

        expect(decodeFrames(socket)).toEqual([{ msg: 'Welcome' }])
    })

    it('responds to blockheight subscribe with current block', () => {
        const socket = new FakeSocket()
        pub.newClient(asWs(socket))
        socket.sent.length = 0

        socket.simulateMessage(encoder.encode({ type: 'subscribe', eventType: 'blockheight' }))

        expect(decodeFrames(socket)).toEqual([{ blockheight: 800000 }])
    })

    it('responds to blockfee subscribe with rounded current fee', () => {
        const socket = new FakeSocket()
        pub.newClient(asWs(socket))
        socket.sent.length = 0

        socket.simulateMessage(encoder.encode({ type: 'subscribe', eventType: 'blockfee' }))

        expect(decodeFrames(socket)).toEqual([{ blockfee: 13 }])
    })

    it('responds to blockfee2 subscribe with raw decimal fee', () => {
        const socket = new FakeSocket()
        pub.newClient(asWs(socket))
        socket.sent.length = 0

        socket.simulateMessage(encoder.encode({ type: 'subscribe', eventType: 'blockfee2' }))

        expect(decodeFrames(socket)).toEqual([{ blockfee2: 12.5 }])
    })

    it('broadcasts newBlock to clients subscribed to blockheight', () => {
        const subscribed = new FakeSocket()
        const unsubscribed = new FakeSocket()
        pub.newClient(asWs(subscribed))
        pub.newClient(asWs(unsubscribed))
        subscribed.simulateMessage(encoder.encode({ type: 'subscribe', eventType: 'blockheight' }))
        subscribed.sent.length = 0
        unsubscribed.sent.length = 0

        DataStorage.lastBlock = 800001
        emitter.emit('newBlock')

        expect(decodeFrames(subscribed)).toEqual([{ blockheight: 800001 }])
        expect(unsubscribed.sent).toEqual([])
    })

    it('delivers price updates only to subscribers of the matching currency', () => {
        const usdSub = new FakeSocket()
        const eurSub = new FakeSocket()
        pub.newClient(asWs(usdSub))
        pub.newClient(asWs(eurSub))

        usdSub.simulateMessage(
            encoder.encode({ type: 'subscribe', eventType: 'price', currency: 'USD' })
        )
        eurSub.simulateMessage(
            encoder.encode({ type: 'subscribe', eventType: 'price', currency: 'EUR' })
        )
        usdSub.sent.length = 0
        eurSub.sent.length = 0

        emitter.emit('newPrice', { pair: 'USD', price: '50100' })
        emitter.emit('newPrice', { pair: 'EUR', price: '45100' })

        expect(decodeFrames(usdSub)).toEqual([{ price: { USD: '50100' } }])
        expect(decodeFrames(eurSub)).toEqual([{ price: { EUR: '45100' } }])
    })

    it('subscribes to multiple currencies in one message', () => {
        const socket = new FakeSocket()
        pub.newClient(asWs(socket))

        socket.simulateMessage(
            encoder.encode({
                type: 'subscribe',
                eventType: 'price',
                currencies: ['USD', 'EUR'],
            })
        )
        socket.sent.length = 0

        emitter.emit('newPrice', { pair: 'USD', price: '50100' })
        emitter.emit('newPrice', { pair: 'EUR', price: '45100' })
        emitter.emit('newPrice', { pair: 'GBP', price: '38100' })

        expect(decodeFrames(socket)).toEqual([
            { price: { USD: '50100' } },
            { price: { EUR: '45100' } },
        ])
    })

    it('unsubscribe stops further price updates for that currency', () => {
        const socket = new FakeSocket()
        pub.newClient(asWs(socket))
        socket.simulateMessage(
            encoder.encode({ type: 'subscribe', eventType: 'price', currency: 'USD' })
        )
        socket.simulateMessage(
            encoder.encode({ type: 'unsubscribe', eventType: 'price', currency: 'USD' })
        )
        socket.sent.length = 0

        emitter.emit('newPrice', { pair: 'USD', price: '50100' })

        expect(socket.sent).toEqual([])
    })

    it('dedupes integer fee broadcasts but always sends blockfee2 decimals', () => {
        const feeSub = new FakeSocket()
        const fee2Sub = new FakeSocket()
        pub.newClient(asWs(feeSub))
        pub.newClient(asWs(fee2Sub))
        feeSub.simulateMessage(encoder.encode({ type: 'subscribe', eventType: 'blockfee' }))
        fee2Sub.simulateMessage(encoder.encode({ type: 'subscribe', eventType: 'blockfee2' }))
        feeSub.sent.length = 0
        fee2Sub.sent.length = 0

        DataStorage.lastMedianFee = 12.6
        emitter.emit('newFee') // rounds to 13 -> blockfee fires
        DataStorage.lastMedianFee = 12.7
        emitter.emit('newFee') // still 13 -> blockfee suppressed, blockfee2 still fires
        DataStorage.lastMedianFee = 14.3
        emitter.emit('newFee') // rounds to 14 -> blockfee fires again

        expect(decodeFrames(feeSub)).toEqual([{ blockfee: 13 }, { blockfee: 14 }])
        expect(decodeFrames(fee2Sub)).toEqual([
            { blockfee2: 12.6 },
            { blockfee2: 12.7 },
            { blockfee2: 14.3 },
        ])
    })

    it('removes closed clients from both maps', () => {
        const socket = new FakeSocket()
        pub.newClient(asWs(socket))
        socket.simulateMessage(
            encoder.encode({ type: 'subscribe', eventType: 'price', currency: 'USD' })
        )
        socket.sent.length = 0

        socket.close()

        emitter.emit('newPrice', { pair: 'USD', price: '50100' })
        expect(socket.sent).toEqual([])
    })
})
