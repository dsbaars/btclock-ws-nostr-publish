import { WsConnection } from '../../src/ws_connection';

const ws = new WsConnection('wss://stream.binance.com:9443/ws/btcusdt@trade');

ws.on('open', () => {
    console.log('Connected to Binance WebSocket');
});

ws.on('message', (data) => {
    const message = JSON.parse(data.toString());

    // Check if the message is a trade update
    if (message.e === 'trade') {
        const { p: price } = message; // Extract price from the message
        console.log(`BTC/USD Price: ${price}`);
    }
});

ws.on('error', (error) => {
    console.error(`WebSocket error: ${error.message}`);
});

ws.on('close', () => {
    console.log('WebSocket connection closed');
});

ws.open();