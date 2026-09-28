# Supabase + Google Sheets 연동

이 앱은 Google Sheets를 콘텐츠 원본으로 읽고, Supabase PostgreSQL에는 발송 상태·구독자·로그를 저장합니다. 브라우저에서 Supabase를 직접 호출하지 않으므로 `NEXT_PUBLIC_SUPABASE_*`, anon key, service-role key를 추가할 필요가 없습니다.

- Supabase project: `yxryzqzdspmwvibbzxqf`
- Content sheet: `1CavwYt1DHE91E1m41gf1TzCDd48HroP0D8YXTgOlsjM`

## 1. Supabase 연결 문자열 설정

1. Supabase Dashboard → **Connect**를 엽니다.
2. **Postgres connection string**을 복사합니다. 서버리스 배포(Vercel 등)는 Dashboard가 권장하는 **pooler URI**를 사용합니다.
3. 저장소 루트에서 `.env.example`을 `.env`로 복사한 뒤, `DATABASE_URL` 전체를 복사한 URI로 바꿉니다. `sslmode=require`은 유지합니다.

```bash
cp .env.example .env
# .env에서 DATABASE_URL=... 를 Dashboard에서 복사한 값으로 교체
```

> 데이터베이스 비밀번호, pooler URI, service-role key는 채팅이나 Git에 올리지 마세요. `.env`는 Git ignore 대상입니다.

## 2. 테이블 생성

둘 중 하나를 한 번 실행합니다.

### Dashboard SQL Editor

`supabase/migrations/20260928000000_init_sheet_mailer.sql` 파일 전체를 Supabase Dashboard → **SQL Editor**에 붙여넣고 **Run**합니다.

### CLI / 로컬 환경변수

```bash
npm install
npm run db:migrate
```

`settings`, `contents`, `subscribers`, `send_logs` 테이블이 생성됩니다. 테이블에는 RLS가 활성화되며, 이 앱의 서버 PostgreSQL 연결은 정상 동작하고 공개 REST API는 기본적으로 닫혀 있습니다.

## 3. Google Sheet 확인

시트는 이미 공개 export로 읽을 수 있는 상태입니다. 앱은 아래 URL을 기본 콘텐츠 시트로 사용합니다.

```text
https://docs.google.com/spreadsheets/d/1CavwYt1DHE91E1m41gf1TzCDd48HroP0D8YXTgOlsjM/edit?usp=sharing
```

공유 설정은 **링크가 있는 모든 사용자 → 뷰어**여야 합니다. 첫 행의 열 순서는 다음과 같습니다.

```text
발송일시 | 제목 | 본문 | 링크 | 이미지 | 수신자 | 사용
```

현재 시트의 첫 데이터 행은 `{{이름}}님, 10월 첫 소식입니다`에서 쉼표 때문에 셀이 한 칸씩 밀려 있습니다. Google Sheets에서는 쉼표가 CSV 구분자가 아니므로 제목을 **하나의 셀**에 아래처럼 넣어주세요.

```text
{{이름}}님, 10월 첫 소식입니다
```

그 뒤 본문은 다음 셀, 링크는 `링크` 열, 이미지는 `이미지` 열, `Y`는 `사용` 열에 맞춥니다. CSV를 다시 붙여넣을 때는 쉼표가 포함된 값은 큰따옴표로 감싸야 합니다.

## 4. 검증 및 동기화

```bash
npm run dev
# 브라우저에서 http://localhost:3000
```

1. `/api/health`가 `{"ok":true}`를 반환하면 Supabase 연결 성공입니다.
2. 홈 화면에서 **시트 불러오기**를 누릅니다.
3. `contents`에 시트 행이, `settings.last_synced_at`에 동기화 시간이 저장되는지 확인합니다.
4. 실제 자동 발송 전에는 테스트 수신 이메일을 설정하고 테스트 발송을 먼저 확인합니다.

배포 환경에는 로컬 `.env`와 동일한 `DATABASE_URL`, `SHEET_URL`을 환경 변수로 등록해야 합니다. 자동 발송을 켠 뒤에는 배포 환경에서 `GET /api/cron`을 1분마다 호출하도록 cron을 설정합니다.
