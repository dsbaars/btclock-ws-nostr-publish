import EventEmitter from 'node:events'
import type WebSocket from 'ws'

/**
 * EventEmitter-backed stand-in for a `ws` WebSocket. Publishers only ever
 * call `send`, `on`, `close`, plus read `bufferedAmount` / `readyState` for
 * backpressure, so we stub exactly that. `send` accumulates into `sent` so
 * tests can assert on the frames emitted.
 */
export class FakeSocket extends EventEmitter {
    public sent: unknown[] = []
    /** Simulated queued bytes; tests bump this to trigger backpressure. */
    public bufferedAmount: number | undefined = undefined
    /** Simulated socket state; undefined keeps the pre-backpressure tests happy. */
    public readyState: number | undefined = undefined
    /** Captured close frame — `[code, reason]` — for backpressure assertions. */
    public closeFrame: { code: number; reason: string } | undefined

    send(payload: unknown) {
        this.sent.push(payload)
    }

    close(code?: number, reason?: string) {
        if (code !== undefined) {
            this.closeFrame = { code, reason: reason ?? '' }
        }
        this.emit('close', code ?? 1000, Buffer.from(reason ?? ''))
    }

    sentJson(): unknown[] {
        return this.sent.map((s) => JSON.parse(String(s)))
    }

    simulateMessage(data: unknown) {
        this.emit('message', data)
    }
}

export function asWs(socket: FakeSocket): WebSocket {
    return socket as unknown as WebSocket
}
