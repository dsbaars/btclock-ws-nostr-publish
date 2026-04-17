import { beforeEach, describe, expect, it } from 'vitest'
import EventEmitter from 'node:events'
import { Ws1Publisher } from '../../server/publisher/ws1'
import { DataStorage } from '../../server/storage'
import { FakeSocket, asWs } from '../helpers/fake-socket'

function resetStorage() {
    DataStorage.lastPrice = new Map<string, string>()
    DataStorage.lastPrice.set('USD', '50000')
    DataStorage.lastBlock = 800000
    DataStorage.lastMedianFee = 12.5
}

describe('Ws1Publisher (legacy JSON protocol)', () => {
    let emitter: EventEmitter
    let pub: Ws1Publisher

    beforeEach(() => {
        resetStorage()
        emitter = new EventEmitter()
        pub = new Ws1Publisher(emitter)
    })

    it('sends price, block, and mempool-blocks frames on new client connect', () => {
        const socket = new FakeSocket()
        pub.newClient(asWs(socket))

        expect(socket.sent).toHaveLength(3)
        const [price, block, fee] = socket.sentJson() as Array<Record<string, unknown>>
        expect(price).toEqual({ bitcoin: '50000' })
        expect(block).toEqual({ block: { height: 800000 } })
        expect(fee).toEqual({ 'mempool-blocks': [{ medianFee: 13 }] }) // Math.round(12.5) = 13
    })

    it('broadcasts USD price updates to all connected clients', () => {
        const a = new FakeSocket()
        const b = new FakeSocket()
        pub.newClient(asWs(a))
        pub.newClient(asWs(b))
        a.sent.length = 0
        b.sent.length = 0

        DataStorage.lastPrice.set('USD', '50100')
        emitter.emit('newPrice', { pair: 'USD', price: '50100' })

        expect(a.sentJson()).toEqual([{ bitcoin: '50100' }])
        expect(b.sentJson()).toEqual([{ bitcoin: '50100' }])
    })

    it('ignores non-USD price updates', () => {
        const socket = new FakeSocket()
        pub.newClient(asWs(socket))
        socket.sent.length = 0

        emitter.emit('newPrice', { pair: 'EUR', price: '45000' })

        expect(socket.sent).toEqual([])
    })

    it('broadcasts new block height to all clients', () => {
        const socket = new FakeSocket()
        pub.newClient(asWs(socket))
        socket.sent.length = 0

        DataStorage.lastBlock = 800001
        emitter.emit('newBlock')

        expect(socket.sentJson()).toEqual([{ block: { height: 800001 } }])
    })

    it('deduplicates fee updates that round to the same integer', () => {
        const socket = new FakeSocket()
        pub.newClient(asWs(socket))
        socket.sent.length = 0

        DataStorage.lastMedianFee = 12.6
        emitter.emit('newFee') // rounds to 13 -> sends
        DataStorage.lastMedianFee = 12.7
        emitter.emit('newFee') // still rounds to 13 -> suppressed
        DataStorage.lastMedianFee = 14.2
        emitter.emit('newFee') // rounds to 14 -> sends

        expect(socket.sentJson()).toEqual([
            { 'mempool-blocks': [{ medianFee: 13 }] },
            { 'mempool-blocks': [{ medianFee: 14 }] },
        ])
    })

    it('removes clients from the broadcast set when they close', () => {
        const a = new FakeSocket()
        const b = new FakeSocket()
        pub.newClient(asWs(a))
        pub.newClient(asWs(b))
        a.sent.length = 0
        b.sent.length = 0

        a.close()

        DataStorage.lastBlock = 900000
        emitter.emit('newBlock')

        expect(a.sent).toEqual([])
        expect(b.sentJson()).toEqual([{ block: { height: 900000 } }])
    })
})
