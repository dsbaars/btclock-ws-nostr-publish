# Benchmarking Go vs Node

Two benches live in this repo. They answer different questions; read both.

## 1. In-process broadcast (the stable number)

Measures the publisher's serialize + fan-out cost to N subscribers **on a single core, no sockets, no TCP**. A counter-only fake client in both runtimes removes test-helper overhead so we compare apples to apples.

**Run**

```sh
# Go
cd go-server
go test -tags nozmq -bench='Broadcast_N|PriceBroadcast_N' -benchtime=2s -run=^$ ./tests/

# Node
pnpm exec tsx tests/bench/broadcast.bench.mjs
```

**Stable on each run (M2 Max, arm64), same order of magnitude:**

| Scenario | N | Go ns/op | Node ns/op |
|---|---:|---:|---:|
| Ws2 price broadcast | 100 | 1,345 | 782 |
| Ws2 price broadcast | 1,000 | 11,871 | 5,270 |
| Ws2 price broadcast | 5,000 | 55,381 | 22,060 |
| Ws1 price broadcast | 1,000 | 10,852 | 4,868 |
| Ws2 block broadcast | 5,000 | 58,024 | 23,383 |

Node's single-threaded fan-out (`for of clients: client.send(frame)`) wins the in-process bench by ~2.5×. The entire fan-out happens on one V8 thread with no locks, no channel sends, no atomic increments.

This is a **ceiling** for Node. It cannot fan out faster than one core allows. Go hits its ceiling later because each connection's write happens on its own goroutine — the fan-out is parallel across cores.

## 2. External load harness (the hard-to-reproduce number)

Opens N real WebSocket clients against a running server and measures delivery end-to-end. Optional synthetic injection via `POST /api/_inject` (gated by `ENABLE_INJECT=true`) feeds the bus at a controlled rate so throughput isn't upstream-limited.

**Run**

```sh
# Build harness
cd go-server && go build -tags nozmq -o bin/wsbench ./cmd/wsbench && cd ..

# Run both servers back-to-back
N=1000 DURATION=30s INJECT_RATE=50 ./bench_compare.sh
```

Results in `bench-results/{node,go}.{wsbench.json,server.log,server.stats.txt}`.

### What we saw on M2 Max (loopback)

- **N ≤ 500 × ≤ 50 injects/s:** both servers deliver 95–100% of injected events.
- **N = 1000 × 50 injects/s:** noisy — observed 74% delivery on both, but also 0% on some runs of either server, depending on port/fd/scheduling timing.

The noise is real. At 1000 loopback TCP connections × 50 writes/sec the Mac's kernel scheduler, TIME_WAIT behaviour after the previous run, and loopback send-buffer drain become the dominant variables — not the publisher. **Loopback does not reproduce real-world conditions.** Real traffic:

- has variable per-connection RTT (some clients' windows are larger than others)
- spreads across multiple cores naturally (no single kernel struct under contention)
- isn't fighting the same-machine inject client for CPU

### Tuning knobs

Go's per-client backpressure buffer is `256` frames by default (drop-and-close policy, §2.3). For benchmarks that want to isolate pure throughput from the drop policy, set:

```sh
WS_OUTBOUND_BUF=4096 ./go-server/bin/ws-node
```

Don't raise this in production — a 256-frame buffer at 10 KB/frame is already 2.5 MB of queued writes per stuck client. Bigger buffers hide slow consumers and blow memory.

Node's backpressure closes clients whose `bufferedAmount` crosses `1_000_000` bytes. Not configurable via env today (the constant is in [server/publisher/ws1.ts](../server/publisher/ws1.ts) and [server/publisher/ws2.ts](../server/publisher/ws2.ts)).

### What the numbers actually say

- **For the typical WS workload (a few hundred clients, ~10 ticks/s),** both servers are functionally indistinguishable on latency and delivery. Pick the one that fits your ops story.
- **For low-power ARM (Pi 4/5, Pi Zero 2 W),** Go's idle RSS of ~19 MB vs Node's ~54 MB is the deciding number. At scale (thousands of clients) the per-client overhead converges but the baseline stays separated.
- **For "what happens at 10k clients on production hardware",** the M2 loopback bench here is the wrong tool. Run the harness against the real deployment and a synthetic injector from a separate machine, and measure under real network conditions.

## 3. Synthetic injection endpoint

Both servers expose `POST /api/_inject` when `ENABLE_INJECT=true`. Benchmark-only — never mount on a public listener.

**Body shapes**

```json
{ "event": "newPrice", "pair": "USD", "price": "79123.45" }
{ "event": "newBlock", "block": 946999 }
{ "event": "newFee",   "fee": 12.75 }
```

Returns `204 No Content` on success. The event is published to the bus and fans out through the normal publisher path — nothing synthetic about the delivery mechanism, only the source.

`wsbench` drives this automatically when you pass `-inject-url` and `-inject-rate`.
