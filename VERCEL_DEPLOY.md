# Vercel 배포 가이드

로컬에서만 띄우던 sheet-mailer를 Vercel에 올리고, 서버가 꺼져 있어도 예약 발송이 되도록
외부 크론까지 세팅하는 절차입니다.

## 0. Vercel 배포 시 구조

| 구성 요소 | 위치 | 비고 |
| --- | --- | --- |
| 웹 UI + API (서버리스 함수) | **Vercel** | `main` 브랜치 → 프로덕션, PR 브랜치 → 프리뷰 배포 |
| PostgreSQL | **Supabase** | 기존과 동일. 연결은 pooler URI 권장 |
| 콘텐츠 원본 | **Google Sheets** | 기존과 동일 |
| 자동 발송 트리거 | **외부에서 `GET /api/cron` 호출** | 내장 스케줄러는 `DISABLE_SCHEDULER=true`로 끔 |

> 이 앱은 원래 1분 간격 "tick"으로 발송을 처리합니다. Vercel의 서버리스 함수는 요청 사이에
> 멈추므로, 내장 스케줄러 대신 `/api/cron`을 외부 스케줄러가 호출하는 구조로 전환합니다.
> 발송 로직에는 안전장치가 있어 매분 호출이 없어도 동작합니다:
> - 시각 지정 발송: 예정 시각으로부터 **6시간 이내**에 tick이 돌면 발송
> - 대기열(날짜 없음) 발송: 기본 발송시각(09:00 KST) 후 **60분 이내**에 tick이 돌면 발송

## 1. 사전 준비 (로컬에서 1회)

1. `SUPABASE_SETUP.md`대로 테이블 생성 완료 (`npm run db:migrate` 또는 SQL Editor).
   - 마이그레이션은 로컬에서 **직접 연결 URI**(`db.xxx.supabase.co:5432`)로 실행합니다.
     pooler URI(포트 6543)는 앱 런타임용입니다.
2. 이 저장소의 `main` 브랜치가 GitHub에 푸시되어 있어야 합니다.

## 2. Vercel 프로젝트 생성

1. [vercel.com](https://vercel.com) → 로그인(GitHub 계정) → **Add New… → Project**
2. `cuberry01/cubeberry_xconda` 저장소를 **Import**
3. Framework Preset이 **Next.js**로 자동 감지되는지 확인 (빌드/출력 설정은 기본값 그대로)
4. **Environment Variables**에 아래 값을 등록 (Environment는 Production + Preview 모두 체크)

| 변수 | 값 | 필수 |
| --- | --- | --- |
| `DATABASE_URL` | Supabase **pooler URI** (Dashboard → Connect → Pooler 탭, 포트 6543, `sslmode=require` 유지) | ✅ |
| `SHEET_URL` | 콘텐츠 Google Sheet URL (설정 화면에서 나중에 변경 가능) | ✅ |
| `DISABLE_SCHEDULER` | `true` | ✅ |
| `CRON_SECRET` | 긴 랜덤 값 (예: `openssl rand -hex 24` 출력) | 권장 |
| `SMTP_USER` / `SMTP_PASS` / `SMTP_HOST` / `SMTP_PORT` / `MAIL_FROM` | SMTP 발송용 (예: Gmail 앱 비밀번호) | 발송하려면 ✅ |
| `RESEND_API_KEY` | Resend 발송용 (SMTP 대신) | 선택 |
| `SUPABASE_URL` | Supabase Project URL, 이미지 영구 보관용 | 선택 |
| `SUPABASE_SERVICE_ROLE_KEY` | Storage 이미지 업로드용 서버 비밀키 (**NEXT_PUBLIC 금지**) | 선택 |
| `SUPABASE_STORAGE_BUCKET` | 이미지 공개 버킷 이름 (기본 `xconda-images`) | 선택 |

> **주의**
> - 서버리스 환경에서 `DATABASE_URL`은 **pooler URI**를 사용하세요. 직접 연결(5432)은
>   함수 인스턴스마다 커넥션이 늘어나 Supabase 커넥션 제한에 걸릴 수 있습니다.
> - 비밀번호에 특수문자가 있으면 URL 인코딩이 필요합니다 (Dashboard이 안내하는 URI 복사 권장).
> - 이미지 보관을 켜려면 Supabase에 `xconda-images` **public bucket**을 먼저 만들고 위 Storage 변수를 설정하세요. 자세한 내용은 `SUPABASE_SETUP.md`를 참고하세요. service-role key는 반드시 서버 전용으로 두세요.

5. **Deploy** 클릭. `vercel.json`의 크론 설정(`5 0 * * *` = 매일 09:05 KST)이 자동 적용됩니다.

## 3. 배포 확인

배포 완료 후 `https://<프로젝트명>.vercel.app`에서:

1. `/api/health` → `{"ok":true}` 가 나오면 Supabase 연결 성공
2. 홈 화면에서 **시트 불러오기** → 행 목록이 표시되는지 확인
3. **설정** 화면에서 `baseUrl`을 `https://<프로젝트명>.vercel.app`로 저장
   → 수신거부 링크가 이 도메인으로 생성됩니다
4. 테스트 수신 이메일로 1건 테스트 발송

## 4. 자동 발송 크론 설정 (중요)

### Vercel Hobby(무료) 플랜인 경우 — cron-job.org 사용 (권장)

Vercel Hobby는 크론이 **하루 1회만 허용**됩니다. 분 단위 트리거가 필요하므로 무료 외부
스케줄러인 [cron-job.org](https://cron-job.org)를 씁니다.

1. cron-job.org 가입 → **CREATE CRONJOB**
2. **URL**: `https://<프로젝트명>.vercel.app/api/cron?secret=<CRON_SECRET 값>`
   (또는 URL은 `/api/cron` 까지만 쓰고 Advanced → Request Headers에
   `Authorization: Bearer <CRON_SECRET 값>` 추가)
3. **Schedule**: Every 1 minute
4. **CREATE**

### Vercel Pro 플랜인 경우

`vercel.json`의 schedule을 아래처럼 바꾸고 커밋 → 푸시하면 매분 자동 tick됩니다.

```json
{ "crons": [{ "path": "/api/cron", "schedule": "* * * * *" }] }
```

### 기본 포함된 안전망

`vercel.json`에는 매일 09:05 KST 크론이 들어 있습니다. cron-job.org를 세팅하지 않아도
**기본 발송시각 직후 대기열 1건은 매일 발송**됩니다. 단, 시각 지정 발송은 6시간 유예 내에서만
발송되므로 정확한 시각 발송이 필요하면 위의 1분 간격 크론을 꼭 설정하세요.

> Vercel Cron은 **프로덕션 배포에서만** 실행됩니다(프리뷰 배포 제외).
> 또한 `CRON_SECRET`을 설정하면 Vercel이 호출 시 자동으로 `Authorization: Bearer` 헤더를
> 붙이므로 별도 설정이 필요 없습니다.

## 5. 수동 테스트

```bash
curl https://<프로젝트명>.vercel.app/api/cron \
  -H "Authorization: Bearer <CRON_SECRET 값>"
```

`{"ok":true,"log":[...]}` 응답으로 현재 tick이 처리한 내용을 확인할 수 있습니다.
`401`이면 시크릿 불일치, `{"ok":false}` 없이 500이면 Vercel → Deployments → Functions Logs 확인.

## 6. 문제 해결

| 증상 | 원인 / 조치 |
| --- | --- |
| 배포 실패: `Hobby accounts are limited to daily Cron Jobs` | `vercel.json`에 하루 2회 이상 스케줄이 들어감. 기본값(하루 1회)으로 유지하고 분 단위는 cron-job.org 사용 |
| `/api/health` 가 500 | `DATABASE_URL` 확인 — pooler URI, 비밀번호 URL 인코딩, `sslmode=require` |
| 발송이 안 됨 | ① 관리 화면에서 **자동 발송 ON** 확인 ② `/logs` 페이지와 Vercel Functions 로그 확인 ③ 크론이 실제로 도달하는지 수동 curl 테스트 ④ SMTP 자격증명/앱 비밀번호 확인 |
| 예약 시각에서 너무 늦게 발송됨 | 1분 간격 크론(cron-job.org 또는 Pro) 미설정. 안전망 크론은 하루 1회만 돎 |
| 시트 동기화 실패 | 시트 공유가 **링크가 있는 모든 사용자 → 뷰어**인지 확인 |
