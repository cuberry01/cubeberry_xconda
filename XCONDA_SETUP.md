# Xconda 설정 가이드 — X 게시물 → Gemini 요약 → Notion → 공지 페이지

시트 메일러에 통합된 X 수집 파이프라인입니다. `sinmb79/blog-writer`에서 **Collector → Filter → AI 엔진 추상화** 구조만 가져와
X 전용으로 단순화한 것으로, 유료 X API 없이 동작합니다.

```text
[수동 URL 입력] ──┐
                  ├→ Notion DB (NEW) → 원문·이미지 추출 ─┬→ (선택) Supabase Storage
[관제 계정 RSS] ──┘                                      │            ↓
                                                        │   Notion Image URL + 이미지 블록
                                                        ↓
                                            필터 → Gemini 요약 → 게시
                                                                  ├→ /notices 공지 페이지
                                                                  └→ (선택) 뉴스레터 대기열 → 기존 예약 발송
```

## 상태 흐름

| 상태 | 의미 | 다음 단계 |
| --- | --- | --- |
| `NEW` | URL만 등록됨 | 자동 처리 대기 (수집 즉시 처리됨) |
| `EXTRACTED` | 본문/작성자/날짜 확보 | Gemini 요약 |
| `SUMMARIZED` | 요약 완료, 검토 대기 | 게시 (자동 게시 설정 시 즉시) |
| `READY` | 발행 확정 | 자동 게시 대기 |
| `PUBLISHED` | 공지 페이지에 게시됨 | 완료 |
| `EXTRACT_FAILED` / `AI_FAILED` / `PUBLISH_FAILED` | 실패 | 관리자 화면에서 "다시 처리" |
| `IGNORED` | 중복/오래됨/관련성 없음 | 종료 |

## 1. Notion 연결

1. [notion.so/my-integrations](https://www.notion.so/my-integrations) → **New integration** → Internal Integration 생성
2. **Internal Integration Secret**(`secret_...`)을 복사해 배포 환경변수 `NOTION_TOKEN`에 등록
3. 콘텐츠를 모아둘 Notion 페이지 하나를 만들고 `•••` 메뉴 → **Connections** → 위에서 만든 인테그레이션 추가
4. 관리자 **X 수집** 페이지 → "Notion DB 자동 생성"에 그 페이지 링크를 붙여넣고 생성
   (필요한 속성 Title / Source URL / Status / Summary / Tags … 이 한 번에 만들어집니다)

DB를 직접 만들 경우 속성 이름은 아래와 같아야 합니다 (형식은 자동 생성 참고):

| 속성 | 형식 |
| --- | --- |
| Title | 제목 |
| Source URL | URL |
| Source Author | 텍스트 |
| Original Text | 텍스트 |
| Summary | 텍스트 |
| Announcement | 텍스트 |
| Category | 선택 (AI 모델/AI 영상/AI 이미지/AI 도구/뉴스/기타) |
| Tags | 다중 선택 |
| Status | 선택 (NEW/EXTRACTED/SUMMARIZED/READY/PUBLISHED/EXTRACT_FAILED/AI_FAILED/PUBLISH_FAILED/IGNORED) |
| Published | 체크박스 |
| Landing URL | URL |
| Source Date | 날짜 |
| Created At | 날짜 |
| Image URL | URL |
| Note | 텍스트 |

DB ID는 DB URL 끝의 32자리 문자열이며, "X 수집 설정"에 저장하거나 환경변수 `NOTION_DATABASE_ID`로 지정합니다.

## 2. Gemini API 키

1. [aistudio.google.com/apikey](https://aistudio.google.com/apikey)에서 API 키 발급
2. `GEMINI_API_KEY` 환경변수에 등록 (모델은 `GEMINI_MODEL`로 변경 가능, 기본 `gemini-2.5-flash`)

## 3. 데이터베이스 마이그레이션

Supabase Dashboard → **SQL Editor**에서 아래 두 파일을 **순서대로** 실행합니다. 둘 다 이미 적용되어 있으면 건너뛰는 안전한 스크립트입니다.

| 순서 | 파일 | 추가되는 것 |
| --- | --- | --- |
| 1 | `supabase/migrations/20260930000000_xconda.sql` | `settings`에 X 설정 컬럼, `contents.source`, `x_accounts` 테이블 |
| 2 | `supabase/migrations/20261002000000_xconda_ops.sql` | `settings.x_last_tick_at`, `settings.x_last_tick_log` (관제용 마지막 실행 기록) |

Drizzle을 쓰는 환경이라면 `drizzle/0001_xconda.sql`, `drizzle/0002_xconda_ops.sql`이 같은 내용입니다.

## 4. 환경변수 요약 (Vercel 등)

```text
NOTION_TOKEN=secret_...            # 필수
GEMINI_API_KEY=AIza...             # 필수
NOTION_DATABASE_ID=...             # 선택 (관리자 페이지에서 저장 가능)
GEMINI_MODEL=gemini-2.5-flash      # 선택
RSSHUB_BASE_URL=                   # 선택 (관리자 페이지에서 저장 가능)
SUPABASE_URL=https://<ref>.supabase.co           # 선택, 이미지 영구 보관
SUPABASE_SERVICE_ROLE_KEY=...                   # 선택, 서버 전용 비밀키
SUPABASE_STORAGE_BUCKET=xconda-images            # 선택 (기본값 xconda-images)
```

기존처럼 `GET /api/cron`을 1분 간격으로 호출하면 파이프라인이 같이 돕니다(메일 자동 발송 설정과 무관).

## 5. 사용 방법

### 수동 수집 (기본)

관리자 **X 수집** 페이지에 X 게시물 URL을 붙여넣으면 즉시 추출 → 요약까지 진행됩니다.
비공개/삭제 등으로 추출이 실패하면 "원문 직접 붙여넣기" 칸에 게시물 본문을 넣고 다시 수집하세요. X가 아닌 일반 웹페이지 URL도 넣을 수 있습니다.

### 관제 계정 자동 수집 (무료 브릿지)

"관제 계정"에 X 핸들을 등록하면 15분마다 RSS 피드를 확인해 새 게시물을 자동 수집합니다.
피드는 두 가지 방식으로 제공할 수 있습니다.

- **RSSHub 주소**를 설정하면 `<주소>/twitter/user/<핸들>` 피드를 자동 사용
- 계정마다 **개별 피드 URL**을 직접 지정 (Nitter 인스턴스, 자체 RSSHub 등 무엇이든)

> RSSHub의 Twitter 라우트는 인스턴스에 따라 인증 설정이 필요할 수 있습니다. 가장 안정적인 방법은 본인 서버에서
> RSSHub를 돌리는 것이고, 공개 인스턴스는 제한되어 있을 수 있습니다. 브릿지가 실패해도 오류가 계정에 기록될 뿐
> 수동 수집은 계속 동작합니다.

### 게시와 뉴스레터 연동

- **자동 게시**를 끄면 요약(SUMMARIZED) 후 사람이 확인하고 "게시"를 누릅니다.
- **게시 시 뉴스레터 대기열에 추가**가 켜져 있으면 발행 즉시 기존 시트 메일러의 대기열(`contents`)에 들어갑니다.
  전역 자동 발송과 크론이 켜져 있으면 설정된 발송 요일·시간에 활성 구독자에게 발송됩니다. 메일 CTA는 `/notices`의 게시 카드로 연결하고, 원문 링크도 본문에 함께 넣습니다.
- Xconda 메일에는 게시 이미지도 포함됩니다. `SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`를 설정하면 원본 이미지를 공개 Storage 버킷에 복사해 Notion 이미지 블록, 공지 페이지, 뉴스레터에서 안정적인 주소를 사용합니다. Notion 이미지 블록이 지원하지 않는 확장자(WebP/AVIF 등)는 `Image URL` 속성과 공지·메일에서 사용합니다. 스토리지 미설정/실패 시 원본 이미지 URL로 계속 게시합니다.
- 게시된 항목은 `/notices`(공지 페이지)에 카드 형태로 나열되고, Notion의 `Landing URL`이 그 앵커를 가리킵니다. 이메일 앱에서 외부 이미지가 기본 차단된 경우에는 수신자가 “이미지 표시”를 눌러야 할 수 있습니다.

### 대시보드 관제 기능 (2단계)

**수집 항목 찾기** — 전부 서버 렌더라 JS 없이 동작하고, 주소를 그대로 공유하면 같은 화면이 열립니다.

| 기능 | 사용법 | 비고 |
| --- | --- | --- |
| 검색 | 목록 상단 검색창 → `?q=앤트로픽` | 제목·요약·작성자·카테고리·태그를 한 번에 검색 |
| 정렬 | `최신순` / `오래된순` / `발행일순` 칩 → `?sort=old` | 기본값(최신순)은 URL에 남기지 않음 |
| 상태 필터 | `전체 / 처리 대기 / 게시됨 / 실패 / 제외` 칩 | 카운트는 현재 검색어 기준으로 다시 계산 |
| 더 보기 | 목록 하단 `다음 100건 더 보기` → `?limit=200` | 100건씩, 최대 500건까지 조회 (조회 범위를 목록 위·아래에 항상 표기) |

**항목 카드에서 바로 하는 일**

- `요약 전문 / 공지문 / 원문`을 접었다 펼 수 있습니다. 원문은 700자까지 보여주고 전체 길이를 함께 표기합니다.
- 상태별 **다음 행동 안내**가 제목 아래에 한 줄로 표시됩니다(예: `요약 완료 — 내용을 확인하고 '게시'를 누르면 공지에 올라갑니다`).
- 실패 항목(`EXTRACT_FAILED` / `AI_FAILED` / `PUBLISH_FAILED`) 카드에는 **본문 직접 붙여넣고 재요약** 폼이 열려 있습니다.
  추출 단계를 건너뛰고 Gemini 요약부터 다시 진행하므로, 비공개·삭제된 게시물도 복구할 수 있습니다.
- `수집 4분 전`처럼 상대 시간이 표시되고, 마우스를 올리면 정확한 시각(KST)이 나옵니다.
- `원문 / 공지 / Notion` 링크와 DB ID·피드 URL 복사 버튼이 함께 있습니다.

**운영(관제) 정보**

- 파이프라인 카드와 **운영 정보** 패널에 마지막 자동 실행 시각(`x_last_tick_at`)과 **마지막 로그 2줄**(`x_last_tick_log`)이 표시됩니다.
- 다음 경우 상단에 경고 배너와 `지금 실행` 버튼이 나타납니다: ① 실행 기록이 아직 없음 ② 6시간 이상 미실행 ③ 마지막 로그에 `오류`/`실패` 포함.
- Notion DB에 필요한 속성이 빠져 있으면 Notion 카드에 `누락 속성 추가` 버튼이 나타나 해당 속성만 만들어 줍니다(기존 행은 그대로).

## 6. 문제 해결

| 증상 | 확인할 것 |
| --- | --- |
| `EXTRACT_FAILED` | 게시물이 비공개/삭제되었는지. 원문 직접 붙여넣기 후 "다시 처리" |
| `AI_FAILED` | `GEMINI_API_KEY` 유효성, 할당량. 잠시 후 "다시 처리" |
| Notion 조회 실패 | DB를 인테그레이션에 공유했는지(페이지 `•••` → Connections), DB ID 32자리 |
| 피드 오류가 계속 | RSSHub/Nitter 인스턴스 상태. 계정에 개별 피드 URL 지정 또는 수동 수집 사용 |
| 같은 내용이 계속 수집됨 | URL 중복 + 제목 유사도(0.8) 필터가 있으나, 표현이 다르면 통과될 수 있음 — Notion에서 수동으로 IGNORED |
| 오래된 게시물이 제외됨 | 설정의 "최대 게시물 나이" (기본 14일) |
| 배너: "자동 실행 기록이 없습니다" | 아직 한 틱도 돌지 않았습니다. X 수집 설정의 **파이프라인 사용**이 켜져 있는지 확인하고, 서버리스라면 `GET /api/cron`을 외부 크론으로 1분마다 호출하세요(서버 내장 스케줄러는 상시 구동 서버에서만 동작). |
| 배너: "자동 실행이 N시간째 멈춰 있습니다" | 서버가 꺼졌거나 크론 호출이 중단된 상태입니다. `GET /api/cron` 응답(JSON `log`)과 마지막 로그 2줄을 확인하세요. |
| 배너: "마지막 자동 실행에 오류가 있습니다" | 마지막 로그에 `오류`/`실패`가 포함된 경우입니다. 로그의 실패 항목은 카드의 **다시 처리**로 재시도할 수 있습니다. |
| Notion 카드에 "누락 속성 N개" | DB를 직접 만든 경우입니다. `누락 속성 추가` 버튼을 누르면 빠진 속성만 생성됩니다. (Title 속성은 Notion이 항상 유지하므로 목록에 없습니다.) |
| 검색했는데 항목이 안 보임 | Notion에서 **최근 100건**만 먼저 조회합니다. 목록 하단 `다음 100건 더 보기`로 최대 500건까지 늘리거나, 검색어를 좁히세요. 조회 범위는 목록 위·아래에 표시됩니다. |
| 실패 항목을 복구하고 싶음 | `EXTRACT_FAILED`/`AI_FAILED` 카드의 **본문 직접 붙여넣고 재요약**에 게시물 본문(20자 이상)을 넣으면 추출을 건너뛰고 요약부터 다시 진행합니다. |

## 7. 동작 방식 메모

- **추출 전략**(무료, 비인증): FxTwitter API → 트위터 syndication CDN → oEmbed → RSSHub 순서로 시도합니다.
- **필터**(blog-writer collector_bot.py 참고): URL 정규화 중복 검사, 게시물 나이, AI 관련성 판단, 발행 제목 유사도(Dice bigram ≥ 0.8).
- **엔진 추상화**: `src/lib/xconda/ai.ts`의 `AIEngine` 인터페이스만 지키면 OpenAI/Claude 엔진으로 교체할 수 있습니다.
- 관리자 페이지는 기존 시트 메일러와 마찬가지로 별도 인증이 없으니, 공개 배포에서는 `CRON_SECRET` 설정과 함께
  접근 제한(예: Vercel Protection)을 권장합니다.
