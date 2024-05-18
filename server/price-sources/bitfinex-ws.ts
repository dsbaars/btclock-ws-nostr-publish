import { WsConnection } from "../../src/ws_connection";
import { WsPriceSource } from "./ws-price-source";

export class BitfinexPriceSource extends WsPriceSource {
  constructor() {
    const ws = new WsConnection('wss://api-pub.bitfinex.com/ws/2');

    ws.on('open', () => {
      const subscribeMessage = {
        event: 'subscribe',
        channel: 'ticker',
        symbol: 'tBTCUSD'
      };

      ws.send(JSON.stringify(subscribeMessage));
      console.log('Subscribed to BTC/USD ticker');
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());

      if (message.event === 'subscribed') {
        console.log(`Bitfinex: Subscription status: ${message.event} to channel ${message.channel}`);
      }

      // Ticker data comes as an array after subscription confirmation
      if (Array.isArray(message) && message[1] !== 'hb') {
        const tickerData = message[1];
        const [bid, bidSize, ask, askSize, dailyChange, dailyChangePerc, lastPrice, volume, high, low] = tickerData;
//        console.log(`BTC/USD Price: ${lastPrice}`);
        this.emit('priceUpdate', { source: 'bitfinex', pair: "BTC/USD", price: lastPrice } );

      }
    });

    ws.on('error', (error) => {
      console.error(`Bitfinex WebSocket error: ${error.message}`);
    });

    ws.on('close', () => {
      console.log('WebSocket connection closed');
    });

    ws.open();
    super();
  }
}