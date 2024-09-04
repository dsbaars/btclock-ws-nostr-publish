import { EventEmitter } from "events";

export class WsConnection extends EventEmitter {
    private instance: WebSocket | null = null;
    private binaryType: BinaryType;
    private totalBytesReceived = 0;
    private logging = false;
//    protected url!: String;

    constructor(protected url: string, binaryType:BinaryType = 'blob', logging = false) {
        super();
        this.binaryType = binaryType;
        this.logging = logging;
    }

    open() {
        this.instance = new WebSocket(this.url);
        if (this.binaryType != 'blob')
            this.instance.binaryType = this.binaryType;

        if (!this.instance)
            return;

        this.instance.onopen = ((event) => {
            this.onOpen();
        });

        this.instance.onmessage = ((event) => {
            this.onMessage(event.data);

            if (this.logging) {
                let messageSize;

                if (event.data instanceof ArrayBuffer) {
                    // Binary data
                    messageSize = event.data.byteLength;
                } else if (typeof event.data === 'string') {
                    // Text data
                    messageSize = new Blob([event.data]).size;
                } else {
                    // Blob or other data type
                    messageSize = event.data.size;
                }

                this.totalBytesReceived += messageSize;
            }
        });


        this.instance.onerror = ((event) => {
            this.onError(event);
        });

        this.instance.onclose = ((event) => {
            this.onClose();
            this.reconnect();
        });
    }

    send(data: string) {
        this.instance?.send(data);

        this.emit('send', data);
    }

    reconnect() {
        this.instance = null;
        setTimeout(() => {
            this.open();
        }, 1000);

        this.emit('reconnect');
    }

    getBytesReceived() {
        return this.totalBytesReceived;
    }

    private onOpen() {
        this.emit('open');
    }

    private onError(event) {
        this.emit('error', event);
    }

    private onMessage(data) {
        this.emit('message', data);
    }

    private onClose() {
        this.emit('close');
    }
}