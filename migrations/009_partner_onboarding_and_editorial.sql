BEGIN;

ALTER TABLE lune_partner_applications
  ADD COLUMN IF NOT EXISTS partner_id text REFERENCES lune_partners(id) ON DELETE SET NULL;
ALTER TABLE lune_partner_applications
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

CREATE INDEX IF NOT EXISTS lune_partner_applications_partner_idx
  ON lune_partner_applications(partner_id)
  WHERE partner_id IS NOT NULL;

COMMIT;
