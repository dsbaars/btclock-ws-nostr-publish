import WebSocket from 'ws';
import { DataStorage } from '../storage';
import EventEmitter from 'node:events';
import { Encoder, Decoder } from "@msgpack/msgpack";
import { PriceUpdate } from '../price-sources/ws-price-source';

const encoder = new Encoder();
const decoder = new Decoder();

export class Ws2Publisher {
    private clients: Map<WebSocket, Set<string>> = new Map();
    private currenciesClientMap: Map<string, Set<WebSocket>> = new Map();

    constructor(emitter: EventEmitter) {
        emitter.on("newPrice", (update) => { this.onNewPrice(update) });
        emitter.on("newFee", () => { this.onNewFee() });
        emitter.on("newBlock", () => { this.onNewBlock() });

        for (let c of ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD']) {
            this.currenciesClientMap.set(c, new Set<WebSocket>());
        }

    }

    newClient(socket: WebSocket) {
        this.clients.set(socket, new Set());
        socket.send(encoder.encode({ "msg": "Welcome" }));

        socket.on('message', msg => {
            try {
                const message = decoder.decode(msg);
                if (message.type === 'subscribe') {
                    this.subscribe(socket, message.eventType);
                    switch (message.eventType) {
                        case "price":
                            if ('currency' in message) {
                                this.subscribeCurrency(socket, message.currency)
                            } else if ('currencies' in message) {
                                message.currencies.forEach(c => {
                                    this.subscribeCurrency(socket, c)
                                })
                            }

                            break;
                        case "blockfee":
                            socket.send(encoder.encode({ blockfee: Math.round(DataStorage.lastMedianFee) }));
                            break;
                        case "blockfee2":
                            socket.send(encoder.encode({ blockfee2: DataStorage.lastMedianFee }));
                            break;
                        case "blockheight":
                            socket.send(encoder.encode({ blockheight: DataStorage.lastBlock }));
                            break;
                    }
                } else if (message.type === 'unsubscribe') {
                    this.unsubscribe(socket, message.eventType);
                    if (message.eventType == "price") {
                        if ('currency' in message) {
                            this.unsubscribeCurrency(socket, message.currency)
                        } else if ('currencies' in message) {
                            message.currencies.forEach(c => {
                                this.unsubscribeCurrency(socket, c)
                            })
                        }
                    }
                }
            } catch { }
        });

        socket.on('close', (code, reason) => {
            this.currenciesClientMap.forEach((set) => {
                if (set.has(socket)) {
                    set.delete(socket);
                }
            })

            this.clients.delete(socket);
        });
    }

    subscribe(client: WebSocket, eventType: string) {
        const subscriptions = this.clients.get(client);
        if (subscriptions) {
            subscriptions.add(eventType);
        }
    }

    subscribeCurrency(client: WebSocket, currency: string) {
        if (!this.currenciesClientMap.has(currency)) {
            if (DataStorage.lastPrice.get(currency) != null) {
                this.currenciesClientMap.set(currency, new Set<WebSocket>());
            } else {
                client.send(encoder.encode({ 'error': `${currency} does not exist.` }))
                return;
            }
        }

        this.currenciesClientMap.get(currency)?.add(client);
        client.send(encoder.encode({ 'msg': `Subscribed to ${currency}` }))

        client.send(encoder.encode({ price: { [currency]: DataStorage.lastPrice.get(currency)! }}));

    }

    unsubscribeCurrency(client: WebSocket, currency: string) {
        this.currenciesClientMap.get(currency)?.delete(client);
        client.send(encoder.encode({ 'msg': `Unsubscribed to ${currency}` }))
    }


    unsubscribe(client: WebSocket, eventType: string) {
        const subscriptions = this.clients.get(client);
        if (subscriptions) {
            subscriptions.delete(eventType);
        }
    }

    onNewPrice(update: PriceUpdate) {
        let clients = this.currenciesClientMap.get(update.pair)

        if (!clients?.size)
            return;

        clients.forEach((client) => {
            client.send(encoder.encode({ price: {[update.pair]: update.price}}));
        });
    }

    onNewBlock() {
        let output = { blockheight: DataStorage.lastBlock };

        this.clients.forEach((subscriptions, client) => {
            if (subscriptions.has("blockheight")) {
                client.send(encoder.encode(output));
            }
        });
    }

    onNewFee() {
        let output = { blockfee: Math.round(DataStorage.lastMedianFee) };

        let output2 = { blockfee2: Math.round(DataStorage.lastMedianFee * 100) / 100 };

        this.clients.forEach((subscriptions, client) => {
            if (subscriptions.has("blockfee")) {
                client.send(encoder.encode(output));
            }
        });

        this.clients.forEach((subscriptions, client) => {
            if (subscriptions.has("blockfee2")) {
                client.send(encoder.encode(output2));
            }
        });
    }
}
