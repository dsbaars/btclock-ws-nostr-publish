# BTClock WS data source

[![CI](https://github.com/dsbaars/btclock-ws-nostr-publish/actions/workflows/ci.yml/badge.svg)](https://github.com/dsbaars/btclock-ws-nostr-publish/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#license)
[![Node.js](https://img.shields.io/badge/node-%E2%89%A524-brightgreen)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-10-orange)](https://pnpm.io)

A lightweight server that aggregates Bitcoin price, block height, and mempool fee data from a handful of public sources and republishes it to BTClock displays (and any other client) over WebSockets and REST.

## Features

- **Aggregated BTC price** from Kraken, Bitfinex, Coinbase, Binance, Gemini, Bitflyer, and CoinCap with outlier filtering and median consensus
- **Block height + median mempool fee** via a mempool.space WebSocket
- **Two WebSocket protocols**:
  - `/api/v1/ws` — legacy JSON broadcast (every client receives every update)
  - `/api/v2/ws` — MessagePack with per-event-type subscriptions
- **REST endpoints** under `/api/*` for simple polling
- **Dev-only Scalar playground** at `/docs` and OpenAPI 3.1 spec at `/openapi.json`

## Quick start

```bash
pnpm install            # install dependencies
cp .env.sample .env     # then fill in the values you need
pnpm build              # compile the frontend
pnpm start              # run the webserver (defaults to http://localhost:8080)
```

For development, `pnpm dev` starts the Fastify server with `tsx watch` (auto-reloads on server changes) and mounts Vite as middleware so Vue edits get hot module replacement without a rebuild.

## Configuration

All runtime configuration is read from `.env` — see [`.env.sample`](.env.sample) for the full list. Highlights:

| Variable                   | Purpose                                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `MEMPOOL_INSTANCE`         | Hostname of the upstream mempool.space WebSocket                                                               |
| `OWN_PRICE_DATA`           | Aggregate prices from the built-in exchange feeds                                                              |
| `LOGLEVEL`                 | pino log level                                                                                                 |
| `NOSTR_PUB` / `NOSTR_PRIV` | Keys used by the optional Nostr publisher                                                                      |
| `PUBLISH_TO_NOSTR`         | Toggle for the Nostr publisher                                                                                 |
| `BTCLOCK_FIRMWARE_SRC`     | Path to a local btclock firmware checkout — only needed to rebuild the WASM data handler via `./emscripten.sh` |

## API documentation

- **REST reference (Scalar, interactive):** [`/docs`](http://localhost:8080/docs) when running locally
- **OpenAPI 3.1 spec:** [`/openapi.json`](http://localhost:8080/openapi.json)
- **WebSocket reference (AsyncAPI + Mermaid):** [docs/API.md](docs/API.md) and [docs/asyncapi.yaml](docs/asyncapi.yaml)

`/docs` and `/openapi.json` are mounted only when `NODE_ENV !== 'production'`. In production both routes return 404; the REST and WebSocket endpoints themselves are unaffected.

## Development

```bash
pnpm lint           # eslint
pnpm format:check   # prettier
pnpm test           # vitest
pnpm build          # production bundle
```

CI runs all four on every push and pull request.

## License

MIT
