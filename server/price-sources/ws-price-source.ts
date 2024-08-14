import { EventEmitter } from "events";

export type PriceUpdate = {
    pair: string,
    price: string
}

export class WsPriceSource extends EventEmitter {

}