BEGIN;

ALTER TABLE lune_users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'customer';
ALTER TABLE lune_users ADD COLUMN IF NOT EXISTS marketing_opt_in boolean NOT NULL DEFAULT false;

ALTER TABLE lune_partners ADD COLUMN IF NOT EXISTS commission_bps integer NOT NULL DEFAULT 0;
ALTER TABLE lune_partners ADD COLUMN IF NOT EXISTS paystack_recipient_code text;
ALTER TABLE lune_partners ADD COLUMN IF NOT EXISTS settlement_status text NOT NULL DEFAULT 'manual';

ALTER TABLE lune_partner_locations ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE lune_partner_locations ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE lune_partner_locations ADD COLUMN IF NOT EXISTS quality_score numeric(5,2);
ALTER TABLE lune_partner_locations ADD COLUMN IF NOT EXISTS experience_tags text[] NOT NULL DEFAULT ARRAY[]::text[];
ALTER TABLE lune_partner_locations ADD COLUMN IF NOT EXISTS google_maps_url text;
ALTER TABLE lune_partner_locations ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Africa/Nairobi';
ALTER TABLE lune_partner_locations ADD COLUMN IF NOT EXISTS acceptance_mode text NOT NULL DEFAULT 'manual';
ALTER TABLE lune_partner_locations ADD COLUMN IF NOT EXISTS booking_notice_minutes integer NOT NULL DEFAULT 60;

ALTER TABLE lune_work_items ADD COLUMN IF NOT EXISTS service_code text;
ALTER TABLE lune_inspo_items ADD COLUMN IF NOT EXISTS service_code text;

ALTER TABLE lune_orders ADD COLUMN IF NOT EXISTS customer_name text;
ALTER TABLE lune_orders ADD COLUMN IF NOT EXISTS customer_email text;
ALTER TABLE lune_orders ADD COLUMN IF NOT EXISTS customer_phone text;
ALTER TABLE lune_orders ADD COLUMN IF NOT EXISTS requested_area text;
ALTER TABLE lune_orders ADD COLUMN IF NOT EXISTS requested_latitude numeric(10,7);
ALTER TABLE lune_orders ADD COLUMN IF NOT EXISTS requested_longitude numeric(10,7);
ALTER TABLE lune_orders ADD COLUMN IF NOT EXISTS duration_minutes integer NOT NULL DEFAULT 90;
ALTER TABLE lune_orders ADD COLUMN IF NOT EXISTS service_code text;
ALTER TABLE lune_orders ADD COLUMN IF NOT EXISTS force_preferred_location boolean NOT NULL DEFAULT false;
ALTER TABLE lune_orders ADD COLUMN IF NOT EXISTS subtotal_kes integer;
ALTER TABLE lune_orders ADD COLUMN IF NOT EXISTS discount_kes integer NOT NULL DEFAULT 0;
ALTER TABLE lune_orders ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'KES';
ALTER TABLE lune_orders ADD COLUMN IF NOT EXISTS allocation_deadline timestamptz;
ALTER TABLE lune_orders ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
ALTER TABLE lune_orders ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE lune_orders ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE lune_orders ADD COLUMN IF NOT EXISTS cancellation_reason text;
ALTER TABLE lune_orders ADD COLUMN IF NOT EXISTS source_order_id text REFERENCES lune_orders(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS lune_services (
  code text PRIMARY KEY,
  title text NOT NULL,
  description text,
  base_price_kes integer NOT NULL CHECK (base_price_kes >= 0),
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 15 AND 480),
  capabilities text[] NOT NULL DEFAULT ARRAY[]::text[],
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO lune_services (code,title,description,base_price_kes,duration_minutes,capabilities)
VALUES
('natural_gel','Natural gel','Clean prep and gel on natural nails.',400,75,ARRAY['natural_gel']),
('extensions','Extensions','Tip extensions with shape and gel finish.',800,120,ARRAY['extensions']),
('structured','Structured set','Structured overlay or Gumgel reinforcement.',1000,105,ARRAY['gumgel']),
('art_3d_chrome','3D + chrome','Sculpted art, chrome or dimensional finishing.',1200,150,ARRAY['3d','chrome']),
('pedicure','Gel pedicure','Prep and gel finish for toes.',400,75,ARRAY['pedicure'])
ON CONFLICT (code) DO UPDATE SET
  title=EXCLUDED.title,
  description=EXCLUDED.description,
  base_price_kes=EXCLUDED.base_price_kes,
  duration_minutes=EXCLUDED.duration_minutes,
  capabilities=EXCLUDED.capabilities,
  updated_at=now();

UPDATE lune_work_items SET service_code = CASE
  WHEN lower(category) LIKE '%pedicure%' THEN 'pedicure'
  WHEN lower(category) LIKE '%3d%' OR lower(style) LIKE '%chrome%' OR lower(style) LIKE '%3d%' THEN 'art_3d_chrome'
  WHEN lower(category) LIKE '%gumgel%' THEN 'structured'
  WHEN lower(category) LIKE '%tips%' THEN 'extensions'
  ELSE 'natural_gel'
END WHERE service_code IS NULL;

UPDATE lune_inspo_items SET service_code = CASE
  WHEN lower(coalesce(finish,'')) LIKE '%3d%' OR lower(coalesce(finish,'')) LIKE '%chrome%' THEN 'art_3d_chrome'
  WHEN lower(coalesce(structure,'')) LIKE '%gumgel%' THEN 'structured'
  WHEN lower(coalesce(structure,'')) LIKE '%tips%' OR lower(category) LIKE '%tips%' THEN 'extensions'
  ELSE 'natural_gel'
END WHERE service_code IS NULL;

CREATE TABLE IF NOT EXISTS lune_partner_members (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES lune_users(id) ON DELETE CASCADE,
  partner_id text NOT NULL REFERENCES lune_partners(id) ON DELETE CASCADE,
  location_id text REFERENCES lune_partner_locations(id) ON DELETE SET NULL,
  role text NOT NULL DEFAULT 'manager',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, partner_id)
);

CREATE INDEX IF NOT EXISTS lune_partner_members_user_idx ON lune_partner_members(user_id);

CREATE TABLE IF NOT EXISTS lune_order_allocations (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES lune_orders(id) ON DELETE CASCADE,
  partner_id text NOT NULL REFERENCES lune_partners(id) ON DELETE CASCADE,
  location_id text NOT NULL REFERENCES lune_partner_locations(id) ON DELETE CASCADE,
  technician_id text REFERENCES lune_technicians(id) ON DELETE SET NULL,
  score numeric(8,5) NOT NULL DEFAULT 0,
  distance_km numeric(8,2),
  status text NOT NULL DEFAULT 'pending',
  reason jsonb NOT NULL DEFAULT '{}'::jsonb,
  offered_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  responded_at timestamptz,
  response_note text
);

CREATE INDEX IF NOT EXISTS lune_allocations_order_idx ON lune_order_allocations(order_id, offered_at DESC);
CREATE INDEX IF NOT EXISTS lune_allocations_partner_idx ON lune_order_allocations(partner_id, status, offered_at DESC);
CREATE INDEX IF NOT EXISTS lune_allocations_expiry_idx ON lune_order_allocations(status, expires_at);

CREATE TABLE IF NOT EXISTS lune_order_events (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES lune_orders(id) ON DELETE CASCADE,
  actor_kind text NOT NULL DEFAULT 'system',
  actor_id text,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lune_order_events_order_idx ON lune_order_events(order_id, created_at);

CREATE TABLE IF NOT EXISTS lune_payments (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES lune_orders(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'paystack',
  reference text UNIQUE NOT NULL,
  access_code text,
  provider_transaction_id text,
  amount_kes integer NOT NULL CHECK (amount_kes >= 0),
  currency text NOT NULL DEFAULT 'KES',
  status text NOT NULL DEFAULT 'initialized',
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  initialized_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lune_payments_order_idx ON lune_payments(order_id, initialized_at DESC);

CREATE TABLE IF NOT EXISTS lune_refunds (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES lune_orders(id) ON DELETE CASCADE,
  payment_id text NOT NULL REFERENCES lune_payments(id) ON DELETE CASCADE,
  provider_refund_id text,
  amount_kes integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reason text,
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lune_partner_payouts (
  id text PRIMARY KEY,
  order_id text UNIQUE NOT NULL REFERENCES lune_orders(id) ON DELETE CASCADE,
  partner_id text NOT NULL REFERENCES lune_partners(id) ON DELETE CASCADE,
  gross_kes integer NOT NULL,
  commission_kes integer NOT NULL DEFAULT 0,
  adjustment_kes integer NOT NULL DEFAULT 0,
  net_kes integer NOT NULL,
  status text NOT NULL DEFAULT 'held',
  provider_reference text UNIQUE,
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  payable_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lune_payouts_partner_idx ON lune_partner_payouts(partner_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS lune_partner_notifications (
  id text PRIMARY KEY,
  partner_id text REFERENCES lune_partners(id) ON DELETE CASCADE,
  location_id text REFERENCES lune_partner_locations(id) ON DELETE CASCADE,
  order_id text REFERENCES lune_orders(id) ON DELETE CASCADE,
  allocation_id text REFERENCES lune_order_allocations(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'email',
  type text NOT NULL,
  recipient text,
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lune_partner_notifications_pending_idx ON lune_partner_notifications(status, created_at);

CREATE TABLE IF NOT EXISTS lune_reviews (
  id text PRIMARY KEY,
  order_id text UNIQUE NOT NULL REFERENCES lune_orders(id) ON DELETE CASCADE,
  user_id text REFERENCES lune_users(id) ON DELETE SET NULL,
  visitor_id text REFERENCES lune_visitors(id) ON DELETE SET NULL,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lune_offers (
  id text PRIMARY KEY,
  code text UNIQUE NOT NULL,
  title text NOT NULL,
  copy text,
  rule jsonb NOT NULL DEFAULT '{}'::jsonb,
  reward jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 0,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lune_offer_assignments (
  id text PRIMARY KEY,
  offer_id text NOT NULL REFERENCES lune_offers(id) ON DELETE CASCADE,
  user_id text REFERENCES lune_users(id) ON DELETE CASCADE,
  visitor_id text REFERENCES lune_visitors(id) ON DELETE CASCADE,
  reason text,
  status text NOT NULL DEFAULT 'available',
  created_at timestamptz NOT NULL DEFAULT now(),
  viewed_at timestamptz,
  dismissed_at timestamptz,
  redeemed_at timestamptz
);

CREATE INDEX IF NOT EXISTS lune_offer_assignments_user_idx ON lune_offer_assignments(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS lune_offer_assignments_visitor_idx ON lune_offer_assignments(visitor_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS lune_admin_audit (
  id text PRIMARY KEY,
  user_id text REFERENCES lune_users(id) ON DELETE SET NULL,
  action text NOT NULL,
  object_type text,
  object_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lune_admin_audit_created_idx ON lune_admin_audit(created_at DESC);

COMMIT;
