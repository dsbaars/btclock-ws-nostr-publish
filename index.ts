import "websocket-polyfill";

import fastify from 'fastify'
import websocket from '@fastify/websocket'
import fastifyStatic from "@fastify/static";

import WebSocket from 'ws';
import mempoolJS from "@mempool/mempool.js";
import pino from 'pino'
import * as path from 'path';
import * as fs from 'fs';
import * as url from 'url';
import * as os from 'os';

import { exit } from "process";
import { CoincapPriceSource } from "./server/price-sources/coincap-ws";
import { OwnPriceSource } from "./server/price-sources/own-price-source";
import { PriceUpdate, WsPriceSource } from "./server/price-sources/ws-price-source";
import { DataStorage } from "./server/storage";
import { Ws1Publisher } from "./server/publisher/ws1";
import mainLogger from './server/logger';
import { Ws2Publisher } from "./server/publisher/ws2";
import EventEmitter from 'node:events';
import { DataConfig } from "./server/config";
import { NostrPublisher } from "./server/publisher/nostr";

const logger = mainLogger.child({ module: "fastify" })
const { bitcoin: { blocks, fees } } = mempoolJS({
    hostname: process.env.MEMPOOL_INSTANCE
});

let useOwnPriceData: boolean = process.env.OWN_PRICE_DATA === "true" ? true : false || false;

let emitter = new EventEmitter();

let nostrPublisher = new NostrPublisher();

nostrPublisher.connect();

let ws1Publisher = new Ws1Publisher(emitter);
let ws2Publisher = new Ws2Publisher(emitter);

try {
    DataStorage.lastPrice = new Map<string,string>();
    DataStorage.lastBlock = await blocks.getBlocksTipHeight();
    DataStorage.lastMedianFee = (await fees.getFeesMempoolBlocks())[0].medianFee;
} catch (e) {
    if (e instanceof Error)
        logger.error(`Could not get initial mempool information: ${e.message}`);
    else
        logger.error(`Unknown error occured when trying to get initial mempool information`)
    exit(1);
}

const handlePriceUpdate = async(update: PriceUpdate) => {
    let source = useOwnPriceData ? "median" : "coinCapWs";
    DataStorage.lastPrice.set(update.pair, update.price);

    emitter.emit("newPrice", update);

    if (update.pair == "USD") {
        let currentDate = Date.now();
        if (currentDate / 1000 - lastPublish < 15) return;
        lastPublish = await nostrPublisher.nostrPublishPriceEvent(Number(DataStorage.lastPrice.get(update.pair)), "priceUsd", source, [
            ["medianFee", String(DataStorage.lastMedianFee)],
            ["block", String(DataStorage.lastBlock)],
        ]) || lastPublish;      
    }  
}

let lastPublish: number;
let usdPriceSource:WsPriceSource;

// eurPriceSource = new OwnPriceSource(logger, 'EUR', DataConfig.eurSources);

if (useOwnPriceData) {
    let logger = mainLogger.child({ module: "ownPriceSource" })

    usdPriceSource = new OwnPriceSource(logger, 'USD', DataConfig.usdSources);

    for (let cur of ['EUR', 'JPY', 'GBP', 'CAD', 'SGD', 'CHF', 'AUD']) {
        let newCur = new OwnPriceSource(logger, cur, DataConfig.eurSources);
        newCur.on('priceUpdate', handlePriceUpdate)
    }

} else {
    let logger = mainLogger.child({ module: "coincapPriceSource" })

    usdPriceSource = new CoincapPriceSource(logger);
}




usdPriceSource.on('priceUpdate', handlePriceUpdate)

const initMempool = async () => {

    const { bitcoin: { websocket } } = mempoolJS({
        hostname: process.env.MEMPOOL_INSTANCE
    });

    const ws = websocket.wsInit();
    websocket.wsWantData(ws, ['blocks', 'mempool-blocks'])

    ws.addEventListener("open", (event) => {
        logger.info(`Mempool Websocket to ${process.env.MEMPOOL_INSTANCE} open`);
    });
    ws.addEventListener("message", async ({data}) => {
        const res = JSON.parse(data.toString());

        if (res.block) {
            let currentDate = Date.now();
            let expire = new Date(currentDate);
            expire.setMinutes(expire.getMinutes() + 240);


            nostrPublisher.nostrPublishBlockEvent(res.block.height, "mempoolWs");
            DataStorage.lastBlock = res.block.height;
            emitter.emit("newBlock");

        } else if (res["mempool-blocks"]) {
            let currentDate = Date.now();
            // let expire = new Date(currentDate);

            if (Math.round(res["mempool-blocks"][0].medianFee) == DataStorage.lastMedianFee)
                return;

            // expire.setMinutes(expire.getMinutes() + 5);

            // const ndkEvent = new NDKEvent(ndk);

            // ndkEvent.kind = 1;
            // ndkEvent.created_at = Math.floor(currentDate / 1000);
            // ndkEvent.tags = [
            //     ["expiration", String(Math.floor(expire.getTime() / 1000))],
            //     ["type", "blockMedianFee"],
            //     ["source", "mempoolWS"]
            // ];
            // // ndkEvent.content = String(res.block.height);
            

            // if (publishToNostr) {
            //     // await ndkEvent.publish().then(e => {
            //     // }).catch(e => {
            //     //     console.error("Error publishing fee-update");
            //     // })
            // }
            // else {
            //     logger.info("Nostr publishing disabled, not publishing fee update", ndkEvent.rawEvent());
            // }

            DataStorage.lastMedianFee = Math.round(res["mempool-blocks"][0].medianFee);
            emitter.emit("newFee");
        }

    });

    ws.on('close', (code, reason) => {
        logger.info(`Connection to mempool closed with code ${code} and reason: ${reason}`);
        setTimeout(initMempool, 1000);
    });
};

initMempool();

const server = fastify()
const clients: Set<WebSocket> = new Set();

// await server.register(FastifyVite, {
//     root: import.meta.url,
//     dev: process.argv.includes('--dev'),
//   })

await server.register(websocket);

server.register(fastifyStatic, {
    root: path.join(path.dirname(url.fileURLToPath(import.meta.url)), 'public')
  })
  
server.get('/', async (request, reply) => {
    const htmlFilePath = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '/public/index.html');
    const htmlContent = fs.readFileSync(htmlFilePath, 'utf8');
    reply.type('text/html').send(htmlContent);
});

server.get('/api/lastblock', async (request, reply) => {
    reply.type('application/json').send(DataStorage.lastBlock);
});

server.get('/api/hostname', async (request, reply) => {
    reply.type('application/json').send(os.hostname());
});


server.get('/api/lastprice', async (request, reply) => {
    reply.type('application/json').send(Object.fromEntries(DataStorage.lastPrice));
});

server.get('/api/lastfee', async (request, reply) => {
    reply.type('application/json').send(DataStorage.lastMedianFee);
});



server.get('/ws', { websocket: true }, (connection, req) => {
    ws1Publisher.newClient(connection.socket);
})

server.get('/v1/ws', { websocket: true }, (connection, req) => {
    ws1Publisher.newClient(connection.socket);
})

server.get('/v2/ws', { websocket: true }, (connection, req) => {
    ws2Publisher.newClient(connection.socket);  
});
// await server.vite.ready()

server.listen({ host: "::", port: 8080 }, (err, address) => {
    if (err) {
        console.error(err)
        process.exit(1)
    }
    logger.info(`Server listening at ${address}`)
})