import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: process.env.GATEWAY_PORT || 4001 });

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'HELLO', ts: Date.now() }));
  ws.on('message', (raw) => {
    // TODO: AUTH and SUBSCRIBE_CHANNEL handling + ACL checks
    ws.send(JSON.stringify({ type: 'ACK', received: true }));
  });
});

console.log('gateway listening');
