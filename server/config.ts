import { TupleType } from 'typescript'
import { BitfinexPriceSource } from './price-sources/bitfinex-ws'
import { BitflyerPriceSource } from './price-sources/bitflyer-ws'
import { CoinbasePriceSource } from './price-sources/coinbase-ws'
import { GeminiPriceSource } from './price-sources/gemini-ws'
import { KrakenPriceSource } from './price-sources/kraken-ws'
import { WsPriceSource } from './price-sources/ws-price-source'
import { Data } from 'ws'

/**
 * Relay list for the Nostr publisher. Override at runtime with
 * `NOSTR_RELAYS=wss://a,wss://b` (comma-separated). Default is a single
 * well-maintained public relay that accepts kind 30078 writes.
 */
const DEFAULT_NOSTR_RELAYS = ['wss://relay.primal.net']

const NostrConfig = {
    relayUrls: (process.env.NOSTR_RELAYS?.split(',').map((s) => s.trim()).filter(Boolean) ??
        DEFAULT_NOSTR_RELAYS) as string[],
}

const krakenMultiCurrency = new KrakenPriceSource('BTC/USD')
//let coinbaseMultiCurrency = new CoinbasePriceSource('BTC/USD');
//let bitflyerMultiCurrency = new BitflyerPriceSource();
//let geminiMultiCurrency = new GeminiPriceSource();

type DataConfigType = {
    [key: string]: {
        [key: string]: WsPriceSource
    }
}

const DataConfig: DataConfigType = {
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
    gbpSources: {},
}

export { NostrConfig, DataConfig }
