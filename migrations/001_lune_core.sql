create table if not exists lune_identities (
  id uuid primary key,
  kind text not null default 'anonymous' check (kind in ('anonymous', 'member')),
  first_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists lune_identities_email_unique
  on lune_identities (lower(email))
  where email is not null;

create table if not exists lune_sessions (
  token_hash text primary key,
  identity_id uuid not null references lune_identities(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists lune_sessions_identity_idx on lune_sessions(identity_id);
create index if not exists lune_sessions_expires_idx on lune_sessions(expires_at);

create table if not exists lune_nail_sets (
  id text primary key,
  title text not null,
  category text not null,
  style text not null,
  description text not null default '',
  price_kes integer not null check (price_kes >= 0),
  image_url text not null,
  tags text[] not null default '{}',
  likes integer not null default 0 check (likes >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists lune_inspo_items (
  id text primary key,
  image_url text not null,
  category text not null,
  style text not null,
  tags text[] not null default '{}',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists lune_saved_work (
  identity_id uuid not null references lune_identities(id) on delete cascade,
  set_id text not null references lune_nail_sets(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (identity_id, set_id)
);

create table if not exists lune_saved_inspo (
  identity_id uuid not null references lune_identities(id) on delete cascade,
  inspo_id text not null references lune_inspo_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (identity_id, inspo_id)
);

create table if not exists lune_taste_events (
  id bigserial primary key,
  identity_id uuid not null references lune_identities(id) on delete cascade,
  client_event_key text not null,
  kind text not null check (kind in ('work', 'inspo')),
  item_id text not null,
  action text not null check (action in ('open', 'save', 'unsave', 'share', 'book')),
  weight numeric(8,3) not null default 0,
  features text[] not null default '{}',
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (identity_id, client_event_key)
);

create index if not exists lune_taste_events_identity_time_idx
  on lune_taste_events(identity_id, occurred_at desc);

insert into lune_nail_sets
  (id, title, category, style, description, price_kes, image_url, tags, likes, sort_order)
values
  ('set_01','Gloss Natural Glaze','Gel Polish','Plain on Natural Nails','Ultra-clean cuticles and prep with a high-gloss glass finish.',400,'nails1.png.png',array['Natural','Minimal','Gloss'],24,1),
  ('set_02','Classic Parisian French','Tips + Gel','Classic French Tips Extension','Crisp curved smile lines over a soft nude base.',800,'nails2.png.png',array['French','Clean','Timeless'],38,2),
  ('set_03','Liquid Chrome & 3D Drops','3D & Chrome Art','3D Sculpted & Chrome Accents','Molten silver chrome with raised glass-like detail.',1200,'nails3.png.png',array['Chrome','3D','Editorial'],52,3),
  ('set_04','Complex 3D Nebula Art','3D & Chrome Art','Complex Arts + Multi-layer 3D','Textured gel swirls with layered chrome accents.',1500,'nails4.png.png',array['3D','Sculpted','Statement'],45,4),
  ('set_05','Blush Centered Ombré','Gel Polish','Centered Ombré Design','A blush centre fading softly into milky quartz.',400,'nails5.png.png',array['Ombre','Blush','Soft'],41,5),
  ('set_06','Soft Nude French Curve','Tips + Gel','Nude French Tips Extension','Almond extensions with a restrained micro-French edge.',1000,'nails6.png.png',array['French','Almond','Nude'],29,6),
  ('set_07','Platinum Mirror Chrome','3D & Chrome Art','3D Chrome Accents','A silver mirror finish with controlled textured accents.',1100,'nails7.png.png',array['Chrome','Mirror','Shine'],33,7),
  ('set_08','Sculpted 3D Moulding','Gumgel Overlays','Chrome 3D & Sculpted Moulding','Structured overlays with dimensional moulding.',1500,'nails8.png.png',array['Structured','3D','Sculpted'],49,8),
  ('set_09','Milky Quartz Natural Ombré','Gel Polish','Ombré on Natural Nails','A seamless milky gradient over natural nails.',400,'nails9.png.png',array['Natural','Ombre','Milky'],27,9),
  ('set_10','Clean Minimalist Chrome','3D & Chrome Art','Simple Chrome Minimal Line Art','Fine chrome ribbons over a translucent nude base.',950,'nails10.png.png',array['Chrome','Minimal','Jelly'],31,10),
  ('set_11','Chrome Stiletto','3D & Chrome Art','Chrome 3D Long Stiletto','Extra-long stiletto extensions with sharp chrome detail.',1800,'nails11.png.png',array['Stiletto','Long','Chrome'],64,11),
  ('set_12','Obsidian Marble & 3D Veins','3D & Chrome Art','Marble Design + 3D Textures','Smoky stone veining layered under dimensional gloss.',1400,'nails12.png.png',array['Marble','3D','Stone'],39,12),
  ('set_13','Sunset Ombré Stiletto','Tips + Gel','Ombré Long Stiletto Extension','A warm gradient on long, sharp stiletto extensions.',1100,'nails13.png.png',array['Ombre','Stiletto','Warm'],42,13),
  ('set_14','Gloss Gel Pedicure','Pedicure','Plain Gel on Toes & Deep Prep','Clean prep finished with a high-gloss gel colour.',400,'nails14.png.png',array['Pedicure','Clean','Gloss'],21,14)
on conflict (id) do update set
  title = excluded.title,
  category = excluded.category,
  style = excluded.style,
  description = excluded.description,
  price_kes = excluded.price_kes,
  image_url = excluded.image_url,
  tags = excluded.tags,
  likes = excluded.likes,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into lune_inspo_items
  (id, image_url, category, style, tags, sort_order)
values
  ('inspo_1','inspo1.png.png','Natural','Minimalist Chic',array['minimal','natural','short'],1),
  ('inspo_2','inspo2.png.png','Natural','Nude Elegance',array['nude','soft','natural'],2),
  ('inspo_3','inspo3.png.png','Chrome','Chrome Artistry',array['chrome','metallic','statement'],3),
  ('inspo_4','inspo4.png.png','Gloss','Plain High-Gloss',array['gloss','clean','simple'],4),
  ('inspo_5','inspo5.png.png','French','Classic French Tips',array['french','clean','timeless'],5),
  ('inspo_6','inspo6.png.png','3D','3D Design Art',array['3d','sculpted','statement'],6),
  ('inspo_7','inspo7.png.png','Chrome','Chrome Effects',array['chrome','structured','metallic'],7),
  ('inspo_8','inspo8.png.png','Structure','Plain Structure',array['structured','clean','neutral'],8),
  ('inspo_9','inspo9.png.png','French','Modern French',array['french','modern','soft'],9),
  ('inspo_10','inspo10.png.png','3D','3D Sculpted Art',array['3d','sculpted','editorial'],10)
on conflict (id) do update set
  image_url = excluded.image_url,
  category = excluded.category,
  style = excluded.style,
  tags = excluded.tags,
  sort_order = excluded.sort_order,
  updated_at = now();
