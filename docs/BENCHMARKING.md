# Benchmarking the Node ws-publisher

Two benches answer different questions; read both.

## 1. In-process broadcast (the stable number)

Measures the publisher's serialize + fan-out cost to N subscribers **on a single core, no sockets, no TCP**. A counter-only fake client removes test-helper overhead.

**Run**

```sh
pnpm exec tsx tests/bench/broadcast.bench.mjs
```

Node's single-threaded fan-out (`for of clients: client.send(frame)`) keeps the entire fan-out on one V8 thread with no locks. This is the **ceiling** for Node — it cannot fan out faster than one core allows.

## 2. External load harness (the hard-to-reproduce number)

Opens N real WebSocket clients against a running server and measures delivery end-to-end. Optional synthetic injection via `POST /api/_inject` (gated by `ENABLE_INJECT=true`) feeds the bus at a controlled rate so throughput isn't upstream-limited.

### What we saw on M2 Max (loopback)

- **N ≤ 500 × ≤ 50 injects/s:** delivers 95–100% of injected events.
- **N = 1000 × 50 injects/s:** noisy — observed 74% delivery, but also 0% on some runs depending on port/fd/scheduling timing.

The noise is real. At 1000 loopback TCP connections × 50 writes/sec the Mac's kernel scheduler, TIME_WAIT behaviour after the previous run, and loopback send-buffer drain become the dominant variables — not the publisher. **Loopback does not reproduce real-world conditions.** Real traffic:

- has variable per-connection RTT (some clients' windows are larger than others)
- spreads across multiple cores naturally (no single kernel struct under contention)
- isn't fighting the same-machine inject client for CPU

### Tuning knobs

Node's backpressure closes clients whose `bufferedAmount` crosses `1_000_000` bytes. Not configurable via env today (the constant is in [server/publisher/ws1.ts](../server/publisher/ws1.ts) and [server/publisher/ws2.ts](../server/publisher/ws2.ts)).

### What the numbers actually say

- **For the typical WS workload (a few hundred clients, ~10 ticks/s),** the server is comfortably within capacity on commodity hardware.
- **For "what happens at 10k clients on production hardware",** the M2 loopback bench here is the wrong tool. Run the harness against the real deployment and a synthetic injector from a separate machine, and measure under real network conditions.

## 3. Synthetic injection endpoint

The server exposes `POST /api/_inject` when `ENABLE_INJECT=true`. Benchmark-only — never mount on a public listener.

**Body shapes**

```json
{ "event": "newPrice", "pair": "USD", "price": "79123.45" }
{ "event": "newBlock", "block": 946999 }
{ "event": "newFee",   "fee": 12.75 }
```

Returns `204 No Content` on success. The event is published to the bus and fans out through the normal publisher path — nothing synthetic about the delivery mechanism, only the source.
