import EventEmitter from 'node:events'
import type WebSocket from 'ws'

/**
 * EventEmitter-backed stand-in for a `ws` WebSocket. Publishers only ever
 * call `send`, `on`, and `close` on the socket, so we stub exactly that.
 * `send` accumulates into `sent` so tests can assert on the frames emitted.
 */
export class FakeSocket extends EventEmitter {
    public sent: unknown[] = []

    send(payload: unknown) {
        this.sent.push(payload)
    }

    close() {
        this.emit('close', 1000, Buffer.from(''))
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
