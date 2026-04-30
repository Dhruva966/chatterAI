#!/usr/bin/env node
'use strict';

/**
 * cli.js — Submit a task to the running Chatter server and stream the transcript live.
 *
 * Usage:
 *   node src/cli.js "Call +1-650-555-1234 and order a large taro boba for pickup at 5pm"
 *   node src/cli.js "Call +1-650-555-1234 and book a haircut" --at "2026-04-26T17:00"
 */

const http = require('http');
const https = require('https');
const process = require('process');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;
const POLL_INTERVAL_MS = 2000;
const TIMEOUT_MS = 180_000;

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.error([
    'Usage:',
    '  node src/cli.js "<request>"',
    '  node src/cli.js "<request>" --at "<ISO8601 datetime>"',
    '',
    'Examples:',
    '  node src/cli.js "Call +1-650-555-1234 and order a large taro boba for pickup at 5pm"',
    '  node src/cli.js "Call +1-650-555-1234 and book a haircut" --at "2026-04-26T17:00"',
  ].join('\n'));
  process.exit(1);
}

let request = null;
let scheduledAt = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--at' && args[i + 1]) {
    scheduledAt = args[i + 1];
    i++;
  } else if (!request) {
    request = args[i];
  }
}

if (!request) {
  console.error('Error: request string is required as the first positional argument.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// HTTP helpers (built-in only, no axios/node-fetch)
// ---------------------------------------------------------------------------

function httpRequest(method, url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;

    const payload = body ? JSON.stringify(body) : null;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', (err) => {
      if (err.code === 'ECONNREFUSED') {
        console.error(`Server not running at localhost:${PORT}. Start with: npm start`);
        process.exit(1);
      }
      reject(err);
    });

    if (payload) req.write(payload);
    req.end();
  });
}

function get(path) {
  return httpRequest('GET', `${BASE_URL}${path}`, null);
}

function post(path, body) {
  return httpRequest('POST', `${BASE_URL}${path}`, body);
}

// ---------------------------------------------------------------------------
// Transcript printer
// ---------------------------------------------------------------------------

let lastSeenIndex = 0;

function printNewLines(transcript) {
  if (!Array.isArray(transcript)) return;
  const newLines = transcript.slice(lastSeenIndex);
  for (const line of newLines) {
    const role = (line.role || 'unknown').toUpperCase();
    const padded = role === 'USER' ? '[USER] ' : '[AGENT]';
    console.log(`${padded} ${line.content}`);
  }
  lastSeenIndex = transcript.length;
}

// ---------------------------------------------------------------------------
// Polling loop
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollUntilDone(taskId) {
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    const { status, body } = await get(`/tasks/${taskId}`);

    if (status !== 200) {
      console.error(`Unexpected response polling task: HTTP ${status}`);
      process.exit(1);
    }

    const task = body;
    const taskStatus = task.status;

    // Print any new transcript lines
    printNewLines(task.transcripts);

    if (taskStatus === 'completed') {
      console.log('\n--- Call completed ---');
      if (task.result) console.log('Result:', task.result);
      process.exit(0);
    }

    if (taskStatus === 'failed') {
      console.error('\n--- Call failed ---');
      if (task.result) console.error('Result:', task.result);
      process.exit(1);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  console.error('Timed out waiting for call to complete');
  process.exit(1);
}

async function waitUntilCalling(taskId) {
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    const { status, body } = await get(`/tasks/${taskId}`);

    if (status !== 200) {
      console.error(`Unexpected response polling task: HTTP ${status}`);
      process.exit(1);
    }

    const taskStatus = body.status;

    if (taskStatus === 'calling') {
      return;
    }

    if (taskStatus === 'failed') {
      console.error('\n--- Task failed before call started ---');
      if (body.result) console.error('Result:', body.result);
      process.exit(1);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  console.error('Timed out waiting for call to start');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const taskBody = { request };
  if (scheduledAt) taskBody.scheduled_at = scheduledAt;

  let createRes;
  try {
    createRes = await post('/tasks', taskBody);
  } catch (err) {
    console.error('Failed to create task:', err.message);
    process.exit(1);
  }

  if (createRes.status !== 200 && createRes.status !== 201) {
    console.error(`Server returned HTTP ${createRes.status}:`, createRes.body);
    process.exit(1);
  }

  const task = createRes.body;
  const taskId = task.id;

  console.log(`Task ID : ${taskId}`);
  console.log(`Status  : ${task.status}`);

  if (task.status === 'pending' && task.scheduled_at) {
    console.log(`Scheduled for ${task.scheduled_at}. Watching...`);
    await waitUntilCalling(taskId);
    console.log('Call started. Streaming transcript...\n');
  } else if (task.status === 'calling') {
    console.log('Call already in progress. Streaming transcript...\n');
  } else if (task.status === 'completed') {
    console.log('Task already completed.');
    printNewLines(task.transcripts);
    if (task.result) console.log('Result:', task.result);
    process.exit(0);
  } else if (task.status === 'failed') {
    console.error('Task failed.');
    if (task.result) console.error('Result:', task.result);
    process.exit(1);
  } else {
    // Any other status (e.g. queued) — wait until calling
    console.log('Waiting for call to start...');
    await waitUntilCalling(taskId);
    console.log('Call started. Streaming transcript...\n');
  }

  await pollUntilDone(taskId);
}

main().catch((err) => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
