require('dotenv').config();
const cron = require('node-cron');
const db = require('./db');
const { initiateCall } = require('./outbound');
const logger = require('./logger');

function startScheduler() {
  cron.schedule('* * * * *', async () => {
    const tasks = db.getPendingScheduled();
    for (const task of tasks) {
      // Atomically claim — skip if another process/tick already claimed it
      if (!db.claimTask(task.id)) {
        logger.warn({ taskId: task.id }, 'scheduler: task already claimed, skipping');
        continue;
      }
      try {
        const webhookBase = process.env.TWILIO_WEBHOOK_BASE || process.env.BASE_URL;
        await initiateCall({ taskId: task.id, phoneNumber: task.phone_number, webhookBase });
        logger.info({ taskId: task.id }, 'scheduler fired task');
      } catch (err) {
        db.updateTaskStatus(task.id, 'failed', err.message);
        logger.error({ taskId: task.id, err: err.message }, 'scheduler failed to initiate call');
      }
    }
  });
  logger.info('scheduler started');
}

module.exports = { startScheduler };
