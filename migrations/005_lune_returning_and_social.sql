BEGIN;

ALTER TABLE lune_orders ADD COLUMN IF NOT EXISTS party_size integer NOT NULL DEFAULT 1 CHECK (party_size BETWEEN 1 AND 6);
ALTER TABLE lune_reviews ADD COLUMN IF NOT EXISTS photo_data_url text;
ALTER TABLE lune_reviews ADD COLUMN IF NOT EXISTS photo_caption text;

CREATE TABLE IF NOT EXISTS lune_pick_sessions (
  id text PRIMARY KEY,
  owner_user_id text REFERENCES lune_users(id) ON DELETE SET NULL,
  owner_visitor_id text REFERENCES lune_visitors(id) ON DELETE SET NULL,
  choices jsonb NOT NULL DEFAULT '[]'::jsonb,
  access_token_hash text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lune_pick_votes (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES lune_pick_sessions(id) ON DELETE CASCADE,
  voter_key_hash text NOT NULL,
  choice_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id,voter_key_hash)
);

CREATE INDEX IF NOT EXISTS lune_pick_votes_session_idx ON lune_pick_votes(session_id,choice_id);
COMMIT;
