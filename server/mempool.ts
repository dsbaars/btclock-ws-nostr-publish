import mempoolJS from '@mempool/mempool.js'
import EventEmitter from 'node:events'
import type pino from 'pino'
import { DataStorage } from './storage.js'

export type MempoolDeps = {
    emitter: EventEmitter
    logger: pino.Logger
    hostname: string
}

export async function bootstrapMempool(deps: MempoolDeps): Promise<void> {
    const { bitcoin: { blocks, fees } } = mempoolJS({ hostname: deps.hostname })
    DataStorage.lastBlock = await blocks.getBlocksTipHeight()
    DataStorage.lastMedianFee = (await fees.getFeesMempoolBlocks())[0].medianFee
}

export function initMempoolWs(deps: MempoolDeps): void {
    const { bitcoin: { websocket } } = mempoolJS({ hostname: deps.hostname })

    const ws = websocket.wsInit()
    websocket.wsWantData(ws, ['blocks', 'mempool-blocks'])

    ws.addEventListener('open', () => {
        deps.logger.info(`Mempool Websocket to ${deps.hostname} open`)
    })

    ws.addEventListener('message', async ({ data }) => {
        const res = JSON.parse(data.toString())

        if (res.block) {
            DataStorage.lastBlock = res.block.height
            deps.emitter.emit('newBlock')
        } else if (res['mempool-blocks']) {
            if (
                (res['mempool-blocks'][0].medianFee >= 10 &&
                    Math.round(res['mempool-blocks'][0].medianFee) == DataStorage.lastMedianFee) ||
                (res['mempool-blocks'][0].medianFee < 10 &&
                    Math.round(res['mempool-blocks'][0].medianFee * 100) / 100 ==
                        DataStorage.lastMedianFee)
            )
                return

            if (res['mempool-blocks'][0].medianFee < 10) {
                DataStorage.lastMedianFee =
                    Math.round(res['mempool-blocks'][0].medianFee * 100) / 100
            } else {
                DataStorage.lastMedianFee = Math.round(res['mempool-blocks'][0].medianFee)
            }
            deps.emitter.emit('newFee')
        }
    })

    ws.on('close', (code, reason) => {
        deps.logger.info(`Connection to mempool closed with code ${code} and reason: ${reason}`)
        setTimeout(() => initMempoolWs(deps), 1000)
    })
}
