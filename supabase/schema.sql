-- Forward Thinking Co content engine schema.
-- Run in the Supabase SQL editor. All access is via the service key from the
-- server, so RLS is enabled with no policies (anon/authenticated get nothing).

create extension if not exists pgcrypto;

create table if not exists posts (
  id            uuid primary key default gen_random_uuid(),
  date          date not null,
  pillar        text not null check (pillar in ('TOOL','SAVEABLE','TEARDOWN','HABITS','TESTED')),
  topic_key     text not null unique,
  hook          text not null,
  content       jsonb not null,
  image_urls    text[] not null default '{}',
  caption       text,
  status        text not null default 'draft'
                check (status in ('draft','approved','rejected','scheduled','published','failed')),
  ig_media_id   text,
  source_url    text,
  variant       jsonb not null default '{}'::jsonb, -- {cover_type, hook_style, slide_count, cta_type, mascot_used}
  created_at    timestamptz not null default now(),
  published_at  timestamptz
);
create index if not exists posts_date_idx on posts (date);
create index if not exists posts_status_idx on posts (status);

create table if not exists raw_notes (
  id          uuid primary key default gen_random_uuid(),
  text        text not null,
  image_url   text,
  used        boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists reference_posts (
  id       uuid primary key default gen_random_uuid(),
  post_id  uuid references posts(id) on delete set null,
  pillar   text not null check (pillar in ('TOOL','SAVEABLE','TEARDOWN','HABITS','TESTED')),
  hook     text not null,
  slides   jsonb not null,
  status   text not null check (status in ('approved','rejected','winner','loser')),
  note     text,
  created_at timestamptz not null default now()
);
-- Migration for projects created before this column existed:
alter table reference_posts add column if not exists created_at timestamptz not null default now();
create index if not exists reference_posts_pillar_idx on reference_posts (pillar, status);

create table if not exists metrics (
  post_id         uuid not null references posts(id) on delete cascade,
  "window"        text not null check ("window" in ('48h','7d')),
  reach           int,
  saved           int,
  shares          int,
  comments        int,
  likes           int,
  profile_visits  int,
  follows         int,
  score           double precision,
  fetched_at      timestamptz not null default now(),
  primary key (post_id, "window")
);

create table if not exists settings (
  key    text primary key,
  value  jsonb
);
insert into settings (key, value) values
  ('mode', '"draft"'),
  ('paused', 'false')
on conflict (key) do nothing;
-- instagram_token and token_expiry are written by the publish step.

create table if not exists learnings (
  id              uuid primary key default gen_random_uuid(),
  category        text not null check (category in ('hook','format','topic','cta','visual','audience')),
  insight         text not null,
  evidence        uuid[] not null default '{}',
  sample_size     int not null default 0,
  confidence      text not null default 'hypothesis' check (confidence in ('hypothesis','tested','rule')),
  status          text not null default 'active' check (status in ('active','retired')),
  created_at      timestamptz not null default now(),
  last_validated  timestamptz not null default now()
);
create index if not exists learnings_active_idx on learnings (status, confidence);

create table if not exists comments (
  id              text primary key, -- Instagram comment id
  post_id         uuid not null references posts(id) on delete cascade,
  text            text not null,
  classification  text check (classification in ('question','request','objection','praise','spam')),
  used_as_idea    boolean not null default false
);

create table if not exists idea_queue (
  id          uuid primary key default gen_random_uuid(),
  source      text not null check (source in ('comment','learning','note')),
  text        text not null,
  used        boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table posts           enable row level security;
alter table raw_notes       enable row level security;
alter table reference_posts enable row level security;
alter table metrics         enable row level security;
alter table settings        enable row level security;
alter table learnings       enable row level security;
alter table comments        enable row level security;
alter table idea_queue      enable row level security;

-- Images (rendered slides and note photos) are stored here and served by the app at /m/<id>.<ext>.
-- (Supabase Storage is not used.) Old rows are pruned after 60 days.
create table if not exists media (
  id          uuid primary key default gen_random_uuid(),
  mime        text not null,
  data        bytea not null,
  created_at  timestamptz not null default now()
);
alter table media enable row level security;
