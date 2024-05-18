import { WsConnection } from "../../src/ws_connection";
import { WsPriceSource } from './ws-price-source';

export class CoinbasePriceSource extends WsPriceSource {
    constructor() {
        const ws = new WsConnection('wss://ws-feed.pro.coinbase.com');
        ws.on('open', () => {
            const subscribeMessage = {
                type: 'subscribe',
                product_ids: ['BTC-USD'],
                channels: ['ticker']
            };

            ws.send(JSON.stringify(subscribeMessage));
            console.log('Coinbase: Subscribed to BTC/USD ticker');
        });

        ws.on('message', (data) => {
            const message = JSON.parse(data.toString());

            if (message.type === 'ticker' && message.product_id === 'BTC-USD') {
//                console.log(`BTC/USD Price: ${message.price}`);
                this.emit('priceUpdate', { source: 'coinbase', pair: message.product_id, price: message.price } );

            }
        });

        ws.on('error', (error) => {
            console.error(`WebSocket error: ${error.message}`);
        });

        ws.on('close', () => {
            console.log('WebSocket connection closed');
        });
        ws.open();
        super();
    }
}