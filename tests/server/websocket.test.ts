import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import EventEmitter from 'node:events'
import * as os from 'node:os'
import * as path from 'node:path'
import * as fs from 'node:fs'
import pino from 'pino'
import WebSocket from 'ws'
import { Encoder, Decoder } from '@msgpack/msgpack'
import { FastifyInstance } from 'fastify'
import { createServer } from '../../server/app'
import { DataStorage } from '../../server/storage'
import { Ws1Publisher } from '../../server/publisher/ws1'
import { Ws2Publisher } from '../../server/publisher/ws2'
import { WsPriceSource } from '../../server/price-sources/ws-price-source'

const silent = pino({ level: 'silent' })
const encoder = new Encoder()
const decoder = new Decoder()

/**
 * Connect and start collecting frames immediately — the 'message' listener
 * must be attached synchronously after constructing the WebSocket so we don't
 * race the publisher's initial frames (which fire as soon as fastify invokes
 * the route handler on `open`).
 */
function connect(url: string, isBinary: boolean) {
    const ws = new WebSocket(url)
    const frames: (Buffer | string)[] = []
    const queued: Array<(f: Buffer | string) => void> = []

    ws.on('message', (data) => {
        const frame = isBinary ? (data as Buffer) : data.toString()
        const waiter = queued.shift()
        if (waiter) waiter(frame)
        else frames.push(frame)
    })

    const nextFrame = (timeoutMs = 5000): Promise<Buffer | string> =>
        new Promise((resolve, reject) => {
            const buffered = frames.shift()
            if (buffered !== undefined) return resolve(buffered)
            const to = setTimeout(() => reject(new Error('timeout waiting for frame')), timeoutMs)
            queued.push((f) => {
                clearTimeout(to)
                resolve(f)
            })
        })

    const open = new Promise<void>((resolve, reject) => {
        ws.once('open', () => resolve())
        ws.once('error', reject)
    })

    return { ws, open, nextFrame }
}

describe('WebSocket routes (end-to-end via real ws client)', () => {
    let server: FastifyInstance
    let port: number
    let tmpPublic: string
    let emitter: EventEmitter

    beforeEach(async () => {
        DataStorage.lastPrice = new Map<string, string>()
        DataStorage.lastPrice.set('USD', '50000')
        DataStorage.lastPrice.set('EUR', '45000')
        DataStorage.lastBlock = 800000
        DataStorage.lastMedianFee = 12.5

        emitter = new EventEmitter()
        const ws1 = new Ws1Publisher(emitter)
        const ws2 = new Ws2Publisher(emitter)
        tmpPublic = fs.mkdtempSync(path.join(os.tmpdir(), 'btclock-test-'))
        server = await createServer({
            ws1Publisher: ws1,
            ws2Publisher: ws2,
            priceSources: new Map<string, WsPriceSource>(),
            logger: silent,
            publicDir: tmpPublic,
        })

        const address = await server.listen({ host: '127.0.0.1', port: 0 })
        port = Number(new URL(address).port)
    })

    afterEach(async () => {
        await server.close()
        fs.rmSync(tmpPublic, { recursive: true, force: true })
    })

    it.each(['/ws', '/api/v1/ws'])(
        'ws1: %s delivers 3 initial JSON frames on connect',
        async (route) => {
            const { ws, open, nextFrame } = connect(`ws://127.0.0.1:${port}${route}`, false)
            await open

            const f1 = JSON.parse((await nextFrame()) as string)
            const f2 = JSON.parse((await nextFrame()) as string)
            const f3 = JSON.parse((await nextFrame()) as string)
            ws.close()

            expect(f1).toEqual({ bitcoin: '50000' })
            expect(f2).toEqual({ block: { height: 800000 } })
            expect(f3).toEqual({ 'mempool-blocks': [{ medianFee: 13 }] })
        }
    )

    it('ws2: /api/v2/ws delivers a MessagePack Welcome frame and responds to a subscribe', async () => {
        const { ws, open, nextFrame } = connect(`ws://127.0.0.1:${port}/api/v2/ws`, true)
        await open

        expect(decoder.decode((await nextFrame()) as Buffer)).toEqual({ msg: 'Welcome' })

        ws.send(encoder.encode({ type: 'subscribe', eventType: 'blockheight' }))
        expect(decoder.decode((await nextFrame()) as Buffer)).toEqual({ blockheight: 800000 })

        ws.close()
    })
})
