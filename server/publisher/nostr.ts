import WebSocket from 'ws';
import NDK, { NDKEvent, NDKFilter, NDKPrivateKeySigner } from "@nostr-dev-kit/ndk";
import mainLogger from '../logger';
import { NostrConfig } from '../config';
import * as dotenv from 'dotenv';
import { getPublicKey } from 'nostr-tools';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils' // already an installed dependency

dotenv.config();

const logger = mainLogger.child({ module: "nostr" });

let keySigner = new NDKPrivateKeySigner(process.env.NOSTR_PRIV);

let publishToNostr: boolean = process.env.PUBLISH_TO_NOSTR === "true" ? true : false || false;

logger.info(`Publish to nostr ${publishToNostr}`);

const ndk = new NDK({
    explicitRelayUrls: NostrConfig.relayUrls,
    signer: keySigner,
});

if (publishToNostr) {
    await ndk.connect(6000);

    const filter: NDKFilter = { kinds: [1, 5], authors: [process.env.NOSTR_PUB || getPublicKey(hexToBytes(keySigner.privateKey || ""))] };

    let lastEventId: string = "";

    let subscription = ndk.subscribe(filter);
    subscription.on('event', async (e) => {
        if (e.kind == 1) {
            if (lastEventId.length && e.tags[1][1] == "priceUsd") {
                const ndkEvent = new NDKEvent(ndk);
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

}

const nostrPublishPriceEvent = async (price: number, type: string, source: string, extraTags: any[] = []): Promise<number | false> => {
    let expire = new Date();
    expire.setMinutes(expire.getMinutes() + 1);
    const ndkEvent = new NDKEvent(ndk);
    ndkEvent.kind = 1;
    ndkEvent.content = price.toString();
    ndkEvent.tags = [
        ["expiration", String(Math.floor(expire.getTime() / 1000))],
        ["type", "priceUsd"],
        ["source", source],
        ...extraTags
    ];

    if (publishToNostr) {
        await ndkEvent.publish().then(e => {
            return Date.now() / 1000;
        }).catch(e => {
            logger.error("Error publishing price");
        })
    } else {
        logger.debug("Nostr publishing disabled, not publishing price update", ndkEvent.rawEvent());
    }
    return false;
}

const nostrPublishBlockEvent = async (blockHeight: number, source: string) => {
    let currentDate = Date.now();
    let expire = new Date(currentDate);
    expire.setMinutes(expire.getMinutes() + 240);

    const ndkEvent = new NDKEvent(ndk);

    ndkEvent.kind = 1;
    ndkEvent.created_at = Math.floor(currentDate / 1000);
    ndkEvent.tags = [
        ["expiration", String(Math.floor(expire.getTime() / 1000))],
        ["type", "blockHeight"],
        ["source", "mempoolWS"]
    ];
    ndkEvent.content = String(blockHeight);

    if (publishToNostr) {
        await ndkEvent.publish().then(e => {
        }).catch(e => {
            logger.error("Error publishing block");
        })
    }
    else {
        logger.debug("Nostr publishing disabled, not publishing block update", ndkEvent.rawEvent());
    }
}

export {
    nostrPublishPriceEvent,
    nostrPublishBlockEvent
}