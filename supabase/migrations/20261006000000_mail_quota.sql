-- 메일 발송 집중 모드 — 하루 발송 한도와 X 수집 일시 중단을 설정합니다.
--   1) settings.daily_limit: 하루 발송 한도 (0 = 무제한, 기본 500 — Gmail 무료 계정 기준)
--   2) x_enabled 기본값을 false로 바꾸고 기존 설치의 자동 실행도 끕니다.
--      다시 X 수집을 쓰려면 관리자 "X 수집" 페이지에서 자동 실행을 켜세요.
-- 기존 설치 위에 안전하게 여러 번 실행할 수 있습니다.
-- Drizzle 마이그레이션으로는 drizzle/0003_mail_quota.sql 과 동일합니다.

alter table public.settings
  add column if not exists daily_limit integer not null default 500;

alter table public.settings
  alter column x_enabled set default false;

update public.settings set x_enabled = false;
