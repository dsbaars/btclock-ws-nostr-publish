import { WsConnection } from "../../src/ws_connection";
import { WsPriceSource } from "./ws-price-source";

export class GeminiPriceSource extends WsPriceSource {
  constructor() {
    const ws = new WsConnection('wss://api.gemini.com/v1/marketdata/BTCUSD');

    ws.on('open', () => {
      console.log('Gemini: Connected to Gemini BTC/USD WebSocket');
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());

      if (message.type === 'update' && message.events) {
        message.events.forEach((event: any) => {
          if (event.type === 'trade') {
//            console.log(`BTC/USD Trade: Price=${event.price}, Amount=${event.amount}`);
            this.emit('priceUpdate', { source: 'ge,omo', pair: "BTCUSD", price: event.price } );

          }
        });
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