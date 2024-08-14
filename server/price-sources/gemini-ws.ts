import { WsConnection } from "../../src/ws_connection";
import { WsPriceSource } from "./ws-price-source";

export class GeminiPriceSource extends WsPriceSource {
  protected pair: string;
  constructor(pair: string = 'BTCUSD') {
    const ws = new WsConnection(`wss://api.gemini.com/v1/multimarketdata?symbols=BTCUSD,BTCEUR,BTCGBP,BTCSGD`);
    super();
    this.pair = pair;

    ws.on('open', () => {
      console.log(`Gemini: Connected to Gemini ${pair} WebSocket`);
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());

      if (message.type === 'update' && message.events) {
        message.events.forEach((event: any) => {
          if (event.type === 'trade') {
//            console.log(`BTC/USD Trade: Price=${event.price}, Amount=${event.amount}`);
            this.emit('priceUpdate', { source: 'gemini', pair: String(this.pair).substring(3), price: event.price } );

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
 

  }
}