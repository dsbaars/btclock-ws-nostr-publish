import { WsConnection } from "../../src/ws_connection";
import { WsPriceSource } from "./ws-price-source";

export class KrakenPriceSource extends WsPriceSource {
  constructor() {
    const ws = new WsConnection('wss://ws.kraken.com');
    ws.on('open', () => {
      const subscribeMessage = {
        event: 'subscribe',
        pair: [
          'BTC/USD',  // For BTC to USD
          'BTC/EUR',  // For BTC to EUR
          'BTC/GBP',  // For BTC to GBP
          'BTC/CAD',  // For BTC to CAD
          'BTC/CHF',  // For BTC to CHF
          'BTC/AUD',  // For BTC to AUD
          'BTC/JPY'   // For BTC to JPY
        ],
        subscription: {
          name: 'ticker'
        }
      };

      ws.send(JSON.stringify(subscribeMessage));
      console.log('Kraken: Subscribed to BTC/USD ticker');
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());

      // Handle subscription status
      if (message.event === 'subscriptionStatus' && message.status === 'subscribed') {
        //console.log(`Subscription status: ${message.status} to ${message.pair}`);
      }

      // Handle ticker data
      if (Array.isArray(message) && message[2] === 'ticker') {
        const tickerData = message[1];
        //console.log(`${message[3]} Price: ${tickerData.c[0]}`);
        this.emit('priceUpdate', { source: 'kraken', pair: message[3], price: tickerData.c[0] } );
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