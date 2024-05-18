import "websocket-polyfill";

import fastify from 'fastify'
import websocket from '@fastify/websocket'
import fastifyStatic from "@fastify/static";
import FastifyVite from '@fastify/vite'

import WebSocket from 'ws';
import NDK, { NDKEvent, NDKFilter, NDKPrivateKeySigner } from "@nostr-dev-kit/ndk";
import mempoolJS from "@mempool/mempool.js";
import pino from 'pino'
import * as path from 'path';
import * as fs from 'fs';
import * as url from 'url';
import * as os from 'os';

import * as dotenv from 'dotenv';
import { exit } from "process";
import { CoincapPriceSource } from "./server/price-sources/coincap-ws";
import { OwnPriceSource } from "./server/price-sources/own-price-source";
import { WsPriceSource } from "./server/price-sources/ws-price-source";
dotenv.config();

const logger = pino({
    level: process.env.LOGLEVEL || 'info',
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true
          }
    },
});

const { bitcoin: { blocks, fees } } = mempoolJS({
    hostname: process.env.MEMPOOL_INSTANCE
});

// const mempoolWs = websocket.initServer({
//     options: ["blocks", "mempool-blocks"],
//   });


let lastPrice:number, lastBlock:number, lastMedianFee:number;

try {
    lastPrice = 0;
    lastBlock = await blocks.getBlocksTipHeight();
    lastMedianFee = (await fees.getFeesMempoolBlocks())[0].medianFee;
} catch (e) {
    if (e instanceof Error)
        logger.error(`Could not get initial mempool information: ${e.message}`);
    else
        logger.error(`Unknown error occured when trying to get initial mempool information`)
    exit(1);
}

let keySigner = new NDKPrivateKeySigner(process.env.NOSTR_PRIV);

let publishToNostr: boolean = process.env.PUBLISH_TO_NOSTR === "true" ? true : false || false;
let useOwnPriceData: boolean = process.env.OWN_PRICE_DATA === "true" ? true : false || false;

logger.info(`Publish to nostr ${publishToNostr}`);

const ndk = new NDK({
    explicitRelayUrls: [
        "wss://nostr.dbtc.link",
        "wss://nostr1.daedaluslabs.io",
        "wss://nostr2.daedaluslabs.io",
        "wss://nostr3.daedaluslabs.io",
        "wss://pablof7z.nostr1.com",
        "wss://offchain.pub",
        "wss://relay.f7z.io",
        "wss://relay.damus.io",
        "wss://relay.snort.social",
        "wss://offchain.pub/",
        "wss://nostr.mom",
        "wss://nostr-pub.wellorder.net",
        "wss://purplepag.es",
        "wss://brb.io/",
    ],
    signer: keySigner,
});

if (publishToNostr) {
    await ndk.connect(6000);

    const filter: NDKFilter = { kinds: [1, 5], authors: ["642317135fd4c4205323b9dea8af3270657e62d51dc31a657c0ec8aab31c6288"] };

    let lastEventId: string = "";

    let subscription = ndk.subscribe(filter);
    subscription.on('event', async (e) => {
        if (e.kind == 1) {
            if (lastEventId.length && e.tags[1][1] == "priceUsd") {
                const ndkEvent = new NDKEvent(ndk);
                let currentDate = Date.now();

                ndkEvent.kind = 5;
                ndkEvent.created_at = Math.floor(currentDate / 1000);
                ndkEvent.content = "";
                ndkEvent.tags = [
                    ["e", lastEventId],
                ];

                lastEventId = "";
                if (publishToNostr) {
                    await ndkEvent.publish();
                } else {
                    logger.info("Nostr publishing disabled, not publishing price update");
                }
            }

            lastEventId = e.id;
        }
        if (e.kind == 5) {
        }
    })

}


let lastPublish: number;

let priceSource:WsPriceSource;

if (useOwnPriceData) {
    priceSource = new OwnPriceSource(logger);
} else {
    priceSource = new CoincapPriceSource(logger);
}

priceSource.on('priceUpdate', async(lastPrice) => {
        let source = useOwnPriceData ? "median" : "coinCapWs";

        let output = { "bitcoin": lastPrice }

        for (const client of clients) {
            client.send(JSON.stringify(output));
        }

        let currentDate = Date.now();

        if (currentDate / 1000 - lastPublish < 15) return;

        let expire = new Date(currentDate);
        expire.setMinutes(expire.getMinutes() + 1);
        const ndkEvent = new NDKEvent(ndk);
        ndkEvent.kind = 1;
        ndkEvent.content = lastPrice.toString();
        ndkEvent.tags = [
            ["expiration", String(Math.floor(expire.getTime() / 1000))],
            ["type", "priceUsd"],
            ["source", source],
        ];

        if (publishToNostr) {
            await ndkEvent.publish().then(e => {
                lastPublish = Date.now() / 1000;
            }).catch(e => {
                console.error("Error publishing price");
            })
        } else {
            logger.info("Nostr publishing disabled, not publishing price update", ndkEvent.rawEvent());
        }
})

const initMempool = async () => {

    const { bitcoin: { websocket } } = mempoolJS({
        hostname: process.env.MEMPOOL_INSTANCE
    });

    // const ws = websocket.initServer({
    //     options: ["blocks", "mempool-blocks"],
    // });

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

            const ndkEvent = new NDKEvent(ndk);

            ndkEvent.kind = 1;
            ndkEvent.created_at = Math.floor(currentDate / 1000);
            ndkEvent.tags = [
                ["expiration", String(Math.floor(expire.getTime() / 1000))],
                ["type", "blockHeight"],
                ["source", "mempoolWS"]
            ];
            ndkEvent.content = String(res.block.height);
            let output = { "block": { "height": res.block.height } };

            logger.info(output);
            for (const client of clients) {
                client.send(JSON.stringify(output));
            }

            if (publishToNostr) {

                await ndkEvent.publish().then(e => {
                }).catch(e => {
                    console.error("Error publishing block");
                })
            }
            else {
                logger.info("Nostr publishing disabled, not publishing block update", ndkEvent.rawEvent());
            }

            lastBlock = res.block.height;
        } else if (res["mempool-blocks"]) {
            let currentDate = Date.now();
            let expire = new Date(currentDate);

            if (Math.round(res["mempool-blocks"][0].medianFee) == lastMedianFee)
                return;

            expire.setMinutes(expire.getMinutes() + 5);

            const ndkEvent = new NDKEvent(ndk);

            ndkEvent.kind = 1;
            ndkEvent.created_at = Math.floor(currentDate / 1000);
            ndkEvent.tags = [
                ["expiration", String(Math.floor(expire.getTime() / 1000))],
                ["type", "blockMedianFee"],
                ["source", "mempoolWS"]
            ];
            // ndkEvent.content = String(res.block.height);
            let output = { "mempool-blocks": [{ "medianFee": Math.round(res["mempool-blocks"][0].medianFee) }] };

            for (const client of clients) {
                client.send(JSON.stringify(output));
            }

            if (publishToNostr) {

                // await ndkEvent.publish().then(e => {
                // }).catch(e => {
                //     console.error("Error publishing fee-update");
                // })
            }
            else {
                logger.info("Nostr publishing disabled, not publishing fee update", ndkEvent.rawEvent());
            }

            lastMedianFee = Math.round(res["mempool-blocks"][0].medianFee);

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
    reply.type('application/json').send(lastBlock);
});

server.get('/api/hostname', async (request, reply) => {
    reply.type('application/json').send(os.hostname());
});


server.get('/api/lastprice', async (request, reply) => {
    reply.type('application/json').send(lastPrice);
});

server.get('/api/lastfee', async (request, reply) => {
    reply.type('application/json').send(lastMedianFee);
});



server.get('/ws', { websocket: true }, (connection, req) => {
    clients.add(connection.socket);

    connection.socket.send(JSON.stringify({ "bitcoin": lastPrice }));
    connection.socket.send(JSON.stringify({ "block": { "height": lastBlock } }));
    connection.socket.send(JSON.stringify({ "mempool-blocks": [{ "medianFee": lastMedianFee }] }));

    connection.socket.on('close', (code, reason) => {
        clients.delete(connection.socket);
    });
})
// await server.vite.ready()

server.listen({ host: "::", port: 8080 }, (err, address) => {
    if (err) {
        console.error(err)
        process.exit(1)
    }
    logger.info(`Server listening at ${address}`)
})