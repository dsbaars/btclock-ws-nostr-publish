import { BitfinexPriceSource } from "./bitfinex-ws";
import { BitflyerPriceSource } from "./bitflyer-ws";
import { CoinbasePriceSource } from "./coinbase-ws";
import { GeminiPriceSource } from "./gemini-ws";
import { KrakenPriceSource } from "./kraken-ws";

import { PriceUpdate, WsPriceSource } from "./ws-price-source";

import pino from 'pino'

// const logger = pino({
//     name: 'WsPriceSources',
//     level: process.env.LOGLEVEL || 'info',
//     transport: {
//         target: 'pino-pretty',
//         options: {
//             colorize: true
//         }
//     },
// });

export class OwnPriceSource extends WsPriceSource {
    sources = {
        // kraken: new KrakenPriceSource(),
        // gemini: new GeminiPriceSource(),
        // coinbase: new CoinbasePriceSource(),
        // bitfinex: new BitfinexPriceSource(),
        // bitflyer: new BitflyerPriceSource(),
    }

    lastPrices = {
        // kraken: 0,
        // gemini: 0,
        // coinbase: 0,
        // bitfinex: 0,
        // bitflyer: 0
    }

    lastUpdates = {
        // kraken: 0,
        // gemini: 0,
        // coinbase: 0,
        // bitfinex: 0,
        // bitflyer: 0
    }

    lastAvgPrice = 0;

    logger: pino.Logger;
    protected pair: string;

    constructor(logger: pino.Logger, pair: string = "USD", sources: { [key: string]: WsPriceSource }) {
        super();
        this.sources = sources;

        this.logger = logger;
        this.pair = pair;

        for (let item of Object.keys(this.sources)) {
            this.sources[item].on('priceUpdate', (data: PriceUpdate) => {
                if (data.pair != pair) {
                    return;
                }

                this.lastPrices[item as keyof typeof this.sources] = parseFloat(data.price);
                this.lastUpdates[item as keyof typeof this.sources] = new Date().getMilliseconds();

                this.emitNewValue();
            })

        }
    }

    public getLastPrices() {
        return this.lastPrices;
    }

    private emitNewValue() {
        let validValues = 0;
        let timeDiffs = {}

        const filteredData = Object.values(this.lastPrices).filter((num: number) => {
            if (num == 0)
                return false

            validValues++;
            return true;
        }, 0);

        let avgPrice = Math.round(this.removeOutliersAndCalculateAverage(filteredData, 50));

        if (avgPrice != this.lastAvgPrice && Math.abs(this.lastAvgPrice - avgPrice) > 2) {
            this.logger.debug(`Average price ${this.pair} ${avgPrice} from ${validValues} sources`);
            this.emit('priceUpdate', { price: avgPrice, pair: this.pair });
            this.lastAvgPrice = avgPrice
        }
    }

    removeOutliersAndCalculateAverage(data: number[], threshold: number): number {
        // Calculate mean and standard deviation
        const mean = data.reduce((acc, val) => acc + val, 0) / data.length;
        const standardDeviation = Math.sqrt(data.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / data.length);

        // Define the upper and lower bounds for outliers
        const upperBound = mean + threshold * standardDeviation;
        const lowerBound = mean - threshold * standardDeviation;

        // Filter out outliers
        const filteredData = data.filter(val => val >= lowerBound && val <= upperBound);

        // Calculate the average of filtered data
        const average = filteredData.reduce((acc, val) => acc + val, 0) / filteredData.length;

        return average;
    }

}