import { WsConnection } from "../../src/ws_connection";
import { WsPriceSource } from "./ws-price-source";

export class BitflyerPriceSource extends WsPriceSource {
    constructor() {
        const ws = new WsConnection('wss://ws.lightstream.bitflyer.com/json-rpc');
        ws.on('open', () => {

            let channelMap = new Map<string,string>();
            channelMap.set('USD', 'lightning_ticker_BTC_USD');
            channelMap.set('EUR', 'lightning_ticker_BTC_EUR');
            channelMap.set('JPY', 'lightning_ticker_BTC_JPY');


            const subscribeMessage = {
                method: 'subscribe',
                params: {
                    channel: 'lightning_ticker_BTC_USD'
                }
            };

            ws.send(JSON.stringify(subscribeMessage));
            console.log('Bitflyer: Subscribed to BTC/USD ticker');

            const subscribeMessage2 = {
                method: 'subscribe',
                params: {
                    channel: 'lightning_ticker_BTC_EUR'
                }
            };

            ws.send(JSON.stringify(subscribeMessage2));
            console.log('Bitflyer: Subscribed to BTC/EUR ticker');

            const subscribeMessage3 = {
                method: 'subscribe',
                params: {
                    channel: 'lightning_ticker_BTC_JPY'
                }
            };

            ws.send(JSON.stringify(subscribeMessage3));
            console.log('Bitflyer: Subscribed to BTC/JPY ticker');
        });

        ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            if (message.params && message.params.channel === 'lightning_ticker_BTC_USD') {
                const tickerData = message.params.message;
                this.emit('priceUpdate', { source: 'bitflyer', pair: String(tickerData.product_code).substring(4), price: tickerData.ltp } );

            }
            if (message.params && message.params.channel === 'lightning_ticker_BTC_EUR') {
                const tickerData = message.params.message;
                this.emit('priceUpdate', { source: 'bitflyer', pair: String(tickerData.product_code).substring(4), price: tickerData.ltp } );
            }
            if (message.params && message.params.channel === 'lightning_ticker_BTC_JPY') {
                const tickerData = message.params.message;
                this.emit('priceUpdate', { source: 'bitflyer', pair: String(tickerData.product_code).substring(4), price: tickerData.ltp } );
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