require('dotenv').config();
const http = require('http');
const app = require('./server');
const { setupMediaStreamServer } = require('./conference');
const logger = require('./logger');

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

// Attach Twilio Media Streams WebSocket handler (ADR-005, ADR-004)
setupMediaStreamServer(server);

server.listen(PORT, () => {
  logger.info({ port: PORT, env: process.env.NODE_ENV }, 'chatter server started');
});
