import { WsConnection } from "../../src/ws_connection";
import { WsPriceSource } from './ws-price-source';

export class CoinbasePriceSource extends WsPriceSource {
    protected pair: string;
    constructor(pair: string = 'BTC-USD') {
        const ws = new WsConnection('wss://ws-feed.pro.coinbase.com');
        ws.on('open', () => {
            const subscribeMessage = {
                type: 'subscribe',
                product_ids: ['BTC-USD', 'BTC-EUR', 'BTC-GBP'],
                channels: ['ticker']
            };

            ws.send(JSON.stringify(subscribeMessage));
            console.log(`Coinbase: Subscribed to ${pair} ticker`);
        });

        ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            console.log("Coinbase msg", message);

            if (message.type === 'ticker' && message.product_id === pair) {
//                console.log(`BTC/USD Price: ${message.price}`);
                this.emit('priceUpdate', { source: 'coinbase', pair: String(message.product_id).substring(4), price: message.price } );

            }
        });

        ws.on('error', (error) => {
            console.error(`Coinbase: WebSocket error: ${error.message}`);
        });

        ws.on('close', () => {
            console.log('Coinbase: WebSocket connection closed');
        });
        ws.open();
        super();
        this.pair = pair;
    }
}