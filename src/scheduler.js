require('dotenv').config();
const cron = require('node-cron');
const db = require('./db');
const { initiateCall } = require('./outbound');
const logger = require('./logger');

function startScheduler() {
  cron.schedule('* * * * *', async () => {
    let tasks;
    try {
      tasks = await db.getPendingScheduled();
    } catch (err) {
      logger.error({ err: err.message }, 'scheduler: failed to fetch pending tasks');
      return;
    }

    for (const task of tasks) {
      const claimed = await db.claimTask(task.id).catch(() => false);
      if (!claimed) {
        logger.warn({ taskId: task.id }, 'scheduler: task already claimed, skipping');
        continue;
      }
      try {
        const webhookBase = process.env.TWILIO_WEBHOOK_BASE || process.env.BASE_URL;
        await initiateCall({ taskId: task.id, phoneNumber: task.phone_number, webhookBase });
        logger.info({ taskId: task.id }, 'scheduler fired task');
      } catch (err) {
        await db.updateTaskStatus(task.id, 'failed', err.message);
        logger.error({ taskId: task.id, err: err.message }, 'scheduler failed to initiate call');
      }
    }
  });
  logger.info('scheduler started');
}

module.exports = { startScheduler };
