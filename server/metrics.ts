import client from 'prom-client'
import fastify, { FastifyInstance } from 'fastify'
import type pino from 'pino'

export type Proto = 'v1' | 'v2'
export type EventType = 'blockheight' | 'blockfee' | 'blockfee2' | 'price' | 'control'
export type UaClass = 'btclock-firmware' | 'web-frontend' | 'other'
export type DisconnectReason = 'client_close' | 'backpressure' | 'error'

/**
 * Tiny indirection so publishers (ws1.ts / ws2.ts) don't import prom-client
 * directly and stay trivially unit-testable. The real implementation is set
 * via `initMetrics`; before that every hook is a no-op.
 */
export interface MetricsSink {
    onConnect(proto: Proto, uaClass: UaClass): void
    onDisconnect(proto: Proto, reason: DisconnectReason): void
    onMessageSent(proto: Proto, eventType: EventType, bytes: number): void
    onBackpressureDrop(proto: Proto): void
    onFanout(
        proto: Proto,
        eventType: Exclude<EventType, 'control'>,
        sent: number,
        bytesPerFrame: number,
        durationSeconds: number
    ): void
    onSubscriptionChange(eventType: string, currency: string | undefined, delta: number): void
    onNostrPublish(dTag: string, ok: boolean): void
}

const noopSink: MetricsSink = {
    onConnect: () => {},
    onDisconnect: () => {},
    onMessageSent: () => {},
    onBackpressureDrop: () => {},
    onFanout: () => {},
    onSubscriptionChange: () => {},
    onNostrPublish: () => {},
}

export const metrics: MetricsSink = new Proxy({} as MetricsSink, {
    get(_t, prop) {
        const target = current as unknown as Record<PropertyKey, unknown>
        return target[prop]
    },
})

let current: MetricsSink = noopSink

/** Replace the active sink. Exported primarily for tests. */
export function setMetricsSink(sink: MetricsSink) {
    current = sink
}

export function classifyUa(ua: string | undefined): UaClass {
    if (!ua) return 'other'
    if (/btclock/i.test(ua)) return 'btclock-firmware'
    if (/mozilla|chrome|safari|firefox|edge|webkit/i.test(ua)) return 'web-frontend'
    return 'other'
}

export type MetricsBundle = {
    registry: client.Registry
    sink: MetricsSink
    /** For test introspection. */
    gauges: {
        connected: client.Gauge<'proto'>
        subscriptionsActive: client.Gauge<'event_type' | 'currency'>
    }
    counters: {
        connections: client.Counter<'proto'>
        disconnections: client.Counter<'proto' | 'reason'>
        messagesSent: client.Counter<'proto' | 'event_type'>
        bytesSent: client.Counter<'proto'>
        backpressureDrops: client.Counter<'proto'>
        clientsByUa: client.Counter<'proto' | 'ua_class'>
        nostrPublishes: client.Counter<'d_tag' | 'result'>
    }
    histograms: {
        fanoutDuration: client.Histogram<'proto' | 'event_type'>
    }
}

/** Build a fresh MetricsBundle with its own Registry (no global pollution). */
export function createMetrics(): MetricsBundle {
    const registry = new client.Registry()
    client.collectDefaultMetrics({ register: registry, prefix: 'btclock_node_' })

    const connected = new client.Gauge({
        name: 'btclock_ws_connected_clients',
        help: 'Current WebSocket connections per protocol',
        labelNames: ['proto'],
        registers: [registry],
    })
    const subscriptionsActive = new client.Gauge({
        name: 'btclock_ws_subscriptions_active',
        help: 'Active subscriptions per event type / currency (v2 only)',
        labelNames: ['event_type', 'currency'],
        registers: [registry],
    })
    const connections = new client.Counter({
        name: 'btclock_ws_connections_total',
        help: 'Lifetime WebSocket connections per protocol',
        labelNames: ['proto'],
        registers: [registry],
    })
    const disconnections = new client.Counter({
        name: 'btclock_ws_disconnections_total',
        help: 'Lifetime disconnects per protocol and reason',
        labelNames: ['proto', 'reason'],
        registers: [registry],
    })
    const messagesSent = new client.Counter({
        name: 'btclock_ws_messages_sent_total',
        help: 'Messages broadcast to clients per protocol and event type',
        labelNames: ['proto', 'event_type'],
        registers: [registry],
    })
    const bytesSent = new client.Counter({
        name: 'btclock_ws_bytes_sent_total',
        help: 'Bytes broadcast to clients per protocol',
        labelNames: ['proto'],
        registers: [registry],
    })
    const backpressureDrops = new client.Counter({
        name: 'btclock_ws_backpressure_drops_total',
        help: 'Sockets closed due to exceeding the backpressure limit',
        labelNames: ['proto'],
        registers: [registry],
    })
    const clientsByUa = new client.Counter({
        name: 'btclock_ws_clients_by_ua_total',
        help: 'Connections bucketed by coarse User-Agent class',
        labelNames: ['proto', 'ua_class'],
        registers: [registry],
    })
    const nostrPublishes = new client.Counter({
        name: 'btclock_nostr_publishes_total',
        help: 'Nostr publish outcomes per d-tag',
        labelNames: ['d_tag', 'result'],
        registers: [registry],
    })
    const fanoutDuration = new client.Histogram({
        name: 'btclock_ws_fanout_duration_seconds',
        help: 'Time to serialize + fan out one event to all subscribers',
        labelNames: ['proto', 'event_type'],
        buckets: [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
        registers: [registry],
    })

    const sink: MetricsSink = {
        onConnect(proto, uaClass) {
            connections.inc({ proto })
            connected.inc({ proto })
            clientsByUa.inc({ proto, ua_class: uaClass })
        },
        onDisconnect(proto, reason) {
            disconnections.inc({ proto, reason })
            connected.dec({ proto })
        },
        onMessageSent(proto, eventType, bytes) {
            messagesSent.inc({ proto, event_type: eventType })
            bytesSent.inc({ proto }, bytes)
        },
        onBackpressureDrop(proto) {
            backpressureDrops.inc({ proto })
        },
        onFanout(proto, eventType, sent, bytesPerFrame, durationSeconds) {
            if (sent > 0) {
                messagesSent.inc({ proto, event_type: eventType }, sent)
                bytesSent.inc({ proto }, sent * bytesPerFrame)
            }
            fanoutDuration.observe({ proto, event_type: eventType }, durationSeconds)
        },
        onSubscriptionChange(eventType, currency, delta) {
            subscriptionsActive.inc({ event_type: eventType, currency: currency ?? '' }, delta)
        },
        onNostrPublish(dTag, ok) {
            nostrPublishes.inc({ d_tag: dTag, result: ok ? 'ok' : 'fail' })
        },
    }

    return {
        registry,
        sink,
        gauges: { connected, subscriptionsActive },
        counters: {
            connections,
            disconnections,
            messagesSent,
            bytesSent,
            backpressureDrops,
            clientsByUa,
            nostrPublishes,
        },
        histograms: { fanoutDuration },
    }
}

/**
 * Create the sidecar Fastify instance that exposes `/metrics` on its own port
 * so HAProxy health checks and Prometheus scraping don't share the app socket.
 */
export async function createMetricsServer(
    bundle: MetricsBundle,
    logger?: pino.Logger
): Promise<FastifyInstance> {
    const server = fastify({ logger: false })

    server.get('/metrics', async (_req, reply) => {
        reply.type(bundle.registry.contentType)
        return bundle.registry.metrics()
    })

    server.get('/healthz', async (_req, reply) => {
        reply.type('text/plain').send('ok')
    })

    if (logger) server.log = logger as unknown as typeof server.log
    return server
}
