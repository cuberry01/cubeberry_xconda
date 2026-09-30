-- Xconda (X 게시물 → Gemini 요약 → Notion → 공지 페이지) 스키마.
-- 기존 설치 위에 안전하게 여러 번 실행할 수 있습니다.
-- Drizzle 마이그레이션으로는 drizzle/0001_xconda.sql 과 동일합니다.

alter table public.settings
  add column if not exists x_enabled boolean not null default true,
  add column if not exists x_notion_database_id text not null default '',
  add column if not exists x_rsshub_base text not null default '',
  add column if not exists x_auto_publish boolean not null default false,
  add column if not exists x_email_on_publish boolean not null default true,
  add column if not exists x_max_age_days integer not null default 14;

-- 발행 시 메일 대기열에 들어오는 Xconda 항목 구분 (기존 행은 'sheet')
alter table public.contents
  add column if not exists source text not null default 'sheet';

create table if not exists public.x_accounts (
  id serial primary key,
  handle text not null,
  feed_url text not null default '',
  enabled boolean not null default true,
  last_checked_at timestamp with time zone,
  last_guid text not null default '',
  last_error text,
  created_at timestamp with time zone not null default now()
);

-- 브라우저 직접 접근 불가 (서버 PostgreSQL 연결만 사용)
alter table public.x_accounts enable row level security;
