# Nostr event format

The server optionally publishes the same data it broadcasts over WebSocket to
Nostr as **parameterized-replaceable events** ([NIP-01], kind range
30000–39999). Consumers can subscribe to any relay in the configured pool and
read the latest value for each datum via a single `REQ`.

Publishing is off by default — set `PUBLISH_TO_NOSTR=true` plus a signing key
and a relay list to enable it. See [Configuration](#configuration) below.

## Kind

**`30078`** — NIP-78 "application-specific data". Chosen because it sits in the
parameterized-replaceable range (`30000 ≤ k ≤ 39999`), which means the relay
automatically retires older events with the same `(pubkey, kind, d)` tuple. No
kind-5 delete dance is needed; the wire simply always holds the latest value
for each slot.

The kind constant is exported from the server and from the browser component
so the two stay aligned:

- [`server/publisher/nostr.ts`](../server/publisher/nostr.ts) — `BTCLOCK_EVENT_KIND`
- [`src/components/NostrTerminal.vue`](../src/components/NostrTerminal.vue) — same literal, in sync with a comment

## Slots (d-tag values)

Every event has exactly one `d` tag that names the slot. Current slots:

| `d` tag       | Content                                      | Emitted when                                | Extra tags                     |
| ------------- | -------------------------------------------- | ------------------------------------------- | ------------------------------ |
| `price:<CCY>` | Latest price as a string (e.g. `"64321.50"`) | The aggregator emits `newPrice` for `<CCY>` | `source`, `block`, `medianFee` |
| `blockheight` | Latest block height as a string              | The mempool upstream emits `newBlock`       | `source`                       |
| `medianFee`   | Latest median fee as a string (sat/vB)       | The mempool upstream emits `newFee`         | `source`                       |

`<CCY>` is the three-letter currency code the aggregator carries (`USD`, `EUR`,
`GBP`, `JPY`, `CAD`, `SGD`, `CHF`, `AUD`). A new currency is automatically
assigned its own slot the first time a price is observed.

## Tags

Every event carries at minimum:

```
["d", "<slot>"]
["source", "<where the data came from>"]
```

`source` values currently emitted by the server:

- `priceAggregate` — output of the `OwnPriceSource` outlier-filtered median.
- `mempoolWS` — data from the mempool WebSocket upstream.

Price events additionally carry the block height and median fee observed at
the instant the price was published, as context for consumers that want to
correlate:

```
["block",     "870123"]
["medianFee", "12"]
```

## Example events

Price:

```json
{
  "kind": 30078,
  "pubkey": "<hex-pubkey>",
  "created_at": 1745323200,
  "content": "64321.50",
  "tags": [
    ["d", "price:USD"],
    ["source", "priceAggregate"],
    ["block", "870123"],
    ["medianFee", "12"]
  ]
}
```

Block height:

```json
{
  "kind": 30078,
  "pubkey": "<hex-pubkey>",
  "created_at": 1745323205,
  "content": "870124",
  "tags": [
    ["d", "blockheight"],
    ["source", "mempoolWS"]
  ]
}
```

Median fee:

```json
{
  "kind": 30078,
  "pubkey": "<hex-pubkey>",
  "created_at": 1745323206,
  "content": "12.75",
  "tags": [
    ["d", "medianFee"],
    ["source", "mempoolWS"]
  ]
}
```

## Subscribing

### NIP-01 REQ (any Nostr client)

```json
["REQ", "sub-id", { "kinds": [30078], "authors": ["<hex-pubkey>"] }]
```

Narrow to a specific slot:

```json
[
  "REQ",
  "sub-id",
  {
    "kinds": [30078],
    "authors": ["<hex-pubkey>"],
    "#d": ["price:USD"]
  }
]
```

### With [`nak`](https://github.com/fiatjaf/nak)

Stream everything for the publisher:

```sh
nak req -k 30078 -a <hex-pubkey> --stream wss://relay.primal.net
```

Stream a single slot:

```sh
nak req -k 30078 -a <hex-pubkey> -d price:USD --stream wss://relay.primal.net
```

### Browser (nostr-tools v2)

```ts
import { SimplePool } from 'nostr-tools'

const pool = new SimplePool()
const sub = pool.subscribeMany(
  ['wss://relay.primal.net', 'wss://nostr.dbtc.link'],
  { kinds: [30078], authors: ['<hex-pubkey>'] }, // single Filter, not an array
  {
    onevent(ev) {
      const dTag = ev.tags.find((t) => t[0] === 'd')?.[1]
      // dispatch on dTag …
    },
  }
)
```

> ⚠️ `subscribeMany` in nostr-tools ≥ 2.20 takes **one** `Filter` object, not
> an array — passing `[{...}]` produces a malformed `REQ` and relays return
> `EOSE` with zero events.

## Configuration

All three variables live in `.env`. None have defaults that will accidentally
publish to a real account.

| Variable           | Required when enabled | Description                                                             |
| ------------------ | --------------------- | ----------------------------------------------------------------------- |
| `PUBLISH_TO_NOSTR` | yes                   | Must be the string `"true"` for publishing to happen at all.            |
| `NOSTR_PRIV`       | yes                   | 64-char hex private key used to sign events.                            |
| `NOSTR_PUB`        | yes (frontend)        | 64-char hex public key. Injected into the browser build for the viewer. |
| `NOSTR_RELAYS`     | no                    | Comma-separated relay URLs. Default: `wss://relay.primal.net`.          |

Generate a test keypair with `nak`:

```sh
NSEC=$(nak key generate)
NPUB=$(echo "$NSEC" | nak key public)
echo "NOSTR_PRIV=$NSEC"
echo "NOSTR_PUB=$NPUB"
```

## Observability

Every publish attempt hits two places:

- **Prometheus** — `btclock_nostr_publishes_total{d_tag, result}` counter on
  the metrics sidecar port (default `9090`).
- **Application log** — `pino` child logger `{"module": "nostr"}`:
  - `info` on relay connect/disconnect and at boot (`enabled`, `hasKey`, relay URLs)
  - `warn` on zero-relay writes, missing key, or missing relays
  - `debug` on each successful publish (silent unless `LOGLEVEL=debug`)
  - `error` on sign/publish exceptions (including the relay IDs that rejected the event)

## Why parameterized-replaceable

The earlier implementation published `kind 1` text notes and ran a separate
`kind 5` delete loop to garbage-collect stale prices. That wastes relay
storage (every tick stored permanently until the delete arrives) and forces
consumers to deduplicate by `created_at`. With kind 30078:

- Each `(d, pubkey)` slot has **exactly one canonical event** at any time.
- Subscribers receive the full current state on connection in one `REQ`.
- No delete events and no client-side throttling — the relay handles churn.
- New slots (e.g. an extra currency) don't need protocol changes; just a new
  `d` value.

[NIP-01]: https://nips.nostr.com/1
