-- Sheet Mailer schema for Supabase project yxryzqzdspmwvibbzxqf.
-- Apply this file once from Supabase Dashboard → SQL Editor.
-- `npm run db:migrate` applies the equivalent Drizzle migration in /drizzle.
-- The Next.js server connects with DATABASE_URL; no Supabase anon or service-role key is used.

create table if not exists public.settings (
  id integer primary key,
  sheet_url text not null default '',
  subscribers_sheet_url text not null default '',
  enabled boolean not null default false,
  default_send_time text not null default '09:00',
  send_days text not null default '1,2,3,4,5',
  from_name text not null default '뉴스레터',
  test_email text not null default '',
  base_url text not null default '',
  last_queue_sent_date text,
  last_synced_at timestamp with time zone,
  last_sync_error text,
  last_tick_at timestamp with time zone
);

create table if not exists public.contents (
  id serial primary key,
  key text not null unique,
  row_number integer not null default 0,
  subject text not null,
  body text not null default '',
  link text not null default '',
  image_url text not null default '',
  recipients text not null default '',
  scheduled_at timestamp with time zone,
  raw_schedule text not null default '',
  active boolean not null default true,
  in_sheet boolean not null default true,
  status text not null default 'pending',
  sent_at timestamp with time zone,
  sent_count integer not null default 0,
  fail_count integer not null default 0,
  error text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.subscribers (
  id serial primary key,
  email text not null unique,
  name text not null default '',
  active boolean not null default true,
  source text not null default 'manual',
  token text not null,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.send_logs (
  id serial primary key,
  content_id integer,
  subject text not null default '',
  email text not null,
  status text not null,
  provider text not null default '',
  error text,
  created_at timestamp with time zone not null default now()
);

-- Browser clients do not need direct table access. The server-side PostgreSQL
-- connection used by this app bypasses these policies, while the public API
-- remains closed by default.
alter table public.settings enable row level security;
alter table public.contents enable row level security;
alter table public.subscribers enable row level security;
alter table public.send_logs enable row level security;
