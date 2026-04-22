// Direct Node benchmark — avoids vitest bench's tinybench integration,
// which returned empty sample arrays for this workload. Same methodology
// as go-server/tests/bench_test.go: build publisher, attach N fake
// clients, emit one broadcast per iteration, print ns/op.
//
// Run with: pnpm exec tsx tests/bench/broadcast.bench.mjs
import { performance } from 'node:perf_hooks'
import EventEmitter from 'node:events'
import { Encoder } from '@msgpack/msgpack'
import { Ws1Publisher } from '../../server/publisher/ws1.ts'
import { Ws2Publisher } from '../../server/publisher/ws2.ts'
import { DataStorage } from '../../server/storage.ts'
import { FakeSocket } from '../helpers/fake-socket.ts'

// Counter-only replacement for FakeSocket.send — mirrors the Go-side
// NoopClient so both benches measure the publisher's broadcast hot
// path, not the test helper's bookkeeping.
function makeBenchSocket() {
    const sock = new FakeSocket()
    let n = 0
    sock.send = function () {
        n++
    }
    sock.received = () => n
    return sock
}

const encoder = new Encoder()

function seed() {
    DataStorage.lastPrice = new Map()
    DataStorage.lastPrice.set('USD', '79000')
    DataStorage.lastPrice.set('EUR', '67000')
    DataStorage.lastBlock = 946211
    DataStorage.lastMedianFee = 12.5
}

function buildWs2(n) {
    seed()
    const emitter = new EventEmitter()
    const pub = new Ws2Publisher(emitter)
    for (let i = 0; i < n; i++) {
        const sock = makeBenchSocket()
        pub.newClient(sock)
        sock.emit('message', encoder.encode({ type: 'subscribe', eventType: 'price', currency: 'USD' }))
    }
    return emitter
}

function buildWs1(n) {
    seed()
    const emitter = new EventEmitter()
    const pub = new Ws1Publisher(emitter)
    for (let i = 0; i < n; i++) {
        const sock = makeBenchSocket()
        pub.newClient(sock)
    }
    return emitter
}

function buildWs2Block(n) {
    seed()
    const emitter = new EventEmitter()
    const pub = new Ws2Publisher(emitter)
    for (let i = 0; i < n; i++) {
        const sock = makeBenchSocket()
        pub.newClient(sock)
        sock.emit('message', encoder.encode({ type: 'subscribe', eventType: 'blockheight' }))
    }
    return emitter
}

// Run `iters` events, return ns/op.
function measure(setupFn, eventFn, n, iters) {
    const emitter = setupFn(n)
    // Warm.
    for (let i = 0; i < Math.min(iters / 10, 100); i++) eventFn(emitter)
    const t0 = performance.now()
    for (let i = 0; i < iters; i++) eventFn(emitter)
    const wallMs = performance.now() - t0
    return (wallMs * 1e6) / iters
}

// Target ≥1s of wall time per measurement; scale iters per N.
function itersFor(n) {
    if (n <= 200) return 20000
    if (n <= 1200) return 3000
    return 500
}

const scenarios = [
    { label: 'Ws2 price', setup: buildWs2,      fire: (e) => e.emit('newPrice', { pair: 'USD', price: '79001' }) },
    { label: 'Ws1 price', setup: buildWs1,      fire: (e) => e.emit('newPrice', { pair: 'USD', price: '79001' }) },
    { label: 'Ws2 block', setup: buildWs2Block, fire: (e) => { DataStorage.lastBlock += 1; e.emit('newBlock') } },
]

const sizes = [100, 1000, 5000]

console.log(`node ${process.version}  ${process.platform}/${process.arch}`)
console.log('label                N        ns/op')
console.log('-'.repeat(48))
for (const s of scenarios) {
    for (const n of sizes) {
        const iters = itersFor(n)
        const nsPerOp = measure(s.setup, s.fire, n, iters)
        console.log(`${s.label.padEnd(20)} ${String(n).padStart(5)}  ${nsPerOp.toFixed(0).padStart(10)}`)
    }
}
