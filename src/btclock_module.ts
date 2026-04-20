import type { InjectionKey } from 'vue'

export interface BTClockModule {
    parseBlockHeight(blockHeight: number): string[]
    parseBlockFees(blockFees: number): string[]
    parseHalvingCountdown(blockHeight: number, asBlocks: boolean): string[]
    parseBitcoinSupply(blockHeight: number, bigChars: boolean, showPercentage: boolean): string[]
    parseMarketCap(
        blockHeight: number,
        price: number,
        currencySymbol: string,
        bigChars: boolean
    ): string[]
    parsePriceData(
        price: number,
        currencySymbol: string,
        useSuffixFormat: boolean,
        mowMode: boolean,
        shareDot: boolean
    ): string[]
    parseSatsPerCurrency(
        price: number,
        currencySymbol: string,
        withSatsSymbol: boolean,
        useMscwTime: boolean
    ): string[]
}

export type BTClockCall =
    | { method: 'parseBlockHeight'; data: number; params?: readonly [] }
    | { method: 'parseBlockFees'; data: number; params?: readonly [] }
    | { method: 'parseHalvingCountdown'; data: number; params: readonly [asBlocks: boolean] }
    | {
          method: 'parseBitcoinSupply'
          data: number
          params: readonly [bigChars: boolean, showPercentage: boolean]
      }
    | {
          method: 'parseMarketCap'
          data: number
          params: readonly [price: number, currencySymbol: string, bigChars: boolean]
      }
    | {
          method: 'parsePriceData'
          data: number
          params: readonly [
              currencySymbol: string,
              useSuffixFormat: boolean,
              mowMode: boolean,
              shareDot: boolean,
          ]
      }
    | {
          method: 'parseSatsPerCurrency'
          data: number
          params: readonly [currencySymbol: string, withSatsSymbol: boolean, useMscwTime: boolean]
      }

export const MODULE_KEY: InjectionKey<BTClockModule | undefined> = Symbol('BTClockModule')

export function invokeBTClock(mod: BTClockModule, call: BTClockCall): string[] {
    switch (call.method) {
        case 'parseBlockHeight':
            return mod.parseBlockHeight(call.data)
        case 'parseBlockFees':
            return mod.parseBlockFees(call.data)
        case 'parseHalvingCountdown':
            return mod.parseHalvingCountdown(call.data, ...call.params)
        case 'parseBitcoinSupply':
            return mod.parseBitcoinSupply(call.data, ...call.params)
        case 'parseMarketCap':
            return mod.parseMarketCap(call.data, ...call.params)
        case 'parsePriceData':
            return mod.parsePriceData(call.data, ...call.params)
        case 'parseSatsPerCurrency':
            return mod.parseSatsPerCurrency(call.data, ...call.params)
    }
}
