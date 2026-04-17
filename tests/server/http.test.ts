import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import EventEmitter from 'node:events'
import * as os from 'node:os'
import * as path from 'node:path'
import * as fs from 'node:fs'
import pino from 'pino'
import { FastifyInstance } from 'fastify'
import { createServer } from '../../server/app'
import { DataStorage } from '../../server/storage'
import { Ws1Publisher } from '../../server/publisher/ws1'
import { Ws2Publisher } from '../../server/publisher/ws2'
import { WsPriceSource } from '../../server/price-sources/ws-price-source'

const silent = pino({ level: 'silent' })

function resetStorage() {
    DataStorage.lastPrice = new Map<string, string>()
    DataStorage.lastPrice.set('USD', '50000')
    DataStorage.lastPrice.set('EUR', '45000')
    DataStorage.lastBlock = 800000
    DataStorage.lastMedianFee = 12.5
}

describe('HTTP routes (createServer)', () => {
    let server: FastifyInstance
    let tmpPublic: string

    beforeEach(async () => {
        resetStorage()
        const emitter = new EventEmitter()
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
    })

    afterEach(async () => {
        await server.close()
        fs.rmSync(tmpPublic, { recursive: true, force: true })
    })

    it('GET /api/lastblock returns the raw block number', async () => {
        const res = await server.inject({ method: 'GET', url: '/api/lastblock' })
        expect(res.statusCode).toBe(200)
        expect(res.headers['content-type']).toContain('application/json')
        expect(JSON.parse(res.body)).toBe(800000)
    })

    it('GET /api/lastfee returns the raw median fee number', async () => {
        const res = await server.inject({ method: 'GET', url: '/api/lastfee' })
        expect(JSON.parse(res.body)).toBe(12.5)
    })

    it('GET /api/lastprice returns a plain object of currency -> price', async () => {
        const res = await server.inject({ method: 'GET', url: '/api/lastprice' })
        expect(JSON.parse(res.body)).toEqual({ USD: '50000', EUR: '45000' })
    })

    it('GET /api/v2/currencies returns an array of currency keys', async () => {
        const res = await server.inject({ method: 'GET', url: '/api/v2/currencies' })
        expect(JSON.parse(res.body)).toEqual(['USD', 'EUR'])
    })

    it('GET /api/hostname returns a non-empty string body (not JSON-encoded)', async () => {
        const res = await server.inject({ method: 'GET', url: '/api/hostname' })
        expect(res.statusCode).toBe(200)
        expect(res.body.length).toBeGreaterThan(0)
    })

    it('GET /api/debugprice returns an empty object when no price sources are registered', async () => {
        const res = await server.inject({ method: 'GET', url: '/api/debugprice' })
        expect(JSON.parse(res.body)).toEqual({})
    })

    it('GET /api/debugupdates returns an empty object when no price sources are registered', async () => {
        const res = await server.inject({ method: 'GET', url: '/api/debugupdates' })
        expect(JSON.parse(res.body)).toEqual({})
    })
})
