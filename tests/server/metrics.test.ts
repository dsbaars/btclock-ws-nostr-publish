import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { classifyUa, createMetrics, createMetricsServer } from '../../server/metrics'

describe('Prometheus metrics sidecar', () => {
    let server: FastifyInstance
    let bundle: ReturnType<typeof createMetrics>

    beforeEach(async () => {
        bundle = createMetrics()
        server = await createMetricsServer(bundle)
    })

    afterEach(async () => {
        await server.close()
    })

    it('serves /metrics as Prometheus text format', async () => {
        const res = await server.inject({ method: 'GET', url: '/metrics' })
        expect(res.statusCode).toBe(200)
        expect(res.headers['content-type']).toContain('text/plain')
        expect(res.body).toContain('# HELP')
        expect(res.body).toContain('# TYPE')
    })

    it('registers every counter/gauge/histogram named in §3.7', async () => {
        // Warm up every metric so it appears in the text output even at zero.
        bundle.sink.onConnect('v1', 'btclock-firmware')
        bundle.sink.onConnect('v2', 'web-frontend')
        bundle.sink.onDisconnect('v1', 'client_close')
        bundle.sink.onFanout('v2', 'price', 1, 12, 0.001)
        bundle.sink.onBackpressureDrop('v1')
        bundle.sink.onSubscriptionChange('price', 'USD', 1)
        bundle.sink.onNostrPublish('price:USD', true)

        const res = await server.inject({ method: 'GET', url: '/metrics' })
        const body = res.body

        const required = [
            'btclock_ws_connected_clients',
            'btclock_ws_connections_total',
            'btclock_ws_disconnections_total',
            'btclock_ws_messages_sent_total',
            'btclock_ws_bytes_sent_total',
            'btclock_ws_backpressure_drops_total',
            'btclock_ws_subscriptions_active',
            'btclock_ws_fanout_duration_seconds',
            'btclock_ws_clients_by_ua_total',
            'btclock_nostr_publishes_total',
        ]
        for (const name of required) {
            expect(body, `expected metric ${name}`).toContain(name)
        }
    })

    it('/healthz returns ok for HAProxy checks', async () => {
        const res = await server.inject({ method: 'GET', url: '/healthz' })
        expect(res.statusCode).toBe(200)
        expect(res.body).toBe('ok')
    })

    it('classifyUa buckets user-agents into the three coarse classes', () => {
        expect(classifyUa('BTClock/1.2.3 (ESP32)')).toBe('btclock-firmware')
        expect(classifyUa('Mozilla/5.0 (Macintosh) Chrome/120')).toBe('web-frontend')
        expect(classifyUa('curl/8.5.0')).toBe('other')
        expect(classifyUa(undefined)).toBe('other')
    })
})
