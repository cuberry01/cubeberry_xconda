# 시트 메일러 — 구글 스프레드시트 예약 메일링 서비스

구글 스프레드시트에 메일 내용을 적어두면, 정해진 시간에 맞춰 구독자에게 자동 발송하는 서비스입니다.
드라이브의 `automated-spreadsheet-mailing-system.zip` 을 풀면 나오는 **Next.js 16 + PostgreSQL(Drizzle) + Nodemailer** 프로젝트입니다.

---

## 1. 전체 구조 (어떻게 "연동"되나?)

```
[구글 스프레드시트]  ──CSV export(공개 링크)──▶  fetchSheetRows()   (src/lib/sheet.ts)
        │                                              │
        │  콘텐츠 시트 / 구독자 시트                    ▼
        │                                     rowsToContents()
        │                                     rowsToSubscribers()
        │                                              │
        ▼                                              ▼
  [PostgreSQL] ◀── upsert (key 기준) ────────── contents / subscribers
        │                                              │
        │  tick() 60초마다                            ▼
        │                                     scheduledAt <= now ?
        ▼                                              │
  [스케줄러] ──yes──▶ sendContent() ──▶ renderEmail() ──▶ Nodemailer(SMTP/Resend)
                          │
                          └──▶ send_logs 테이블에 기록 + 웹 UI(/logs)에 표시
```

**핵심 포인트: 구글 API 키·OAuth가 전혀 필요 없습니다.**
시트를 "링크가 있는 모든 사용자 – 뷰어"로 공개하면 `/export?format=csv` 로 CSV를 그냥 내려받을 수 있어서,
그 URL을 `fetch` 해서 파싱하는 방식입니다. 덕분에 서비스 계정 설정 없이 바로 연동됩니다.

---

## 2. 사전 준비

| 항목 | 버전 |
|---|---|
| Node.js | 20 이상 |
| PostgreSQL | 14 이상 (로컬이면 17 권장) |

---

## 3. 구글 스프레드시트 설정 ⭐ 가장 중요

### 3-1. 공유 설정
시트 오른쪽 상단 **공유** → **일반 액세스** → `링크가 있는 모든 사용자` → 역할 **뷰어** → 저장.

> 이 설정을 빼먹으면 `/export?format=csv` 가 HTML 로그인 페이지를 반환하고,
> 앱은 이렇게 에러를 냅니다:
> `시트를 읽을 수 없습니다 (HTTP 200). 공유 설정을 '링크가 있는 모든 사용자 - 뷰어'로 바꿔주세요.`

**이미 연결된 시트:** <https://docs.google.com/spreadsheets/d/1CavwYt1DHE91E1m41gf1TzCDd48HroP0D8YXTgOlsjM/edit>
→ 현재 공개는 되어 있으나 **내용이 비어 있습니다.** 3-2의 머리글을 넣으면 바로 동작합니다.

### 3-2. 콘텐츠 시트 형식
**첫 행에 머리글**, 2행부터 한 줄에 하나의 메일. `제목` 만 필수입니다.

| 발송일시 | 제목 | 본문 | 링크 | 이미지 | 수신자 | 사용 |
|---|---|---|---|---|---|---|

`시트_템플릿.csv` 파일을 그대로 붙여넣으면 됩니다.

**열 이름은 유연하게 인식합니다** (`src/lib/sheet.ts` 의 `COLUMN_ALIASES`)
- 발송일시 → `발송시간`, `예약일시`, `날짜`, `일시`, `date`, `datetime`, `schedule` …
- 제목 → `메일제목`, `subject`, `title`
- 본문 → `내용`, `메일내용`, `body`, `content`
- 링크 → `url`, `link`, `바로가기`
- 이미지 → `이미지URL`, `썸네일`, `image`, `thumbnail`
- 수신자 → `받는사람`, `이메일`, `to`, `recipients`
- 사용 → `사용여부`, `활성`, `active`, `enabled`

### 3-3. 각 열 규칙

| 열 | 규칙 |
|---|---|
| **발송일시** | 해당 시각(**한국 시간 KST**)에 발송. `2026-10-05 09:00`, `2026. 10. 5 오전 9:00:00`, `10/5/2026 9:00 AM` 인식. **비우면 대기열** → 설정한 요일·시간에 위에서부터 1건씩 발송. 날짜만 쓰면 설정의 "기본 발송 시간" 적용 |
| **제목** | 필수. `{{이름}}` 치환 가능 |
| **본문** | `**굵게**`, URL 자동 링크, 빈 줄로 단락 구분. HTML 태그(`<p>`, `<br>`, `<table>` 등)를 직접 써도 그대로 렌더링 |
| **링크** | "자세히 보기 →" 버튼으로 삽입 |
| **이미지** | 상단 배너. 메일 클라이언트가 차단할 수 있으니 **외부 절대경로 URL** 사용 |
| **수신자** | 비우면 **전체 구독자**. 쉼표/세미콜론/공백으로 구분해 적으면 해당 인원에게만 발송 |
| **사용** | `N`, `NO`, `X`, `false`, `0`, `아니오`, `보류`, `중지`, `제외`, `미사용` 중 하나면 발송 안 함 |

> **중복 발송 방지:** 발송된 행은 다시 보내지지 않습니다. 제목이나 발송일시를 고치면 `key` 가 바뀌어
> **새 콘텐츠**로 인식됩니다. 그래서 수정 = 재발송 트리거입니다.

### 3-4. 구독자 시트 (선택)
같은 파일에 **`구독자` 탭**을 만들어 `이메일`, `이름` 열을 채우고,
그 탭을 연 상태의 URL(`#gid=…` 포함)을 설정 화면의 **구독자 시트 URL** 에 넣으면 동기화 시 자동 등록됩니다.
(수신거부한 사람은 시트에 있어도 다시 활성화되지 않습니다.)

---

## 4. 로컬에서 실행

```bash
unzip automated-spreadsheet-mailing-system.zip -d sheet-mailer
cd sheet-mailer

npm install

# PostgreSQL 준비
sudo apt-get install -y postgresql        # Debian/Ubuntu
sudo pg_ctlcluster 17 main start
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
sudo -u postgres psql -c "CREATE DATABASE app_db;"

# 환경변수
cp .env.example .env
# .env 의 DATABASE_URL 을 본인 DB에 맞게 수정

# 테이블 생성
npx drizzle-kit generate --name init
npx drizzle-kit migrate

# 실행
npm run dev        # http://localhost:3000
```

그 외 스크립트: `npm run build` / `npm start` / `npm run lint` / `npm run typecheck`

---

## 5. 서비스 화면에서 설정 (`/settings`)

| 항목 | 설명 |
|---|---|
| 콘텐츠 스프레드시트 URL | `…/edit` 또는 특정 탭 `…/edit#gid=123` |
| 구독자 시트 URL | 선택. `#gid=` 포함 |
| 기본 발송 시간 (KST) | 대기열·날짜-only 콘텐츠의 발송 시각 |
| 대기열 발송 요일 | 기본 `월~금`. 요일마다 대기열에서 1건 |
| 보내는 사람 이름 | 메일 상단 표시 |
| 테스트 수신 이메일 | `[테스트]` 붙여서 1통 발송 |
| 서비스 주소 | 수신거부 링크 기준. 비워두면 첫 접속 주소로 자동 설정 |

**사용 흐름**
1. 시트에 내용 작성
2. 홈(`/`) → **🔄 시트 불러오기**
3. 목록에서 **미리보기** → **테스트 발송**로 확인
4. **자동 발송 켜기** → 이후 60초마다 시트를 다시 읽고 시각이 된 건 발송
5. 즉시 발송하려면 **지금 발송**, 실패/완료 건을 다시 큐에 넣으려면 **대기로**

---

## 6. 메일 발송 설정 (환경변수)

앱은 `getProvider()` 로 자동 판단합니다. 둘 다 없으면 **테스트 모드**(기록만 남고 실제 발송 안 함).

**① Gmail / SMTP** — 소규모(하루 약 500통)
```env
SMTP_USER=you@gmail.com
SMTP_PASS=앱비밀번호16자리      # Gmail 2단계 인증 후 발급
SMTP_HOST=smtp.gmail.com        # 선택
SMTP_PORT=465                   # 선택
MAIL_FROM=you@gmail.com         # 선택
```

**② Resend** — 대량 발송 추천
```env
RESEND_API_KEY=re_xxxxxxxxxxxx
MAIL_FROM=news@your-domain.com  # 도메인 인증 필요
```

발송 시 `List-Unsubscribe` 헤더가 자동으로 붙어 스팸 분류를 줄여줍니다.

---

## 7. 배포 (서버리스 기준)

```bash
npm run build
```
Vercel·Railway·Fly.io 어디든 배포 가능. DB는 Neon·Supabase·RDS 등 관리형 PostgreSQL을 쓰면 `DATABASE_URL` 만 넣으면 끝입니다.

**배포 시 꼭 할 것**
1. 배포 환경에서도 마이그레이션 실행 (`npx drizzle-kit migrate`)
2. 환경변수 주입 (`DATABASE_URL`, 메일 설정, `CRON_SECRET`)
3. **서버리스에서는 인프로세스 스케줄러가 매번 안 뜰 수 있으므로 외부 크론을 거세요:**
   - `GET /api/cron` (또는 POST) 을 **1분마다** 호출
   - `CRON_SECRET` 설정 시 `?secret=...` 또는 `Authorization: Bearer ...` 필요
   - Vercel: `vercel.json` 에 crons 항목 추가, 또는 cron-job.org / GitHub Actions 사용
4. `DISABLE_SCHEDULER=true` 로 인프로세스 스케줄러를 끄고 외부 크론만 쓸 수도 있습니다

> **동시성 안전:** `contents.status` 를 원자적으로 `sending` 으로 먼저 변경(claim)하고,
> 대기열은 `settings.last_queue_sent_date` 로 하루 1건을 선점합니다. 크론이 여러 번 호출돼도 중복 발송되지 않습니다.

---

## 8. 발송 로직 상세

```
tick()  ← 60초마다 (또는 /api/cron)
 ├─ 1시간 이상 'sending'으로 멈춘 행 → 'failed' 로 복구
 ├─ enabled == false 면 종료
 ├─ syncSheet()                    ← 시트를 다시 읽어 DB에 upsert
 ├─ 예약 발송: scheduledAt <= now  &&  now - scheduledAt < 6시간(GRACE_MS)
 └─ 대기열 발송: 오늘이 발송 요일 && 기본 시각 ~ +60분 사이 && 오늘 아직 안 보냄
      → scheduledAt 이 비어 있는 행 중 rowNumber 가 가장 작은 1건
```

---

## 9. 문제 해결

| 증상 | 원인 / 해결 |
|---|---|
| `시트를 읽을 수 없습니다 (HTTP …)` | 공유 설정을 `링크가 있는 모든 사용자 – 뷰어` 로 |
| `'제목' 열을 찾을 수 없습니다` | 첫 행 머리글 누락. 다른 시트를 보고 있다면 URL에 `#gid=` 를 포함 |
| `DATABASE_URL is required` | `.env` 누락 또는 미주입 |
| `수신자가 없습니다` | 구독자 0명. `/subscribers` 에 추가하거나 수신자 열 확인 |
| 발송 기록은 있는데 메일이 안 옴 | **테스트 모드**. `SMTP_*` 또는 `RESEND_API_KEY` 설정 |
| 시트를 고쳤는데 반영이 안 됨 | **🔄 시트 불러오기** 클릭, 또는 자동 발송 켜짐 확인 |
| 예약 시간에 안 나감 | 서버 시간대는 상관없이 **KST 기준**으로 계산됩니다. `/api/cron` 이 실제로 호출되는지, `CRON_SECRET` 일치 여부 확인 |
| 같은 메일이 또 감 | 시트의 제목/발송일시를 바꾸면 새 콘텐츠로 취급됩니다. 의도치 않았다면 원래대로 되돌리세요 |

---

## 10. 주요 파일 지도

```
src/
├─ app/
│  ├─ page.tsx                  홈: 콘텐츠 목록 · 불러오기 · 발송
│  ├─ actions.ts                서버 액션 (동기화/발송/설정/구독자)
│  ├─ settings/page.tsx         설정
│  ├─ subscribers/page.tsx      구독자 관리
│  ├─ logs/page.tsx             발송 기록
│  ├─ unsubscribe/page.tsx      수신거부
│  ├─ preview/[id]/route.ts     메일 HTML 미리보기
│  └─ api/{cron,health}/route.ts
├─ db/{index,schema}.ts         Drizzle + 테이블 정의
└─ lib/
   ├─ sheet.ts        ★ 시트 URL 파싱 · CSV 파서 · 열 매핑
   ├─ sync.ts         ★ 시트 → DB upsert
   ├─ scheduler.ts    ★ tick() / 대기열 슬롯 계산
   ├─ dispatch.ts     발송 실행 · 수신자 해석
   ├─ template.ts     메일 HTML 렌더링 · {{이름}} 치환
   ├─ mailer.ts       SMTP / Resend / 테스트 모드
   ├─ time.ts         KST 유틸 · 다양한 날짜 형식 파서
   └─ settings.ts     설정 조회/저장 (시트 URL 기본값 포함)
```

---

## 11. 데이터베이스 테이블

| 테이블 | 용도 |
|---|---|
| `settings` | 단일 행(id=1). 시트 URL, 발송 요일/시간, 발신자명, baseUrl, 동기화 상태 |
| `contents` | 시트에서 읽어온 메일. `key` 로 upsert, `status`: pending / sending / sent / failed |
| `subscribers` | 구독자. `email` unique, `token` 으로 수신거부 링크 |
| `send_logs` | 수신자별 발송 결과 (sent / failed / test) |

---

## 12. 보안 참고

- 시트가 **링크 공개**이므로 URL을 아는 사람은 내용을 볼 수 있습니다. 민감한 정보는 넣지 마세요.
- 더 안전하게 하려면 Google Service Account로 Sheets API를 쓰도록 `src/lib/sheet.ts` 의 `fetchSheetRows()` 만 교체하면 됩니다 (나머지 코드는 그대로).
