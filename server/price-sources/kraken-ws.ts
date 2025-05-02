import { WsConnection } from "../../src/ws_connection";
import { WsPriceSource } from "./ws-price-source";

export class KrakenPriceSource extends WsPriceSource {
  constructor(pair:string) {
    const ws = new WsConnection('wss://ws.kraken.com/v2');
    ws.on('open', () => {
      const subscribeMessage = {
        method: 'subscribe',
        params: {
          channel: 'ticker',
          symbol: [
            'BTC/USD',  // For BTC to USD
            'BTC/EUR',  // For BTC to EUR
            'BTC/GBP',  // For BTC to GBP
            'BTC/CAD',  // For BTC to CAD
            'BTC/CHF',  // For BTC to CHF
            'BTC/AUD',  // For BTC to AUD
            'BTC/JPY'   // For BTC to JPY
          ],
        }
      };

      ws.send(JSON.stringify(subscribeMessage));
      console.log(`Kraken: Subscribed to ${subscribeMessage.params.symbol.join(',')} ticker`);
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      // console.log(message);
      // Handle subscription status
      if (message.method === 'subscribe' && message.success === true) {
        console.log(`Subscription status: ${message.result.channel} to ${message.result.symbol}`);
      }

      // Handle ticker data
      if (Array.isArray(message.data) && message.channel === 'ticker') {
        const tickerData = message.data[0];
        // console.log(`${tickerData.symbol} Price: ${tickerData.last} Pair: ${String(tickerData.symbol).substring(4)}`);
        this.emit('priceUpdate', { source: 'kraken', pair: String(tickerData.symbol).substring(4), price: tickerData.last } );
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