BEGIN;

CREATE TABLE IF NOT EXISTS lune_partner_work_submissions (
  id text PRIMARY KEY,
  order_id text NOT NULL UNIQUE REFERENCES lune_orders(id) ON DELETE CASCADE,
  partner_id text NOT NULL REFERENCES lune_partners(id) ON DELETE CASCADE,
  submitted_by_user_id text REFERENCES lune_users(id) ON DELETE SET NULL,
  title text NOT NULL,
  category text,
  style text,
  description text,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  image_data_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_note text,
  reviewed_by_user_id text REFERENCES lune_users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  published_work_id text REFERENCES lune_work_items(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE lune_work_items ADD COLUMN IF NOT EXISTS source_order_id text REFERENCES lune_orders(id) ON DELETE SET NULL;
ALTER TABLE lune_work_items ADD COLUMN IF NOT EXISTS partner_submission_id text REFERENCES lune_partner_work_submissions(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS lune_work_items_partner_submission_idx ON lune_work_items(partner_submission_id) WHERE partner_submission_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS lune_partner_work_submissions_partner_idx ON lune_partner_work_submissions(partner_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS lune_partner_work_submissions_review_idx ON lune_partner_work_submissions(status, created_at ASC);

COMMIT;
