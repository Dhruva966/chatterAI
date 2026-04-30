require('dotenv').config();
const twilio = require('twilio');
const db = require('./db');
const logger = require('./logger');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function initiateCall({ taskId, phoneNumber, webhookBase }) {
  const call = await client.calls.create({
    to: phoneNumber,
    from: process.env.TWILIO_PHONE_NUMBER,
    url: `${webhookBase}/outbound-twiml?taskId=${taskId}`,
    timeout: 30,
    statusCallback: `${webhookBase}/call-status`,
    statusCallbackMethod: 'POST',
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
  });

  db.updateCallSid(taskId, call.sid);
  db.updateTaskStatus(taskId, 'calling');

  return { callSid: call.sid };
}

async function hangUp(callSid) {
  try {
    await client.calls(callSid).update({ status: 'completed' });
  } catch (err) {
    logger.error({ callSid, err: err.message }, 'hangUp failed — call may already be ended');
  }
}

module.exports = { initiateCall, hangUp };
