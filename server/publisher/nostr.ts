import WebSocket from 'ws';
import NDK, { NDKEvent, NDKFilter, NDKPrivateKeySigner, NDKPublishError, NDKRelaySet } from "@nostr-dev-kit/ndk";
import mainLogger from '../logger';
import { NostrConfig } from '../config';
import * as dotenv from 'dotenv';
import { getPublicKey } from 'nostr-tools';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils' // already an installed dependency

dotenv.config();

const logger = mainLogger.child({ module: "nostr" });

let keySigner = new NDKPrivateKeySigner(process.env.NOSTR_PRIV);

let publishToNostr: boolean = process.env.PUBLISH_TO_NOSTR === "true" ? true : false || false;

export class NostrPublisher {
    protected ndk: NDK;
    protected relaySet: NDKRelaySet;

    constructor() {
        logger.info(`Publish to nostr ${publishToNostr}`);



        this.ndk = new NDK({
            explicitRelayUrls: [
                "wss://nostr.dbtc.link",
                "wss://nostr1.daedaluslabs.io",
                "wss://nostr2.daedaluslabs.io",
                "wss://nostr3.daedaluslabs.io",
                // "wss://pablof7z.nostr1.com",
                // "wss://offchain.pub",
                // "wss://relay.f7z.io",
                // "wss://relay.damus.io",
                // "wss://relay.snort.social",
                // "wss://offchain.pub/",
                // "wss://nostr.mom",
                // "wss://nostr-pub.wellorder.net",
                // "wss://purplepag.es",
                // "wss://brb.io/",
            ],
            signer: keySigner,
            enableOutboxModel: false,
            autoConnectUserRelays: false,
            clientName: "BTClock"
        });

        this.relaySet = NDKRelaySet.fromRelayUrls([
            "wss://nostr1.daedaluslabs.io",
            "wss://nostr2.daedaluslabs.io",
            "wss://nostr3.daedaluslabs.io",
        ], this.ndk, true);

        this.ndk.pool?.on("relay:connecting", (relay) => {
            logger.info(`Connecting to relay ${relay.url}`);
        });

        this.ndk.pool?.on("relay:connect", (relay) => {
            logger.info(`Connected to relay ${relay.url}`);
        });

        this.ndk.pool?.on("relay:disconnect", (relay) => {
            logger.info(`Disconnected relay ${relay.url}`);
        });

        this.ndk.on("event:publish-failed", this.handlePublishingFailures);
    }

    handlePublishingFailures(event: NDKEvent, error: NDKPublishError) {
        logger.error(`Event ${event.id} failed to publish`, { publishedToRelays: error.publishedToRelays });
    }

    async connect() {
        if (publishToNostr) {
            this.ndk.connect().then(async () => {
                const filter: NDKFilter = { kinds: [1, 5], authors: ['642317135fd4c4205323b9dea8af3270657e62d51dc31a657c0ec8aab31c6288'] };

                let lastEventId: string = "";

                let subscription = await this.ndk.subscribe(filter, {}, this.relaySet);
                subscription.on('event', async (e) => {
                    if (e.kind == 1) {
                        if (lastEventId.length && e.tags[1][1] == "priceUsd") {
                            const ndkEvent = new NDKEvent(this.ndk);
                            let currentDate = Date.now();

                            ndkEvent.kind = 5;
                            ndkEvent.created_at = Math.floor(currentDate / 1000);
                            ndkEvent.content = "";
                            ndkEvent.tags = [
                                ["e", lastEventId],
                            ];

                            lastEventId = "";
                            if (publishToNostr) {
                                await ndkEvent.publish();
                            } else {
                                logger.debug("Nostr publishing disabled, not publishing delete event");
                            }
                        }

                        lastEventId = e.id;
                    }
                    if (e.kind == 5) {
                    }
                })
            })
        }
    }

    private hasRelays() {
        return this.ndk.pool.connectedRelays().length;
    }

    async nostrPublishPriceEvent(price: number, type: string, source: string, extraTags: any[] = []): Promise<number | false> {
        if (!this.hasRelays())
            return false;

        let expire = new Date();
        expire.setMinutes(expire.getMinutes() + 1);
        const ndkEvent = new NDKEvent(this.ndk);
        ndkEvent.kind = 1;
        ndkEvent.content = price.toString();
        ndkEvent.tags = [
            ["expiration", String(Math.floor(expire.getTime() / 1000))],
            ["type", "priceUsd"],
            ["source", source],
            ...extraTags
        ];

        await ndkEvent.sign();

        if (publishToNostr) {
            try {
                await ndkEvent.publish().then(e => {
                    return Date.now() / 1000;
                }).catch(e => {
                    logger.error("Error publishing price");
                })
            } catch (e: unknown) {
                if (e instanceof NDKPublishError) {
                    logger.error(e);
                }
            }
            return Date.now() / 1000;
        } else {
            logger.debug("Nostr publishing disabled, not publishing price update");
        }
        return false;
    }

    async nostrPublishBlockEvent(blockHeight: number, source: string) {
        if (!this.hasRelays())
            return false;

        let currentDate = Date.now();
        let expire = new Date(currentDate);
        expire.setMinutes(expire.getMinutes() + 240);

        const ndkEvent = new NDKEvent(this.ndk);

        ndkEvent.kind = 1;
        ndkEvent.created_at = Math.floor(currentDate / 1000);
        ndkEvent.tags = [
            ["expiration", String(Math.floor(expire.getTime() / 1000))],
            ["type", "blockHeight"],
            ["source", "mempoolWS"]
        ];
        ndkEvent.content = String(blockHeight);

        if (publishToNostr) {
            try {
                await ndkEvent.publish().then(e => {
                    return Date.now() / 1000;
                }).catch(e => {
                    logger.error("Error publishing block");
                })
            } catch (e: unknown) {
                if (e instanceof NDKPublishError) {
                    logger.error(e);
                }
            }
        }
        else {
            logger.debug("Nostr publishing disabled, not publishing block update");
        }
    }
}

