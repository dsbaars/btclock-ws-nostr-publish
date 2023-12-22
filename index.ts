import "websocket-polyfill";

import fastify from 'fastify'
import websocket from '@fastify/websocket'
import WebSocket from 'ws';
import NDK, { NDKEvent, NDKPrivateKeySigner } from "@nostr-dev-kit/ndk";
import * as dotenv from 'dotenv';
dotenv.config();

let lastPrice = 0;
let keySigner = new NDKPrivateKeySigner(process.env.NOSTR_PRIV);

const ndk = new NDK({
    explicitRelayUrls: [
        "wss://nostr.dbtc.link",
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

const eventsPerRelay = new Map<string, number>();
const eventIds = new Set();

let createExternalWebSocket = () => {
    const ws = new WebSocket("wss://ws.coincap.io/prices?assets=bitcoin");

    ws.on('open', () => {
        console.log('Connected to CoinCap.io');
    });

    ws.on('message', async(message) => {
        const messageString = message.toString();
        const jsonMsg = JSON.parse(messageString);

        if (!jsonMsg)
            return;

        if (Math.round(jsonMsg.bitcoin) == lastPrice)
            return;

        lastPrice = Math.round(jsonMsg.bitcoin);

        let output = { "bitcoin": lastPrice }

        console.log(output);
//        console.log(`Connected clients: ${clients.size}`)
        for (const client of clients) {
            client.send(JSON.stringify(output));
        }

        let currentDate = Date.now();
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

        await ndkEvent.publish().then(e => {
            console.log("Published");
        }).catch(e => {
            console.error("Error");
        })

    });

    ws.on('close', (code, reason) => {
        console.log(`Connection to external WebSocket closed with code ${code} and reason: ${reason}`);
        // Attempt to reconnect after a delay (e.g., 5 seconds)
        setTimeout(createExternalWebSocket, 1000);
    });

    return ws;
}

let externalWebSocket = createExternalWebSocket();

const server = fastify()
const clients: Set<WebSocket> = new Set();

await server.register(websocket);

server.get('/', { websocket: true }, (connection, req) => {
    clients.add(connection.socket);
    console.log(`Connected clients: ${clients.size}`)

    connection.socket.send(JSON.stringify({"bitcoin": lastPrice}))

    connection.socket.on('close', (code, reason) => {
        //console.log(`Connection closed with code ${code} and reason: ${reason}`);
        clients.delete(connection.socket);
    });
})

server.listen({ port: 8080 }, (err, address) => {
    if (err) {
        console.error(err)
        process.exit(1)
    }
    console.log(`Server listening at ${address}`)
})