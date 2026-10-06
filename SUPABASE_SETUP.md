# Supabase + Google Sheets 연동

이 앱은 Google Sheets를 콘텐츠 원본으로 읽고, Supabase PostgreSQL에는 발송 상태·구독자·로그를 저장합니다. DB 연결과 메일 발송만 사용할 때는 `NEXT_PUBLIC_SUPABASE_*`, anon key, service-role key가 필요하지 않습니다. **X 이미지의 원본 CDN 주소 만료를 막으려면 선택적으로 Supabase Storage를 설정**할 수 있습니다. 이때 service-role key는 서버 환경변수 `SUPABASE_SERVICE_ROLE_KEY`로만 사용하며 브라우저나 Git에 노출하면 안 됩니다.

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

## 1-A. (선택) X 이미지 영구 보관용 Storage

X·웹 원본 이미지가 만료되더라도 Notion 페이지(지원 형식은 이미지 블록), `/notices`, 뉴스레터에서 계속 표시되게 하려면:

1. Supabase Dashboard → **Storage** → **New bucket**에서 `xconda-images` 버킷을 만듭니다.
2. **Public bucket**을 켭니다. 읽기는 이미지 표시를 위해 공개하지만, 업로드는 서버의 service-role key로만 합니다.
3. 가능하면 버킷 파일 크기 제한을 **8 MB**, 허용 MIME을 `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/avif`로 설정합니다.
4. 서버 환경변수에 아래 값을 넣습니다. `SUPABASE_URL`은 Project URL이고, key는 Dashboard의 **Project Settings → API Keys → service_role** 값입니다.

```text
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role secret>
SUPABASE_STORAGE_BUCKET=xconda-images  # 생략 가능
```

service-role key에는 전체 권한이 있으므로 **`NEXT_PUBLIC_` 접두사를 붙이지 말고**, Vercel에서도 Server Environment Variable로만 등록하세요. 이미지는 SHA-256 기준으로 중복 저장을 줄이고, 지원되는 이미지 형식만 최대 8 MB까지 복사합니다. 미설정 또는 업로드 실패 시에는 원본 URL을 사용해 게시·메일 발송이 계속됩니다. 관리자 **X 수집** 화면의 “이미지 보관” 카드에서 설정 상태를 확인할 수 있습니다.

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

### 기존 설치 업그레이드

이미 테이블이 있다면 변경분만 적용합니다 (여러 번 실행해도 안전합니다).

- `supabase/migrations/20261006000000_mail_quota.sql` — `settings.daily_limit`(하루 발송 한도, 기본 500) 추가, X 수집 자동 실행 기본값 끔.

## 3. Google Sheet 확인

시트는 이미 공개 export로 읽을 수 있는 상태입니다. 앱은 아래 URL을 기본 콘텐츠 시트로 사용합니다.

```text
https://docs.google.com/spreadsheets/d/1CavwYt1DHE91E1m41gf1TzCDd48HroP0D8YXTgOlsjM/edit?usp=sharing
```

공유 설정은 **링크가 있는 모든 사용자 → 뷰어**여야 합니다. 첫 행의 열 순서는 다음과 같습니다.

```text
발송일시 | 제목 | 본문 | 링크 | 이미지 | 수신자 | 사용
```

`이미지` 열에는 공개 이미지 주소뿐만 아니라 **구글 드라이브 공유 링크**도 넣을 수 있습니다. 파일 공유 설정이 '링크가 있는 모든 사용자 – 뷰어'라면 메일에 표시되는 주소로 자동 변환됩니다.

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
