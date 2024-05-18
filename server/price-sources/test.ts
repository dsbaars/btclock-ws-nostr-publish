import { BitfinexPriceSource } from "./bitfinex-ws";
import { BitflyerPriceSource } from "./bitflyer-ws";
import { CoinbasePriceSource } from "./coinbase-ws";
import { GeminiPriceSource } from "./gemini-ws";
import { KrakenPriceSource } from "./kraken-ws";
import pino from 'pino'
import { OwnPriceSource } from "./own-price-source";

const logger = pino({
    name: 'WsPriceSources',
    level: process.env.LOGLEVEL || 'info',
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true
          }
    },
});


const ownSource = new OwnPriceSource();

ownSource.on('priceUpdate', (data) => {
    logger.info(`Average price ${data}`);
})