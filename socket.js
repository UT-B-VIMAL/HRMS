const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const app = express();
const server = http.createServer(app); // or https.createServer() if using HTTPS

const wss = new WebSocket.Server({ server, path: '/socket' });

wss.on('connection', (ws, req) => {
  console.log('✅ WebSocket connected');
  ws.send('Hello from server');
});

server.listen(3001, () => {
  console.log('HTTP server running on port 3001');
});
