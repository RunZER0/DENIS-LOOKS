BEGIN;

ALTER TABLE lune_partner_locations ADD COLUMN IF NOT EXISTS quality_tier text NOT NULL DEFAULT 'review';
ALTER TABLE lune_partner_locations ADD COLUMN IF NOT EXISTS quality_reviewed_at timestamptz;
ALTER TABLE lune_partner_locations ADD COLUMN IF NOT EXISTS quality_review_notes text;
ALTER TABLE lune_orders ADD COLUMN IF NOT EXISTS experience_fee_kes integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS lune_partner_applications (
  id text PRIMARY KEY,
  studio_name text NOT NULL,
  contact_name text NOT NULL,
  email text NOT NULL,
  phone text,
  area text,
  address text,
  team_size integer,
  portfolio_url text,
  instagram_url text,
  services text[] NOT NULL DEFAULT ARRAY[]::text[],
  client_experience text,
  select_interest boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','reviewing','accepted','not_now')),
  review_notes text,
  reviewed_by text REFERENCES lune_users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lune_partner_applications_status_idx ON lune_partner_applications(status,created_at DESC);

COMMIT;
