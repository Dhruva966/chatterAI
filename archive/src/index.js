require('dotenv').config();
const http = require('http');
const app = require('./server');
const logger = require('./logger');

const PORT = process.env.PORT || 3000;
http.createServer(app).listen(PORT, () => {
  logger.info({ port: PORT, env: process.env.NODE_ENV }, 'chatter server started');
});
