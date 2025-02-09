import { TupleType } from "typescript";
import { BitfinexPriceSource } from "./price-sources/bitfinex-ws";
import { BitflyerPriceSource } from "./price-sources/bitflyer-ws";
import { CoinbasePriceSource } from "./price-sources/coinbase-ws";
import { GeminiPriceSource } from "./price-sources/gemini-ws";
import { KrakenPriceSource } from "./price-sources/kraken-ws";
import { WsPriceSource } from "./price-sources/ws-price-source";
import { Data } from "ws";

const NostrConfig =  {
    relayUrls: [
        "wss://nostr.dbtc.link",
        // "wss://nostr1.daedaluslabs.io",
        // "wss://nostr2.daedaluslabs.io",
        // "wss://nostr3.daedaluslabs.io",
        "wss://pablof7z.nostr1.com",
        "wss://offchain.pub",
        "wss://relay.f7z.io",
        "wss://relay.damus.io",
        "wss://relay.snort.social",
        "wss://offchain.pub/",
        "wss://nostr.mom",
        "wss://nostr-pub.wellorder.net",
        "wss://purplepag.es",
        "wss://brb.io/",
    ],
}

let krakenMultiCurrency = new KrakenPriceSource('BTC/USD');
//let coinbaseMultiCurrency = new CoinbasePriceSource('BTC/USD');
//let bitflyerMultiCurrency = new BitflyerPriceSource();
//let geminiMultiCurrency = new GeminiPriceSource();

type DataConfigType = {
    [key: string]: {
        [key: string]: WsPriceSource;
    }
}

const DataConfig:DataConfigType = {
    usdSources: {
        kraken: krakenMultiCurrency,
    //    gemini: geminiMultiCurrency,
     //   coinbase: coinbaseMultiCurrency,
        bitfinex: new BitfinexPriceSource(),
 //       bitflyer: bitflyerMultiCurrency,
    },
    eurSources: {
        kraken: krakenMultiCurrency,
     //   gemini: geminiMultiCurrency,
       // coinbase: coinbaseMultiCurrency,
//        bitflyer: bitflyerMultiCurrency,
        // bitfinex: new BitfinexPriceSource(),
        // bitflyer: new BitflyerPriceSource(),
    },
    gbpSources: {}
}

export { NostrConfig, DataConfig };