import fastify from 'fastify'
import websocket from '@fastify/websocket'
import WebSocket from 'ws';

let lastPrice = 0;

let createExternalWebSocket = () => {
    const ws = new WebSocket("wss://ws.coincap.io/prices?assets=bitcoin");

    ws.on('open', () => {
        console.log('Connected to CoinCap.io');
    });

    ws.on('message', (message) => {
        const messageString = message.toString();
        const jsonMsg = JSON.parse(messageString);

        if (!jsonMsg)
            return;

        if (Math.round(jsonMsg.bitcoin) == lastPrice)
            return;

        lastPrice = Math.round(jsonMsg.bitcoin);

        let output = { "bitcoin": lastPrice }

        console.log(output);
        console.log(`Connected clients: ${clients.size}`)
        for (const client of clients) {
            client.send(JSON.stringify(output));
        }
    });

    ws.on('close', (code, reason) => {
        console.log(`Connection to external WebSocket closed with code ${code} and reason: ${reason}`);
        // Attempt to reconnect after a delay (e.g., 5 seconds)
        setTimeout(createExternalWebSocket, 1000);
    });

    return ws;
}

let externalWebSocket = createExternalWebSocket();

const server = fastify()
const clients: Set<WebSocket> = new Set();

await server.register(websocket);

server.get('/', { websocket: true }, (connection, req) => {
    clients.add(connection.socket);
    console.log(`Connected clients: ${clients.size}`)

    connection.socket.send(JSON.stringify({"bitcoin": lastPrice}))

    connection.socket.on('close', (code, reason) => {
        //console.log(`Connection closed with code ${code} and reason: ${reason}`);
        clients.delete(connection.socket);
    });
})

server.listen({ port: 8080 }, (err, address) => {
    if (err) {
        console.error(err)
        process.exit(1)
    }
    console.log(`Server listening at ${address}`)
})