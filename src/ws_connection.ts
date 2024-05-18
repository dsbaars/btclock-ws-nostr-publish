import { EventEmitter } from "events";

export class WsConnection extends EventEmitter {
    private instance: WebSocket | null = null;
//    protected url!: String;

    constructor(protected url: string) {
        super();
    }

    open() {
        this.instance = new WebSocket(this.url);

        if (!this.instance)
            return;

        this.instance.onopen = ((event) => {
            this.onOpen();
        });

        this.instance.onmessage = ((event) => {
            this.onMessage(event.data);
        });


        this.instance.onerror = ((event) => {
            this.onError(event);
        });

        this.instance.onclose = ((event) => {
            console.log(event.code);
            this.onClose();
            this.reconnect();
        });
    }

    send(data: string) {
        this.instance?.send(data);
    }

    reconnect() {
        this.instance = null;
        setTimeout(() => {
            this.open();
        }, 1000);

        this.emit('reconnect');
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