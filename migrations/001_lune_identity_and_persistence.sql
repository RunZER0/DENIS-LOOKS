BEGIN;

CREATE TABLE IF NOT EXISTS lune_users (
  id text PRIMARY KEY,
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  display_name text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lune_visitors (
  id text PRIMARY KEY,
  anonymous_key text UNIQUE NOT NULL,
  user_id text REFERENCES lune_users(id) ON DELETE SET NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS lune_visitors_user_idx ON lune_visitors(user_id);

CREATE TABLE IF NOT EXISTS lune_user_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES lune_users(id) ON DELETE CASCADE,
  token_hash text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lune_sessions_user_idx ON lune_user_sessions(user_id);
CREATE INDEX IF NOT EXISTS lune_sessions_expiry_idx ON lune_user_sessions(expires_at);

CREATE TABLE IF NOT EXISTS lune_saved_items (
  owner_kind text NOT NULL CHECK (owner_kind IN ('visitor','user')),
  owner_id text NOT NULL,
  item_kind text NOT NULL CHECK (item_kind IN ('work','inspo')),
  item_id text NOT NULL,
  is_saved boolean NOT NULL DEFAULT true,
  item_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_kind, owner_id, item_kind, item_id)
);

CREATE INDEX IF NOT EXISTS lune_saved_owner_idx ON lune_saved_items(owner_kind, owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS lune_taste_events (
  event_id text PRIMARY KEY,
  visitor_id text NOT NULL REFERENCES lune_visitors(id) ON DELETE CASCADE,
  user_id text REFERENCES lune_users(id) ON DELETE SET NULL,
  session_key text,
  item_kind text NOT NULL CHECK (item_kind IN ('work','inspo')),
  item_id text NOT NULL,
  action text NOT NULL,
  weight numeric(10,4) NOT NULL DEFAULT 0,
  features text[] NOT NULL DEFAULT ARRAY[]::text[],
  surface text,
  source text,
  dwell_ms integer,
  bucket text,
  rank integer,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lune_taste_visitor_idx ON lune_taste_events(visitor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS lune_taste_user_idx ON lune_taste_events(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS lune_taste_item_idx ON lune_taste_events(item_kind, item_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS lune_recommendation_impressions (
  id text PRIMARY KEY,
  event_id text UNIQUE REFERENCES lune_taste_events(event_id) ON DELETE CASCADE,
  visitor_id text NOT NULL REFERENCES lune_visitors(id) ON DELETE CASCADE,
  user_id text REFERENCES lune_users(id) ON DELETE SET NULL,
  item_kind text NOT NULL CHECK (item_kind IN ('work','inspo')),
  item_id text NOT NULL,
  surface text NOT NULL,
  bucket text,
  rank integer,
  shown_at timestamptz NOT NULL,
  engaged_action text,
  engaged_at timestamptz
);

CREATE INDEX IF NOT EXISTS lune_reco_visitor_idx ON lune_recommendation_impressions(visitor_id, shown_at DESC);
CREATE INDEX IF NOT EXISTS lune_reco_user_idx ON lune_recommendation_impressions(user_id, shown_at DESC);
CREATE INDEX IF NOT EXISTS lune_reco_item_idx ON lune_recommendation_impressions(item_kind, item_id, surface, shown_at DESC);

CREATE TABLE IF NOT EXISTS lune_work_items (
  id text PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  category text,
  style text,
  description text,
  image_url text NOT NULL,
  price_kes integer,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  popularity_score numeric(10,4) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lune_inspo_items (
  id text PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  category text,
  image_url text NOT NULL,
  shape text,
  length text,
  finish text,
  palette text,
  structure text,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  editorial_score numeric(10,4) NOT NULL DEFAULT 0.5,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lune_partners (
  id text PRIMARY KEY,
  name text NOT NULL,
  legal_name text,
  email text,
  phone text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','paused','suspended','rejected')),
  quality_score numeric(5,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lune_partner_locations (
  id text PRIMARY KEY,
  partner_id text NOT NULL REFERENCES lune_partners(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text NOT NULL,
  area text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  experience_tier text NOT NULL DEFAULT 'standard',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lune_locations_partner_idx ON lune_partner_locations(partner_id);

CREATE TABLE IF NOT EXISTS lune_technicians (
  id text PRIMARY KEY,
  partner_id text NOT NULL REFERENCES lune_partners(id) ON DELETE CASCADE,
  location_id text REFERENCES lune_partner_locations(id) ON DELETE SET NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  quality_score numeric(5,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lune_technician_capabilities (
  technician_id text NOT NULL REFERENCES lune_technicians(id) ON DELETE CASCADE,
  capability text NOT NULL,
  level integer NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 5),
  certified_at timestamptz,
  PRIMARY KEY (technician_id, capability)
);

CREATE TABLE IF NOT EXISTS lune_availability (
  id text PRIMARY KEY,
  technician_id text REFERENCES lune_technicians(id) ON DELETE CASCADE,
  location_id text NOT NULL REFERENCES lune_partner_locations(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','held','booked','blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS lune_availability_lookup_idx ON lune_availability(location_id, status, starts_at);

CREATE TABLE IF NOT EXISTS lune_orders (
  id text PRIMARY KEY,
  user_id text REFERENCES lune_users(id) ON DELETE SET NULL,
  visitor_id text REFERENCES lune_visitors(id) ON DELETE SET NULL,
  item_kind text CHECK (item_kind IN ('work','inspo','custom')),
  item_id text,
  item_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  preferred_location_id text REFERENCES lune_partner_locations(id) ON DELETE SET NULL,
  allocated_location_id text REFERENCES lune_partner_locations(id) ON DELETE SET NULL,
  allocated_technician_id text REFERENCES lune_technicians(id) ON DELETE SET NULL,
  experience_preference text,
  scheduled_for timestamptz,
  status text NOT NULL DEFAULT 'draft',
  amount_kes integer,
  payment_status text NOT NULL DEFAULT 'unpaid',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lune_orders_user_idx ON lune_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lune_orders_visitor_idx ON lune_orders(visitor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lune_orders_status_idx ON lune_orders(status, created_at DESC);

INSERT INTO lune_work_items (id,slug,title,category,style,description,image_url,price_kes,tags,popularity_score)
VALUES
('set_01','gloss-natural-glaze','Gloss Natural Glaze','Gel Polish','Plain on Natural Nails','Ultra-clean cuticles and prep with high-gloss non-chip glass topcoat.','nails1.png.png',400,ARRAY['GelPolish','NaturalNails','Minimalist','Glossy'],24),
('set_02','classic-parisian-french','Classic Parisian French','Tips + Gel','Classic French Tips Extension','Crisp white curved smile lines with flawless natural nude base.','nails2.png.png',800,ARRAY['FrenchTips','TipsGel','Timeless','CleanGirl'],38),
('set_03','liquid-chrome-3d-drops','Liquid Chrome & 3D Drops','3D & Chrome Art','3D Sculpted & Chrome Accents','Futuristic molten silver chrome with raised 3D glass raindrops.','nails3.png.png',1200,ARRAY['Chrome','3DArt','Editorial','Molten'],52),
('set_04','complex-3d-nebula-art','Complex 3D Nebula Art','3D & Chrome Art','Complex Arts + Multi-layer 3D','Handcrafted textured 3D gel swirls with celestial chrome accents.','nails4.png.png',1500,ARRAY['3DArt','Signature','ComplexDesign','Luxury'],45),
('set_05','blush-centered-aura-ombre','Blush Centered Aura Ombré','Gel Polish','Centered Ombré Design','Airbrushed aura glow fading outwards from deep rose to milky quartz.','nails5.png.png',400,ARRAY['Aura','Ombre','Blush','AirbrushLook'],41),
('set_06','soft-nude-french-curve','Soft Nude French Curve','Tips + Gel','Nude French Tips Extension','Almond shaped extensions with modern micro-french nude borders.','nails6.png.png',1000,ARRAY['NudeFrench','Almond','TipsGel','SubtleLuxury'],29),
('set_07','platinum-mirror-chrome','Platinum Mirror Chrome','3D & Chrome Art','3D Chrome Accents','High-specular silver mirror finish with custom textured accents.','nails7.png.png',1100,ARRAY['MirrorChrome','Platinum','Trendy','Shine'],33),
('set_08','sculpted-3d-moulding','Sculpted 3D Moulding','Gumgel Overlays','Chrome 3D & Sculpted Moulding','Heavy structural Gumgel overlays with dimensional moulding art.','nails8.png.png',1500,ARRAY['Gumgel','Sculpted','Moulding','HeavyArt'],49),
('set_09','milky-quartz-natural-ombre','Milky Quartz Natural Ombré','Gel Polish','Ombre on Natural Nails','Seamless gradient transition on healthy reinforced natural nails.','nails9.png.png',400,ARRAY['NaturalNails','MilkyOmbre','Minimal','Gel'],27),
('set_10','clean-minimalist-chrome','Clean Minimalist Chrome','3D & Chrome Art','Simple Chrome Minimal Line Art','Single chrome line ribbons over translucent nude jelly base.','nails10.png.png',950,ARRAY['Chrome','Minimalist','JellyNails','Modern'],31),
('set_11','cyberpunk-chrome-stiletto','Cyberpunk Chrome Stiletto','3D & Chrome Art','Chrome 3D Long Stiletto','Extra long stiletto extensions with sharp chrome claw details.','nails11.png.png',1800,ARRAY['Stiletto','LongNails','Chrome','Baddie'],64),
('set_12','obsidian-marble-3d-veins','Obsidian Marble & 3D Veins','3D & Chrome Art','Marble Design + 3D Textures','Smoky quartz and obsidian stone veining layered under 3D gloss.','nails12.png.png',1400,ARRAY['Marble','3D','StoneArt','Luxury'],39),
('set_13','sunset-glow-ombre-stiletto','Sunset Glow Ombré Stiletto','Tips + Gel','Ombre Long Stiletto Extension','Fiery sunset aura ombre blended to perfection on sharp stilettos.','nails13.png.png',1100,ARRAY['Ombre','Stiletto','SunsetGlow','Vibrant'],42),
('set_14','luxe-russian-gel-pedicure','Luxe Russian Gel Pedicure','Pedicure','Plain Gel on Toes & Deep Prep','Clean cuticle transformation and high-gloss gel pedicure.','nails14.png.png',400,ARRAY['Pedicure','Toes','CleanPrep','Gloss'],21)
ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, category=EXCLUDED.category, style=EXCLUDED.style, description=EXCLUDED.description, image_url=EXCLUDED.image_url, price_kes=EXCLUDED.price_kes, tags=EXCLUDED.tags, popularity_score=EXCLUDED.popularity_score, updated_at=now();

INSERT INTO lune_inspo_items (id,slug,title,category,image_url,finish,structure,tags,editorial_score)
VALUES
('inspo_1','minimalist-chic','Minimalist Chic','Gel: Natural','inspo1.png.png','minimal','natural',ARRAY['minimal','natural'],1.00),
('inspo_2','nude-elegance','Nude Elegance','Gel: Natural','inspo2.png.png','nude','natural',ARRAY['nude','clean'],0.95),
('inspo_3','chrome-artistry','Chrome Artistry','Tips + Gel','inspo3.png.png','chrome','tips',ARRAY['chrome','editorial'],0.98),
('inspo_4','plain-high-gloss','Plain High-Gloss','Tips + Gel','inspo4.png.png','gloss','tips',ARRAY['gloss','clean'],0.82),
('inspo_5','classic-french-tips','Classic French Tips','Tips + Gel','inspo5.png.png','french','tips',ARRAY['french','classic'],0.94),
('inspo_6','3d-design-art','3D Design Art','Tips + Gel','inspo6.png.png','3d','tips',ARRAY['3d','sculpted'],0.97),
('inspo_7','chrome-effects','Chrome Effects','Gumgel: Natural','inspo7.png.png','chrome','gumgel',ARRAY['chrome','gumgel'],0.91),
('inspo_8','plain-structure','Plain Structure','Gumgel + Tips','inspo8.png.png','gloss','gumgel',ARRAY['structured','clean'],0.80),
('inspo_9','modern-french','Modern French','Gumgel: Natural','inspo9.png.png','french','gumgel',ARRAY['french','modern'],0.96),
('inspo_10','3d-sculpted-art','3D Sculpted Art','Gumgel + Tips','inspo10.png.png','3d','gumgel',ARRAY['3d','sculpted','editorial'],0.93)
ON CONFLICT (id) DO UPDATE SET slug=EXCLUDED.slug, title=EXCLUDED.title, category=EXCLUDED.category, image_url=EXCLUDED.image_url, finish=EXCLUDED.finish, structure=EXCLUDED.structure, tags=EXCLUDED.tags, editorial_score=EXCLUDED.editorial_score, updated_at=now();

COMMIT;
