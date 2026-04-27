require('dotenv').config();

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'tasks.db'));
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    description TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    call_sid TEXT,
    status TEXT DEFAULT 'pending',
    result TEXT,
    scheduled_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS transcripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL REFERENCES tasks(id),
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    ts DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_tasks_call_sid ON tasks(call_sid);
  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
`);

// Additive migrations — safe to re-run (SQLite throws on duplicate column, we catch it)
const migrate = (sql) => { try { db.exec(sql); } catch (_) { /* column already exists */ } };
migrate('ALTER TABLE tasks ADD COLUMN agent_type TEXT DEFAULT "generic"');
migrate('ALTER TABLE tasks ADD COLUMN agent_mode TEXT');
migrate('ALTER TABLE tasks ADD COLUMN user_context TEXT');
migrate('ALTER TABLE tasks ADD COLUMN business_name TEXT');
migrate('ALTER TABLE tasks ADD COLUMN location_hint TEXT');

const stmts = {
  insertTask: db.prepare(`
    INSERT INTO tasks (description, phone_number, scheduled_at, agent_type, agent_mode, user_context, business_name, location_hint)
    VALUES (@description, @phone_number, @scheduled_at, @agent_type, @agent_mode, @user_context, @business_name, @location_hint)
    RETURNING *
  `),
  updateCallSid: db.prepare(`
    UPDATE tasks SET call_sid = ? WHERE id = ?
  `),
  updateTaskStatus: db.prepare(`
    UPDATE tasks SET status = ?, result = COALESCE(?, result) WHERE id = ?
  `),
  getTask: db.prepare(`
    SELECT * FROM tasks WHERE id = ?
  `),
  listTasks: db.prepare(`
    SELECT * FROM tasks ORDER BY created_at DESC
  `),
  insertTranscript: db.prepare(`
    INSERT INTO transcripts (task_id, role, content) VALUES (?, ?, ?)
  `),
  getTranscripts: db.prepare(`
    SELECT * FROM transcripts WHERE task_id = ? ORDER BY ts ASC
  `),
  getPendingScheduled: db.prepare(`
    SELECT * FROM tasks
    WHERE status = 'pending'
      AND scheduled_at IS NOT NULL
      AND scheduled_at <= datetime('now')
    ORDER BY scheduled_at ASC
    LIMIT 10
  `),
  // Atomically claim a pending scheduled task — prevents double-fire across concurrent runs
  claimScheduledTask: db.prepare(`
    UPDATE tasks SET status = 'calling'
    WHERE id = ? AND status = 'pending'
  `),
  countActive: db.prepare(`
    SELECT COUNT(*) AS count FROM tasks WHERE status = 'calling'
  `),
  getTaskByCallSid: db.prepare(`SELECT * FROM tasks WHERE call_sid = ? LIMIT 1`),
};

function createTask({
  description,
  phone_number,
  scheduled_at = null,
  agent_type = 'generic',
  agent_mode = null,
  user_context = null,
  business_name = null,
  location_hint = null,
}) {
  return stmts.insertTask.get({
    description, phone_number, scheduled_at,
    agent_type, agent_mode, user_context, business_name, location_hint,
  });
}

function updateCallSid(id, callSid) {
  stmts.updateCallSid.run(callSid, id);
}

// result=undefined preserves the existing result value (COALESCE in SQL)
// result=null explicitly clears it — pass undefined to preserve
function updateTaskStatus(id, status, result = undefined) {
  const r = stmts.updateTaskStatus.run(status, result !== undefined ? result : null, id);
  if (r.changes === 0) {
    // Task not found — not fatal but worth knowing
  }
}

// Returns true if the task was successfully claimed (status was still 'pending')
function claimTask(id) {
  return stmts.claimScheduledTask.run(id).changes === 1;
}

function getTask(id) {
  const task = stmts.getTask.get(id);
  if (!task) return null;
  task.transcripts = stmts.getTranscripts.all(id);
  return task;
}

function listTasks() {
  return stmts.listTasks.all();
}

function addTranscript(taskId, role, content) {
  stmts.insertTranscript.run(taskId, role, content);
}

function getTranscripts(taskId) {
  return stmts.getTranscripts.all(taskId);
}

function getPendingScheduled() {
  return stmts.getPendingScheduled.all();
}

function countActive() {
  return stmts.countActive.get().count;
}

function getTaskByCallSid(callSid) {
  return stmts.getTaskByCallSid.get(callSid) || null;
}

module.exports = {
  createTask,
  updateCallSid,
  updateTaskStatus,
  claimTask,
  getTask,
  listTasks,
  addTranscript,
  getTranscripts,
  getPendingScheduled,
  countActive,
  getTaskByCallSid,
};
