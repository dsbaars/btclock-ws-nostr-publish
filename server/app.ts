import fastify, { FastifyInstance } from 'fastify'
import websocket from '@fastify/websocket'
import fastifyStatic from '@fastify/static'
import * as path from 'path'
import * as fs from 'fs'
import * as url from 'url'
import * as os from 'os'
import type pino from 'pino'
import { DataStorage } from './storage.js'
import { Ws1Publisher } from './publisher/ws1.js'
import { Ws2Publisher } from './publisher/ws2.js'
import { WsPriceSource } from './price-sources/ws-price-source.js'
import { OwnPriceSource } from './price-sources/own-price-source.js'

export type CreateServerDeps = {
    ws1Publisher: Ws1Publisher
    ws2Publisher: Ws2Publisher
    priceSources: Map<string, WsPriceSource>
    logger: pino.Logger
    publicDir?: string
}

export async function createServer(deps: CreateServerDeps): Promise<FastifyInstance> {
    const server = fastify()

    await server.register(websocket)

    const publicDir =
        deps.publicDir ??
        path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..', 'public')

    server.register(fastifyStatic, { root: publicDir })

    server.get('/', async (request, reply) => {
        const htmlFilePath = path.join(publicDir, 'index.html')
        const htmlContent = fs.readFileSync(htmlFilePath, 'utf8')
        reply.type('text/html').send(htmlContent)
    })

    server.get('/api/lastblock', async (request, reply) => {
        reply.type('application/json').send(DataStorage.lastBlock)
    })

    server.get('/api/hostname', async (request, reply) => {
        reply.type('application/json').send(os.hostname())
    })

    server.get('/api/lastprice', async (request, reply) => {
        reply.type('application/json').send(Object.fromEntries(DataStorage.lastPrice))
    })

    server.get('/api/debugprice', async (request, reply) => {
        const lastPrices = Object.fromEntries(
            Array.from(deps.priceSources.entries()).map(([key, source]) => [
                key,
                (source as OwnPriceSource).getLastPrices(),
            ])
        )
        reply.type('application/json').send(lastPrices)
    })

    server.get('/api/debugupdates', async (request, reply) => {
        const lastPrices = Object.fromEntries(
            Array.from(deps.priceSources.entries()).map(([key, source]) => [
                key,
                (source as OwnPriceSource).getLastUpdates(),
            ])
        )
        reply.type('application/json').send(lastPrices)
    })

    server.get('/api/lastfee', async (request, reply) => {
        reply.type('application/json').send(DataStorage.lastMedianFee)
    })

    server.get('/api/v2/currencies', async (request, reply) => {
        reply.type('application/json').send(Array.from(DataStorage.lastPrice.keys()))
    })

    server.get('/ws', { websocket: true }, (socket, req) => {
        deps.ws1Publisher.newClient(socket)
    })

    server.get('/api/v1/ws', { websocket: true }, (socket, req) => {
        deps.ws1Publisher.newClient(socket)
    })

    server.get('/api/v2/ws', { websocket: true }, (socket, req) => {
        deps.ws2Publisher.newClient(socket)
    })

    return server
}
