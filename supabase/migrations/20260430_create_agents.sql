-- agents table: stores custom AI agent configurations per user
CREATE TABLE IF NOT EXISTS agents (
  id            TEXT        PRIMARY KEY DEFAULT encode(gen_random_bytes(8), 'hex'),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  agent_type    TEXT        NOT NULL DEFAULT 'generic',
  voice         TEXT        NOT NULL DEFAULT 'aura-asteria-en',
  system_prompt TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own agents"
  ON agents FOR ALL USING (auth.uid() = user_id);
