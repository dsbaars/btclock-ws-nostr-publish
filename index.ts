import EventEmitter from 'node:events'
import { exit } from 'process'

import { DataStorage } from './server/storage.js'
import { OwnPriceSource } from './server/price-sources/own-price-source.js'
import { PriceUpdate, WsPriceSource } from './server/price-sources/ws-price-source.js'
import { Ws1Publisher } from './server/publisher/ws1.js'
import { Ws2Publisher } from './server/publisher/ws2.js'
import { DataConfig } from './server/config.js'
import mainLogger from './server/logger.js'
import { createServer } from './server/app.js'
import { bootstrapMempool, initMempoolWs } from './server/mempool.js'
import { createMetrics, createMetricsServer, setMetricsSink } from './server/metrics.js'
import { NostrPublisher } from './server/publisher/nostr.js'

const logger = mainLogger.child({ module: 'fastify' })
const metricsLogger = mainLogger.child({ module: 'metrics' })
const nostrLogger = mainLogger.child({ module: 'nostr' })
const mempoolHostname = process.env.MEMPOOL_INSTANCE ?? ''

const metricsBundle = createMetrics()
setMetricsSink(metricsBundle.sink)

const emitter = new EventEmitter()

const nostrPublisher = new NostrPublisher()
nostrPublisher.connect().catch((e) => {
    nostrLogger.error({ err: e instanceof Error ? e.message : String(e) }, 'connect failed')
})

DataStorage.lastPrice = new Map<string, string>()

try {
    await bootstrapMempool({ emitter, logger, hostname: mempoolHostname })
} catch (e) {
    if (e instanceof Error) logger.error(`Could not get initial mempool information: ${e.message}`)
    else logger.error(`Unknown error occured when trying to get initial mempool information`)
    exit(1)
}

const ws1Publisher = new Ws1Publisher(emitter)
const ws2Publisher = new Ws2Publisher(emitter)

const handlePriceUpdate = (update: PriceUpdate) => {
    DataStorage.lastPrice.set(update.pair, update.price)
    emitter.emit('newPrice', update)
    // Parameterized-replaceable semantics (§3.5): the relay drops older events
    // for the same (pubkey, kind, d-tag) — no throttling needed client-side.
    nostrPublisher.publishPrice(update.pair, update.price, 'priceAggregate', {
        block: DataStorage.lastBlock,
        medianFee: DataStorage.lastMedianFee,
    })
}

emitter.on('newBlock', () => {
    nostrPublisher.publishBlockHeight(DataStorage.lastBlock, 'mempoolWS')
})
emitter.on('newFee', () => {
    nostrPublisher.publishMedianFee(DataStorage.lastMedianFee, 'mempoolWS')
})

const priceSources = new Map<string, WsPriceSource>()
const ownLogger = mainLogger.child({ module: 'ownPriceSource' })

const usdPriceSource = new OwnPriceSource(ownLogger, 'USD', DataConfig.usdSources)
priceSources.set('USD', usdPriceSource)
usdPriceSource.on('priceUpdate', handlePriceUpdate)

for (const cur of ['EUR', 'JPY', 'GBP', 'CAD', 'SGD', 'CHF', 'AUD']) {
    const newCur = new OwnPriceSource(ownLogger, cur, DataConfig.eurSources)
    newCur.on('priceUpdate', handlePriceUpdate)
    priceSources.set(cur, newCur)
}

initMempoolWs({ emitter, logger, hostname: mempoolHostname })

const devMode = process.argv.includes('--dev')
const server = await createServer({
    ws1Publisher,
    ws2Publisher,
    priceSources,
    logger,
    devMode,
})

server.listen({ host: '::', port: 8080 }, (err, address) => {
    if (err) {
        console.error(err)
        process.exit(1)
    }
    logger.info(`Server listening at ${address}`)
})

// Prometheus sidecar — separate port so scraping doesn't share the app socket.
const metricsPort = Number(process.env.METRICS_PORT ?? 9090)
const metricsServer = await createMetricsServer(metricsBundle, metricsLogger)
metricsServer.listen({ host: '::', port: metricsPort }, (err, address) => {
    if (err) {
        metricsLogger.error({ err: err.message }, 'metrics sidecar failed to start')
        return
    }
    metricsLogger.info(`Metrics sidecar listening at ${address}`)
})
