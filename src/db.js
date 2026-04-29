require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

function genId() {
  return crypto.randomBytes(8).toString('hex');
}

async function createTask({
  description,
  phone_number,
  scheduled_at = null,
  agent_type = 'generic',
  agent_mode = null,
  user_context = null,
  business_name = null,
  location_hint = null,
}, userId) {
  const id = genId();
  const { data, error } = await supabase.from('tasks').insert({
    id,
    user_id: userId,
    description,
    phone_number,
    scheduled_at,
    agent_type,
    agent_mode,
    user_context,
    business_name,
    location_hint,
  }).select().single();
  if (error) throw error;
  return data;
}

async function updateCallSid(id, callSid) {
  const { error } = await supabase.from('tasks').update({ call_sid: callSid }).eq('id', id);
  if (error) throw error;
}

async function updateTaskStatus(id, status, result = undefined) {
  const update = { status };
  if (result !== undefined) update.result = result;
  const { error } = await supabase.from('tasks').update(update).eq('id', id);
  if (error) throw error;
}

// Returns true if claim succeeded (status was still 'pending')
async function claimTask(id) {
  const { data, error } = await supabase.rpc('claim_scheduled_task', { task_id: id });
  if (error) throw error;
  return data === true;
}

async function getTask(id) {
  const { data: task, error } = await supabase.from('tasks').select('*').eq('id', id).single();
  if (error || !task) return null;
  const { data: transcripts } = await supabase
    .from('transcripts').select('*').eq('task_id', id).order('ts', { ascending: true });
  task.transcripts = transcripts || [];
  return task;
}

async function listTasks(userId) {
  const query = supabase.from('tasks').select('*').order('created_at', { ascending: false });
  if (userId) query.eq('user_id', userId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function addTranscript(taskId, role, content) {
  const { error } = await supabase.from('transcripts').insert({ task_id: taskId, role, content });
  if (error) throw error;
}

async function getTranscripts(taskId) {
  const { data, error } = await supabase
    .from('transcripts').select('*').eq('task_id', taskId).order('ts', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function getPendingScheduled() {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('status', 'pending')
    .not('scheduled_at', 'is', null)
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(10);
  if (error) throw error;
  return data || [];
}

async function countActive() {
  const { count, error } = await supabase
    .from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'calling');
  if (error) throw error;
  return count || 0;
}

async function getTaskByCallSid(callSid) {
  const { data, error } = await supabase
    .from('tasks').select('*').eq('call_sid', callSid).limit(1).maybeSingle();
  if (error) throw error;
  return data || null;
}

// Fetch user's personal context from profiles table
async function getUserContext(userId) {
  const { data } = await supabase
    .from('profiles').select('personal_context').eq('id', userId).single();
  return data?.personal_context || {};
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
  getUserContext,
};
