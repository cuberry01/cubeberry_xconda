-- Xconda 관제(2단계) — 마지막 자동 실행 시각과 요약 로그를 settings에 기록합니다.
-- 대시보드의 "자동 실행 중단 경고"와 "운영 정보" 카드가 이 값을 읽습니다.
-- 기존 설치 위에 안전하게 여러 번 실행할 수 있습니다.
-- Drizzle 마이그레이션으로는 drizzle/0002_xconda_ops.sql 과 동일합니다.

alter table public.settings
  add column if not exists x_last_tick_at timestamp with time zone,
  add column if not exists x_last_tick_log text;
