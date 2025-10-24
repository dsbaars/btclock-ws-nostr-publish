import WebSocket from 'ws';
import { DataStorage } from '../storage';
import EventEmitter from 'node:events';
import { PriceUpdate } from '../price-sources/ws-price-source';

export class Ws1Publisher {
    protected clients: Set<WebSocket> = new Set();

    constructor(emitter: EventEmitter) {
        this.clients = new Set();

        emitter.on("newPrice", (update: PriceUpdate) => { 
            if (update.pair != "USD") return;
            this.onNewPrice() 
        });
        emitter.on("newFee", () => { this.onNewFee() });
        emitter.on("newBlock", () => { this.onNewBlock() });
    }

    newClient(socket: WebSocket) {
        this.clients.add(socket);

        socket.send(JSON.stringify({ "bitcoin": DataStorage.lastPrice.get("USD") }));
        socket.send(JSON.stringify({ "block": { "height": DataStorage.lastBlock } }));
        socket.send(JSON.stringify({ "mempool-blocks": [{ "medianFee": Math.round(DataStorage.lastMedianFee) }] }));

        socket.on('close', (code, reason) => {
            this.clients.delete(socket);
        });
    }

    onNewPrice() {
        let output = { "bitcoin": DataStorage.lastPrice.get("USD") }

        for (const client of this.clients) {
            client.send(JSON.stringify(output));
        }
    }

    onNewBlock() {
        let output = { "block": { "height": DataStorage.lastBlock } };

        for (const client of this.clients) {
            client.send(JSON.stringify(output));
        }
    }

    onNewFee() {
        let output = { "mempool-blocks": [{ "medianFee": Math.round(DataStorage.lastMedianFee) }] };

        for (const client of this.clients) {
            client.send(JSON.stringify(output));
        }
    }
}
