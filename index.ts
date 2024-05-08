import "websocket-polyfill";

import fastify from 'fastify'
import websocket from '@fastify/websocket'
import WebSocket from 'ws';
import NDK, { NDKEvent, NDKFilter, NDKPrivateKeySigner } from "@nostr-dev-kit/ndk";
import mempoolJS from "@mempool/mempool.js";
import * as path from 'path';
import * as fs from 'fs';
import * as url from 'url';

import * as dotenv from 'dotenv';
dotenv.config();

const { bitcoin: { blocks, fees } } = mempoolJS({
    hostname: 'mempool.space'
});

let lastPrice = 0;
let lastBlock = await blocks.getBlocksTipHeight();
let lastMedianFee = (await fees.getFeesMempoolBlocks())[0].medianFee;
console.log(lastMedianFee);

let keySigner = new NDKPrivateKeySigner(process.env.NOSTR_PRIV);

let publishToNostr = false;

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

            //console.log(`Trying to delete ${lastEventId}`);
            lastEventId = "";
            if (publishToNostr) {
                await ndkEvent.publish();
            } else {
                console.log("Nostr publishing disabled, not publishing price update");
            }
        }

        lastEventId = e.id;
        // console.log(`New event ${lastEventId}`);
    }
    if (e.kind == 5) {
        //  console.log(`${e.tags[0][1]} deleted`);
    }
})

let lastPublish: number;

let createPriceWebSocket = () => {
    const ws = new WebSocket("wss://ws.coincap.io/prices?assets=bitcoin");

    ws.on('open', () => {
        console.log('Connected to CoinCap.io');
    });

    ws.on('message', async (message) => {
        const messageString = message.toString();
        const jsonMsg = JSON.parse(messageString);

        if (!jsonMsg)
            return;

        if (Math.round(jsonMsg.bitcoin) == lastPrice)
            return;

        lastPrice = Math.round(jsonMsg.bitcoin);

        let output = { "bitcoin": lastPrice }

        console.log(output);
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
            ["source", "coinCapWS"],
        ];

        if (publishToNostr) {
            await ndkEvent.publish().then(e => {
                lastPublish = Date.now() / 1000;
            }).catch(e => {
                console.error("Error publishing price");
            })
        } else {
            console.log("Nostr publishing disabled, not publishing price update");
        }

    });

    ws.on('close', (code, reason) => {
        console.log(`Connection to external WebSocket closed with code ${code} and reason: ${reason}`);
        // Attempt to reconnect after a delay (e.g., 5 seconds)
        setTimeout(createPriceWebSocket, 1000);
    });

    return ws;
}

let externalWebSocket = createPriceWebSocket();


const initMempool = async () => {

    const { bitcoin: { websocket } } = mempoolJS({
        hostname: 'mempool.space'
    });

    const ws = websocket.initServer({
        options: ["blocks", "mempool-blocks"],
    });

    ws.on("message", async (data) => {
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

            console.log(output);
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
                console.log("Nostr publishing disabled, not publishing block update", ndkEvent.rawEvent);
            }

            lastBlock = res.block.height;
        } else if (res["mempool-blocks"]) {
            let currentDate = Date.now();
            let expire = new Date(currentDate);

            if (Math.round(res["mempool-blocks"][0].medianFee) == lastMedianFee)
                return;

            // expire.setMinutes(expire.getMinutes() + 240);

            // const ndkEvent = new NDKEvent(ndk);

            // ndkEvent.kind = 1;
            // ndkEvent.created_at = Math.floor(currentDate / 1000);
            // ndkEvent.tags = [
            //     ["expiration", String(Math.floor(expire.getTime() / 1000))],
            //     ["type", "blockMedianFee"],
            //     ["source", "mempoolWS"]
            // ];
            // ndkEvent.content = String(res.block.height);
            let output = { "mempool-blocks": [{ "medianFee": Math.round(res["mempool-blocks"][0].medianFee) }] };

            // console.log(output);
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
                console.log("Nostr publishing disabled, not publishing fee update");
            }

            lastMedianFee = Math.round(res["mempool-blocks"][0].medianFee);

        }

    });

    ws.on('close', (code, reason) => {
        console.log(`Connection to mempool closed with code ${code} and reason: ${reason}`);
        setTimeout(initMempool, 1000);
    });
};

initMempool();

const server = fastify()
const clients: Set<WebSocket> = new Set();

await server.register(websocket);

server.get('/', async (request, reply) => {
    const htmlFilePath = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '/public/index.html');
    const htmlContent = fs.readFileSync(htmlFilePath, 'utf8');
    reply.type('text/html').send(htmlContent);
});


server.get('/ws', { websocket: true }, (connection, req) => {
    clients.add(connection.socket);

    connection.socket.send(JSON.stringify({ "bitcoin": lastPrice }));
    connection.socket.send(JSON.stringify({ "block": { "height": lastBlock } }));
    connection.socket.send(JSON.stringify({ "mempool-blocks": [{ "medianFee": lastMedianFee }]}));

    connection.socket.on('close', (code, reason) => {
        //console.log(`Connection closed with code ${code} and reason: ${reason}`);
        clients.delete(connection.socket);
    });
})

server.listen({ host: "::", port: 8080 }, (err, address) => {
    if (err) {
        console.error(err)
        process.exit(1)
    }
    console.log(`Server listening at ${address}`)
})