import { WsConnection } from "../../src/ws_connection";
import { WsPriceSource } from "./ws-price-source";

export class BitflyerPriceSource extends WsPriceSource {
    constructor() {
        const ws = new WsConnection('wss://ws.lightstream.bitflyer.com/json-rpc');
        ws.on('open', () => {
            const subscribeMessage = {
                method: 'subscribe',
                params: {
                    channel: 'lightning_ticker_BTC_USD'
                }
            };

            ws.send(JSON.stringify(subscribeMessage));
            console.log('Bitflyer: Subscribed to BTC/USD ticker');
        });

        ws.on('message', (data) => {
            const message = JSON.parse(data.toString());

            if (message.params && message.params.channel === 'lightning_ticker_BTC_USD') {
                const tickerData = message.params.message;
//                console.log(`BTC/USD Price: ${tickerData.ltp}`);
                this.emit('priceUpdate', { source: 'bitflyer', pair: "BTC/USD", price: tickerData.ltp } );

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