import NDK, {
    NDKEvent,
    NDKPrivateKeySigner,
    NDKPublishError,
    NDKRelaySet,
} from '@nostr-dev-kit/ndk'
import mainLogger from '../logger'
import { NostrConfig } from '../config'
import { metrics } from '../metrics'

const logger = mainLogger.child({ module: 'nostr' })

/**
 * Parameterized-replaceable event kind (NIP-01 range 30000–39999). We reuse
 * NIP-78 "application-specific data" (30078) so off-the-shelf Nostr clients
 * and relays treat each (pubkey, kind, d-tag) tuple as a single addressable
 * slot — the relay automatically drops older versions.
 */
export const BTCLOCK_EVENT_KIND = 30078

export type SlotDTag = `price:${string}` | 'blockheight' | 'medianFee'

export interface PriceContext {
    block?: number
    medianFee?: number
}

/**
 * Build the tags array for a slot publish. Pure, side-effect free — exported
 * for unit testing without spinning up NDK.
 */
export function buildSlotTags(
    dTag: SlotDTag,
    source: string,
    extraTags: string[][] = []
): string[][] {
    return [['d', dTag], ['source', source], ...extraTags]
}

export class NostrPublisher {
    protected ndk: NDK
    protected relaySet: NDKRelaySet
    protected publishEnabled: boolean

    constructor() {
        this.publishEnabled = process.env.PUBLISH_TO_NOSTR === 'true'
        const hasKey = Boolean(process.env.NOSTR_PRIV)
        logger.info(
            {
                enabled: this.publishEnabled,
                hasKey,
                relays: NostrConfig.relayUrls,
            },
            'Nostr publisher constructed'
        )
        if (this.publishEnabled && !hasKey) {
            logger.warn('PUBLISH_TO_NOSTR=true but NOSTR_PRIV is not set — publishes will fail')
        }

        const signer = process.env.NOSTR_PRIV
            ? new NDKPrivateKeySigner(process.env.NOSTR_PRIV)
            : undefined

        this.ndk = new NDK({
            explicitRelayUrls: NostrConfig.relayUrls,
            signer,
            enableOutboxModel: false,
            autoConnectUserRelays: false,
            clientName: 'BTClock',
        })

        this.relaySet = NDKRelaySet.fromRelayUrls(NostrConfig.relayUrls, this.ndk, true)

        this.ndk.pool?.on('relay:connect', (relay) => {
            logger.info({ url: relay.url }, 'relay connected')
        })
        this.ndk.pool?.on('relay:disconnect', (relay) => {
            logger.info({ url: relay.url }, 'relay disconnected')
        })
        this.ndk.on('event:publish-failed', (event, error: NDKPublishError) => {
            logger.error(
                { eventId: event.id, publishedToRelays: error.publishedToRelays },
                'event publish failed'
            )
        })
    }

    async connect(): Promise<void> {
        if (!this.publishEnabled) {
            logger.info('publisher disabled (PUBLISH_TO_NOSTR != "true") — skipping connect')
            return
        }
        logger.info({ relays: NostrConfig.relayUrls }, 'connecting to relays')
        await this.ndk.connect()
    }

    private hasRelays(): boolean {
        return (this.ndk.pool?.connectedRelays().length ?? 0) > 0
    }

    /**
     * Publish a slot as a parameterized-replaceable event. The relay
     * automatically retires any older event with the same (pubkey, kind,
     * d-tag) so callers never need a kind-5 delete dance.
     */
    async publishSlot(
        dTag: SlotDTag,
        content: string,
        source: string,
        extraTags: string[][] = []
    ): Promise<boolean> {
        if (!this.publishEnabled) {
            logger.debug({ dTag }, 'publish disabled')
            return false
        }
        if (!this.hasRelays()) {
            logger.warn({ dTag }, 'no relays connected — dropping publish')
            metrics.onNostrPublish(dTag, false)
            return false
        }

        const event = new NDKEvent(this.ndk)
        event.kind = BTCLOCK_EVENT_KIND
        event.content = content
        event.tags = buildSlotTags(dTag, source, extraTags)
        event.created_at = Math.floor(Date.now() / 1000)

        try {
            await event.sign()
            const publishedTo = await event.publish()
            const ok = publishedTo.size > 0
            metrics.onNostrPublish(dTag, ok)
            logger.info(
                {
                    dTag,
                    eventId: event.id,
                    relaysWritten: publishedTo.size,
                    content: content.length > 40 ? `${content.slice(0, 40)}…` : content,
                },
                ok ? 'published' : 'published to zero relays'
            )
            return ok
        } catch (e) {
            metrics.onNostrPublish(dTag, false)
            logger.error(
                { err: e instanceof Error ? e.message : String(e), dTag },
                'publish failed'
            )
            return false
        }
    }

    publishPrice(
        currency: string,
        price: string,
        source: string,
        context: PriceContext = {}
    ): Promise<boolean> {
        const extra: string[][] = []
        if (context.block !== undefined) extra.push(['block', String(context.block)])
        if (context.medianFee !== undefined) extra.push(['medianFee', String(context.medianFee)])
        return this.publishSlot(`price:${currency}`, price, source, extra)
    }

    publishBlockHeight(height: number, source: string): Promise<boolean> {
        return this.publishSlot('blockheight', String(height), source)
    }

    publishMedianFee(fee: number, source: string): Promise<boolean> {
        return this.publishSlot('medianFee', String(fee), source)
    }
}
