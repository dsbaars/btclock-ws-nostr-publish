import { WsConnection } from "../../src/ws_connection";
import { WsPriceSource } from "./ws-price-source";

export class CoincapPriceSource extends WsPriceSource {
    lastPrice = 0;
    constructor(logger) {
        const ws = new WsConnection("wss://ws.coincap.io/prices?assets=bitcoin");

        ws.on('open', () => {
            logger.info('Connected to CoinCap.io');
        });

        ws.on('message', async (message) => {
            const messageString = message.toString();
            const jsonMsg = JSON.parse(messageString);

            if (!jsonMsg)
                return;

            if (Math.round(jsonMsg.bitcoin) == this.lastPrice)
                return;

            this.lastPrice = Math.round(jsonMsg.bitcoin);

            this.emit("priceUpdate", this.lastPrice);
        });

        ws.on('error', (error) => {
            console.error(`CoinCap WebSocket error: ${error.message}`);
        });

        ws.on('close', () => {
            console.log('WebSocket connection closed');
        });

        ws.open();
        super();
    }
}