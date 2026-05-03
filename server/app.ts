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
import { classifyUa, metrics } from './metrics.js'

export type CreateServerDeps = {
    ws1Publisher: Ws1Publisher
    ws2Publisher: Ws2Publisher
    priceSources: Map<string, WsPriceSource>
    logger: pino.Logger
    publicDir?: string
    devMode?: boolean
    /**
     * Emitter used by the synthetic /api/_inject endpoint to drive the
     * publisher path without real upstream traffic. Only consulted when
     * `process.env.ENABLE_INJECT` is truthy. Benchmark-only.
     */
    injectEmitter?: NodeJS.EventEmitter
}

/**
 * permessage-deflate wire config (§2.5). Env-gated via `WS_COMPRESS`
 * (default: enabled). Small threshold skips compression for tiny control
 * frames; `level: 3` keeps CPU cost low on Pi.
 */
function perMessageDeflateOption(): false | Record<string, unknown> {
    if (process.env.WS_COMPRESS === 'false') return false
    return {
        threshold: 64,
        zlibDeflateOptions: { level: 3 },
    }
}

export async function createServer(deps: CreateServerDeps): Promise<FastifyInstance> {
    const server = fastify()

    await server.register(websocket, {
        options: {
            perMessageDeflate: perMessageDeflateOption(),
        },
    })

    const isProduction = process.env.NODE_ENV === 'production'

    if (deps.devMode && !isProduction) {
        const { default: middie } = await import('@fastify/middie')
        // @ts-expect-error: vite's package exports aren't resolved under moduleResolution=node10
        const { createServer: createViteServer } = await import('vite')

        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: 'custom',
        })

        await server.register(middie)
        server.use(vite.middlewares)

        const indexPath = path.resolve(process.cwd(), 'src/index.html')
        server.setNotFoundHandler(async (request, reply) => {
            if (request.url.startsWith('/api/') || request.url === '/ws') {
                reply.code(404).send({ error: 'Not Found' })
                return
            }
            try {
                const template = await vite.transformIndexHtml(
                    request.url,
                    fs.readFileSync(indexPath, 'utf8')
                )
                reply.type('text/html').send(template)
            } catch (e) {
                vite.ssrFixStacktrace(e as Error)
                throw e
            }
        })
    } else {
        const publicDir =
            deps.publicDir ??
            path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..', 'public')

        server.register(fastifyStatic, { root: publicDir })

        server.get('/', async (_request, reply) => {
            const htmlFilePath = path.join(publicDir, 'index.html')
            const htmlContent = fs.readFileSync(htmlFilePath, 'utf8')
            reply.type('text/html').send(htmlContent)
        })
    }

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

    // Benchmark-only synthetic event injection. Lets a bench harness drive
    // the publisher under controlled load without relying on real upstream
    // traffic. Gated by ENABLE_INJECT=true; otherwise the route is not mounted.
    if (process.env.ENABLE_INJECT === 'true' && deps.injectEmitter) {
        const emitter = deps.injectEmitter
        type InjectBody = {
            event: 'newPrice' | 'newBlock' | 'newFee'
            pair?: string
            price?: string
            block?: number
            fee?: number
        }
        server.post('/api/_inject', async (request, reply) => {
            const body = request.body as InjectBody
            switch (body?.event) {
                case 'newPrice':
                    if (!body.pair || body.price === undefined) {
                        return reply.code(400).send({ error: 'pair + price required' })
                    }
                    DataStorage.lastPrice.set(body.pair, String(body.price))
                    emitter.emit('newPrice', { pair: body.pair, price: String(body.price) })
                    break
                case 'newBlock':
                    if (typeof body.block === 'number') DataStorage.lastBlock = body.block
                    emitter.emit('newBlock')
                    break
                case 'newFee':
                    if (typeof body.fee === 'number') DataStorage.lastMedianFee = body.fee
                    emitter.emit('newFee')
                    break
                default:
                    return reply.code(400).send({ error: 'unknown event: ' + body?.event })
            }
            reply.code(204).send()
        })
    }

    const wireV1 = (socket: import('ws').WebSocket, req: import('fastify').FastifyRequest) => {
        const ua = classifyUa(req.headers['user-agent'])
        metrics.onConnect('v1', ua)
        socket.once('close', () => metrics.onDisconnect('v1', 'client_close'))
        deps.ws1Publisher.newClient(socket)
    }

    server.get('/ws', { websocket: true }, wireV1)
    server.get('/api/v1/ws', { websocket: true }, wireV1)

    server.get('/api/v2/ws', { websocket: true }, (socket, req) => {
        const ua = classifyUa(req.headers['user-agent'])
        metrics.onConnect('v2', ua)
        socket.once('close', () => metrics.onDisconnect('v2', 'client_close'))
        deps.ws2Publisher.newClient(socket)
    })

    return server
}
