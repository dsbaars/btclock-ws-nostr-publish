type DataStorage = {
    lastPrice: Map<string,string>, 
    lastBlock:number, 
    lastMedianFee:number
}

export const DataStorage: DataStorage = {
    lastPrice: new Map<string,string>(), 
    lastBlock: 84000, 
    lastMedianFee: 1
}