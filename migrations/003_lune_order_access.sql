BEGIN;
ALTER TABLE lune_orders ADD COLUMN IF NOT EXISTS access_token_hash text;
ALTER TABLE lune_orders ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE lune_orders ADD COLUMN IF NOT EXISTS referral_code text;
CREATE INDEX IF NOT EXISTS lune_orders_access_token_idx ON lune_orders(access_token_hash) WHERE access_token_hash IS NOT NULL;
COMMIT;
