import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildSlotTags, BTCLOCK_EVENT_KIND, NostrPublisher } from '../../server/publisher/nostr'
import { createMetrics, setMetricsSink } from '../../server/metrics'

const originalEnv = process.env.PUBLISH_TO_NOSTR

describe('§3.5 Nostr parameterized-replaceable publisher', () => {
    beforeEach(() => {
        setMetricsSink(createMetrics().sink)
    })

    afterEach(() => {
        if (originalEnv === undefined) delete process.env.PUBLISH_TO_NOSTR
        else process.env.PUBLISH_TO_NOSTR = originalEnv
    })

    describe('buildSlotTags', () => {
        it('always emits d and source as the first two tags', () => {
            const tags = buildSlotTags('price:USD', 'coinbase')
            expect(tags).toEqual([
                ['d', 'price:USD'],
                ['source', 'coinbase'],
            ])
        })

        it('appends extra context tags after d + source', () => {
            const tags = buildSlotTags('price:USD', 'coinbase', [
                ['block', '870000'],
                ['medianFee', '12'],
            ])
            expect(tags).toEqual([
                ['d', 'price:USD'],
                ['source', 'coinbase'],
                ['block', '870000'],
                ['medianFee', '12'],
            ])
        })

        it('accepts non-price d-tags', () => {
            expect(buildSlotTags('blockheight', 'mempoolWS')[0]).toEqual(['d', 'blockheight'])
            expect(buildSlotTags('medianFee', 'mempoolWS')[0]).toEqual(['d', 'medianFee'])
        })
    })

    describe('BTCLOCK_EVENT_KIND', () => {
        it('falls inside NIP-01 parameterized-replaceable range (30000–39999)', () => {
            expect(BTCLOCK_EVENT_KIND).toBeGreaterThanOrEqual(30000)
            expect(BTCLOCK_EVENT_KIND).toBeLessThan(40000)
        })
    })

    describe('publish gating', () => {
        it('returns false without attempting a publish when PUBLISH_TO_NOSTR is unset', async () => {
            delete process.env.PUBLISH_TO_NOSTR
            const pub = new NostrPublisher()
            const ok = await pub.publishPrice('USD', '64000', 'coinbase')
            expect(ok).toBe(false)
        })

        it('returns false without attempting a publish when PUBLISH_TO_NOSTR=false', async () => {
            process.env.PUBLISH_TO_NOSTR = 'false'
            const pub = new NostrPublisher()
            const ok = await pub.publishBlockHeight(870000, 'mempoolWS')
            expect(ok).toBe(false)
        })

        it('connect() is a no-op when publish is disabled (no relay connection attempted)', async () => {
            delete process.env.PUBLISH_TO_NOSTR
            const pub = new NostrPublisher()
            await expect(pub.connect()).resolves.toBeUndefined()
        })
    })

    describe('convenience wrappers construct correct d-tags', () => {
        it('publishPrice builds price:<CCY> dTag and includes context tags', async () => {
            delete process.env.PUBLISH_TO_NOSTR
            const pub = new NostrPublisher()
            // Spy on publishSlot via method replacement — lightweight.
            const captured: unknown[] = []
            ;(pub as unknown as { publishSlot: (...args: unknown[]) => Promise<boolean> })
                .publishSlot = async (...args: unknown[]) => {
                    captured.push(args)
                    return true
                }
            await pub.publishPrice('EUR', '59000', 'kraken', { block: 870001, medianFee: 13 })
            expect(captured[0]).toEqual([
                'price:EUR',
                '59000',
                'kraken',
                [
                    ['block', '870001'],
                    ['medianFee', '13'],
                ],
            ])
        })

        it('publishPrice omits context tags when not supplied', async () => {
            const pub = new NostrPublisher()
            const captured: unknown[] = []
            ;(pub as unknown as { publishSlot: (...args: unknown[]) => Promise<boolean> })
                .publishSlot = async (...args: unknown[]) => {
                    captured.push(args)
                    return true
                }
            await pub.publishPrice('USD', '64000', 'coinbase')
            expect(captured[0]).toEqual(['price:USD', '64000', 'coinbase', []])
        })

        it('publishBlockHeight uses blockheight dTag', async () => {
            const pub = new NostrPublisher()
            const captured: unknown[] = []
            ;(pub as unknown as { publishSlot: (...args: unknown[]) => Promise<boolean> })
                .publishSlot = async (...args: unknown[]) => {
                    captured.push(args)
                    return true
                }
            await pub.publishBlockHeight(870000, 'mempoolWS')
            expect(captured[0]).toEqual(['blockheight', '870000', 'mempoolWS'])
        })

        it('publishMedianFee uses medianFee dTag', async () => {
            const pub = new NostrPublisher()
            const captured: unknown[] = []
            ;(pub as unknown as { publishSlot: (...args: unknown[]) => Promise<boolean> })
                .publishSlot = async (...args: unknown[]) => {
                    captured.push(args)
                    return true
                }
            await pub.publishMedianFee(12.75, 'mempoolWS')
            expect(captured[0]).toEqual(['medianFee', '12.75', 'mempoolWS'])
        })
    })
})
