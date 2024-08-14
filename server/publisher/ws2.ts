import WebSocket from 'ws';
import { DataStorage } from '../storage';
import EventEmitter from 'node:events';

export class Ws2Publisher {
    private clients: Map<WebSocket, Set<string>> = new Map();

    constructor(emitter: EventEmitter) {
        emitter.on("newPrice", () => { this.onNewPrice() });
        emitter.on("newFee", () => { this.onNewFee() });
        emitter.on("newBlock", () => { this.onNewBlock() });
    }

    newClient(socket: WebSocket) {
        this.clients.set(socket, new Set());
        socket.send(JSON.stringify({ "msg": "Welcome" }));

        socket.on('message', msg => {
            const message = JSON.parse(msg.toString());
            if (message.type === 'subscribe') {
                this.subscribe(socket, message.eventType);
                switch (message.eventType) {
                    case "price":
                        socket.send(JSON.stringify({ price: Object.fromEntries(DataStorage.lastPrice) }));
                        break;
                    case "blockfee":
                        socket.send(JSON.stringify({ blockfee: DataStorage.lastMedianFee }));
                        break;
                    case "blockheight":
                        socket.send(JSON.stringify({ blockheight: DataStorage.lastBlock }));
                        break;
                }
            } else if (message.type === 'unsubscribe') {
                this.unsubscribe(socket, message.eventType);
            }
        });

        socket.on('close', (code, reason) => {
            this.clients.delete(socket);
        });
    }

    subscribe(client: WebSocket, eventType: string) {
        const subscriptions = this.clients.get(client);
        if (subscriptions) {
            subscriptions.add(eventType);
        }
    }

    unsubscribe(client: WebSocket, eventType: string) {
        const subscriptions = this.clients.get(client);
        if (subscriptions) {
            subscriptions.delete(eventType);
        }
    }

    onNewPrice() {
        let output = { price: Object.fromEntries(DataStorage.lastPrice) }

        this.clients.forEach((subscriptions, client) => {
            if (subscriptions.has("price")) {
                client.send(JSON.stringify(output));
            }
        });
    }

    onNewBlock() {
        let output = { blockheight: DataStorage.lastBlock };

        this.clients.forEach((subscriptions, client) => {
            if (subscriptions.has("blockheight")) {
                client.send(JSON.stringify(output));
            }
        });
    }

    onNewFee() {
        let output = { blockfee: DataStorage.lastMedianFee };

        this.clients.forEach((subscriptions, client) => {
            if (subscriptions.has("blockfee")) {
                client.send(JSON.stringify(output));
            }
        });
    }
}
