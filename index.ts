import 'websocket-polyfill'

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
// import { NostrPublisher } from "./server/publisher/nostr.js";

const logger = mainLogger.child({ module: 'fastify' })
const mempoolHostname = process.env.MEMPOOL_INSTANCE ?? ''

const emitter = new EventEmitter()

// let nostrPublisher = new NostrPublisher();
// nostrPublisher.connect();

DataStorage.lastPrice = new Map<string, string>()

try {
    await bootstrapMempool({ emitter, logger, hostname: mempoolHostname })
} catch (e) {
    if (e instanceof Error)
        logger.error(`Could not get initial mempool information: ${e.message}`)
    else
        logger.error(`Unknown error occured when trying to get initial mempool information`)
    exit(1)
}

const ws1Publisher = new Ws1Publisher(emitter)
const ws2Publisher = new Ws2Publisher(emitter)

let lastPublish: number = 0

const handlePriceUpdate = async (update: PriceUpdate) => {
    DataStorage.lastPrice.set(update.pair, update.price)

    emitter.emit('newPrice', update)

    if (update.pair == 'USD') {
        let currentDate = Date.now()
        if (currentDate / 1000 - lastPublish < 15) return
        // lastPublish = await nostrPublisher.nostrPublishPriceEvent(Number(DataStorage.lastPrice.get(update.pair)), "priceUsd", source, [
        //     ["medianFee", String(DataStorage.lastMedianFee)],
        //     ["block", String(DataStorage.lastBlock)],
        // ]) || lastPublish;
    }
}

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

const server = await createServer({ ws1Publisher, ws2Publisher, priceSources, logger })

server.listen({ host: '::', port: 8080 }, (err, address) => {
    if (err) {
        console.error(err)
        process.exit(1)
    }
    logger.info(`Server listening at ${address}`)
})
