ALTER TABLE "settings" ALTER COLUMN "x_enabled" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "daily_limit" integer DEFAULT 500 NOT NULL;--> statement-breakpoint
-- X 수집을 당분간 중단하고 메일 발송에 집중하기 위해 기존 설치의 자동 실행도 끕니다.
-- 다시 사용하려면 관리자 화면의 "X 수집" 페이지에서 자동 실행을 켜세요.
UPDATE "settings" SET "x_enabled" = false;
