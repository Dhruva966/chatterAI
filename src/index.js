require('dotenv').config();

const REQUIRED_ENV = [
  'DEEPGRAM_API_KEY',
  'GEMINI_API_KEY',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER',
];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

const { app, server } = require('./server');
const { startScheduler } = require('./scheduler');
const logger = require('./logger');

const PORT = process.env.PORT || 3000;

const webhookBase = process.env.TWILIO_WEBHOOK_BASE || process.env.BASE_URL;
if (!webhookBase) {
  logger.warn('TWILIO_WEBHOOK_BASE not set — Twilio webhooks will fail');
}

server.listen(PORT, () => {
  logger.info({ port: PORT, webhookBase }, 'server started');
  startScheduler();
});
