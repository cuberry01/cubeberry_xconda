# 콘텐츠 자동화 엔진 확장 계획 — Xconda → Shorts 파이프라인

> 대상 저장소: `cuberry01/cubeberry_xconda` (Next.js 16 / App Router / Drizzle+Supabase / Vercel)
> 목표: 기존 `X/RSS → Gemini → Notion → 공지` 파이프라인 위에
> `Script → Scene Plan → Video → Composition → QA → YouTube` 분기를 추가.

---

## 0. 현재 저장소 실사 (무엇이 이미 있나)

| 다이어그램 블록 | 현재 파일 | 상태 |
| --- | --- | --- |
| Collector (X / RSS / URL) | `src/lib/xconda/feeds.ts`, `src/app/xconda/actions.ts` | ✅ 구현됨 (RSSHub/Nitter 브릿지 + 수동 URL) |
| Text Extract | `src/lib/xconda/extract.ts` | ✅ FxTwitter → syndication → oEmbed → RSSHub → 웹페이지 |
| Gemini 요약 | `src/lib/xconda/ai.ts` (`AIEngine` 인터페이스 + `GeminiEngine`) | ✅ 엔진 추상화까지 되어 있음 |
| Notion Content DB | `src/lib/xconda/notion.ts` (`PROP` 스키마, CRUD, DB 자동생성) | ✅ single source of truth |
| 상태 관리 | `src/lib/xconda/types.ts` (`X_STATUSES`) | ⚠️ 블로그용 9개 상태만 있음 → Shorts 상태 추가 필요 |
| 오케스트레이션 | `src/lib/xconda/pipeline.ts` (`runXcondaTick`), `src/app/api/cron/route.ts` | ⚠️ 확장 필요 |
| Blog/Post 퍼블리시 | `src/app/notices/page.tsx`, `pipeline.publishItem` | ✅ (+ 뉴스레터 대기열 연동) |
| **Shorts 전체** | — | ❌ 없음 |
| **Video/Audio 엔진** | — | ❌ 없음 |
| **YouTube 퍼블리셔** | — | ❌ 없음 |

> 결론: "blog-writer를 참고해 새로 만든다"가 아니라 **이 저장소의 xconda 모듈을 그대로 재사용하고 shorts 레일만 병렬로 추가**하는 게 맞다. 수집·추출·AI·Notion은 재작성하지 않는다.

### 정리: 제안 구조 → 이 저장소로의 매핑

제안된 `collectors/ extractors/ ai/ notion/ shorts/ engines/ publishers/ scheduler/` 를
Next.js 관례에 맞춰 `src/lib/` 아래로 접는다. (최상위 디렉터리로 빼면 App Router 빌드/배포에서 손해만 본다.)

```text
src/lib/
├─ xconda/                 # 기존 — 이름 유지 (collectors+extractors+ai+notion)
│   ├─ feeds.ts            # = collectors/{x,rss}
│   ├─ extract.ts          # = extractors/{x,webpage}
│   ├─ ai.ts               # = ai/gemini  (summary)
│   ├─ notion.ts           # = notion/database
│   ├─ pipeline.ts         # = scheduler (블로그 레일)
│   └─ types.ts config.ts similarity.ts util.ts
│
├─ shorts/                 # 신규 — Shorts 레일
│   ├─ types.ts            # ShortsStatus, ScriptDoc, ScenePlan, RenderJob
│   ├─ script.ts           # = ai/script    (Gemini → hook/body/ending/duration)
│   ├─ scene.ts            # = ai/scene     (script → scenes[])
│   ├─ subtitle.ts         # SRT/ASS 생성 (타이밍 계산)
│   ├─ storage.ts          # Supabase Storage 업로드/서명 URL
│   ├─ notion.ts           # Shorts 전용 Notion 속성 read/write
│   └─ pipeline.ts         # = scheduler (Shorts 레일 틱)
│
├─ engines/                # 신규 — 교체 가능한 provider adapter
│   ├─ video/
│   │   ├─ types.ts        # VideoEngine 인터페이스
│   │   ├─ seedance.ts     # 1순위 adapter
│   │   ├─ wan.ts          # stub
│   │   ├─ kling.ts        # stub
│   │   └─ slideshow.ts    # 영상생성 없이 이미지 슬라이드 (폴백/저비용 모드)
│   └─ audio/
│       ├─ types.ts        # TTSEngine 인터페이스
│       ├─ elevenlabs.ts
│       └─ gemini-tts.ts
│
└─ publishers/             # 신규
    ├─ youtube.ts          # OAuth refresh token → resumable upload
    └─ (blog/landing 은 기존 notices + contents 로 이미 존재)

worker/                    # 신규 — Vercel 밖에서 도는 렌더러 (FFmpeg)
```

---

## 1. 반드시 먼저 정해야 하는 아키텍처 결정

### 1-1. FFmpeg는 Vercel에서 못 돈다 → 렌더 워커 분리

`src/app/api/cron/route.ts` 의 `maxDuration = 60`, Vercel 함수는 읽기 전용 FS(`/tmp` 512MB)에 바이너리 상주 불가.
Shorts 1편 렌더는 보통 2~10분. 따라서:

```text
[Vercel / Next.js]                       [Render Worker  (Fly.io / Railway / 집 서버 / GitHub Actions)]
 상태보드 + Notion + Gemini                 FFmpeg + 다운로드 + 합성 + 업로드
 ─ POST /api/shorts/jobs  (claim) ◄────── 폴링(10s): 다음 RENDERING 작업 가져오기
 ─ POST /api/shorts/jobs/:id/complete ◄── 결과 파일 URL + 로그 회신
```

- 작업 큐는 **Postgres 테이블 `shorts_jobs`** 로 충분하다 (이미 Drizzle+Supabase 사용 중, 새 인프라 0).
- 산출물(mp4/mp3/png)은 **Supabase Storage** 버킷 `shorts`. Notion에는 URL만 저장.
- 워커 인증: `WORKER_SECRET` Bearer (기존 `CRON_SECRET` 패턴 그대로).

### 1-2. Notion은 계속 single source of truth, Postgres는 작업 큐
사람이 보는 상태/대본/리뷰는 Notion, 기계가 쓰는 재시도·잠금·로그는 Postgres. 두 개를 섞지 않는다.

### 1-3. 자동 업로드 금지 게이트
`VIDEO_READY → REVIEW → APPROVED` 는 **사람이 Notion 체크박스(`Approved`)를 켜야만** 넘어간다.
`runShortsTick()` 은 절대 `REVIEW` 를 스스로 통과시키지 않는다. (코드로 강제)

---

## 2. 상태 머신

기존 9개 상태(`src/lib/xconda/types.ts`)는 **블로그 레일 전용으로 유지**하고, Shorts는 별도 축으로 둔다.
Notion 속성도 `Status`(기존) 와 `Shorts Status`(신규)로 분리 → 기존 파이프라인 회귀 위험 0.

```text
Shorts Status:
  NONE → IDEA → SCRIPT_READY → SCENE_READY → VIDEO_GENERATING → VIDEO_READY
       → REVIEW → APPROVED → UPLOADING → PUBLISHED
  실패: SCRIPT_FAILED / SCENE_FAILED / VIDEO_FAILED / UPLOAD_FAILED
  종료: SKIPPED
```

전이 주체:

| 전이 | 주체 | 트리거 |
| --- | --- | --- |
| `SUMMARIZED`(블로그) → `IDEA` | 자동/수동 | 설정 `shortsAuto` 또는 관리자 "숏츠 만들기" 버튼 |
| `IDEA → SCRIPT_READY` | Vercel tick | `shorts/script.ts` (Gemini) |
| `SCRIPT_READY → SCENE_READY` | Vercel tick | `shorts/scene.ts` (Gemini) |
| `SCENE_READY → VIDEO_GENERATING` | Vercel tick | job enqueue + VideoEngine 호출 |
| `VIDEO_GENERATING → VIDEO_READY` | Worker | 렌더 완료 콜백 |
| `VIDEO_READY → REVIEW` | 자동 | 즉시(사람 알림용) |
| `REVIEW → APPROVED` | **사람** | Notion `Approved` 체크박스 또는 관리자 화면 |
| `APPROVED → UPLOADING → PUBLISHED` | Vercel tick | `publishers/youtube.ts` |

---

## 3. 파일 단위 작업 목록

### 3-A. 수정할 기존 파일 (7개)

| 파일 | 변경 내용 | 위험도 |
| --- | --- | --- |
| `src/db/schema.ts` | `shortsJobs` 테이블 추가; `settings` 에 `shortsEnabled / shortsAutoFromSummary / shortsVideoProvider / shortsTtsProvider / shortsMaxDuration / youtubePrivacy` 컬럼 추가 | 낮음 (append only) |
| `supabase/migrations/2026xxxx_shorts.sql` (신규) + `drizzle/0002_shorts.sql` | 위 스키마의 `IF NOT EXISTS` 안전 마이그레이션. 기존 `20260930000000_xconda.sql` 스타일 그대로 | 낮음 |
| `src/lib/xconda/notion.ts` | `PROP` 에 Shorts 속성 12종 추가(`Shorts Status`, `Script JSON`, `Scene JSON`, `Video URL`, `Audio URL`, `Subtitle URL`, `Final URL`, `Thumbnail URL`, `YouTube URL`, `Approved`, `Duration`, `Shorts Note`); `toProperties`/`parsePage`/`ensureDatabase` 확장 | **중간** — 기존 DB에 속성이 없으면 Notion이 400을 던진다 → `ensureDatabase()` 에 "누락 속성만 PATCH 추가" 로직 필요 |
| `src/lib/xconda/config.ts` | `XcondaConfig` 에 shorts 관련 필드 + `ShortsConfig` 리졸버 추가 (시크릿은 env only: `SEEDANCE_API_KEY`, `ELEVENLABS_API_KEY`, `YOUTUBE_*`, `WORKER_SECRET`) | 낮음 |
| `src/lib/xconda/pipeline.ts` | `processItem()` 끝에서 `cfg.shortsAutoFromSummary` 면 `Shorts Status = IDEA` 로 마킹만 (렌더는 별도 틱). `runXcondaTick()` 에서 `runShortsTick()` 호출 | 낮음 |
| `src/app/api/cron/route.ts` | `runShortsTick()` 추가 호출 + 로그 머지 (`runXcondaTick` 과 동일 패턴) | 낮음 |
| `src/app/xconda/page.tsx` / `actions.ts` | 항목 카드에 "숏츠 만들기 / 대본 보기 / 영상 미리보기 / 승인" 액션 추가 | 중간(UI) |
| `vercel.json` | 크론 `5 0 * * *` → `*/5 * * * *` 권장 (Shorts 상태 진행용). Hobby 플랜은 일 1회 제한이라 외부 cron-job.org 유지 시 변경 불필요 | 낮음 |
| `package.json` | 런타임 의존성 추가 없음(fetch 기반). 워커는 별도 `worker/package.json` | — |

### 3-B. 새로 만들 파일

#### 엔진 추상화 (교체 가능성이 핵심)

```ts
// src/lib/engines/video/types.ts
export interface VideoEngine {
  readonly name: string;                     // "seedance" | "wan" | "kling" | "slideshow"
  readonly kind: "generative" | "composite"; // slideshow 는 composite
  generate(scene: ScenePlanItem, opts: VideoGenOptions): Promise<VideoJobHandle>;
  poll(handle: VideoJobHandle): Promise<VideoJobStatus>;   // queued|running|done|failed + url
  estimateCost?(scenes: ScenePlanItem[]): number;
}
```

```ts
// src/lib/engines/audio/types.ts
export interface TTSEngine {
  readonly name: string;
  synthesize(input: { text: string; voiceId?: string; speed?: number })
    : Promise<{ audioUrl: string; durationSec: number; wordTimings?: WordTiming[] }>;
}
```

- `seedance.ts` — 첫 adapter. 비동기 작업 생성 → task id → 폴링. 씬별 prompt + 9:16 + duration.
- `slideshow.ts` — **먼저 이걸 구현할 것.** 씬 이미지(기존 `imageUrl` 또는 Gemini 이미지) + Ken Burns 팬/줌만으로 Shorts 완성. 영상 API 키 없이 파이프라인 전 구간을 E2E로 검증할 수 있는 유일한 경로.
- `wan.ts` / `kling.ts` — 인터페이스만 맞춘 stub (`throw new Error("미구현")`).
- `elevenlabs.ts` — `durationSec` 과 문자 단위 타이밍(자막 싱크에 필수) 확보. `gemini-tts.ts` 는 폴백.

#### Shorts 도메인

| 파일 | 역할 | 핵심 계약 |
| --- | --- | --- |
| `src/lib/shorts/types.ts` | `SHORTS_STATUSES`, `ScriptDoc`, `ScenePlan`, `RenderSpec` | 아래 3-C 스키마 |
| `src/lib/shorts/script.ts` | Gemini → `{hook, body[], ending, duration, keywords}` — 원문이 아니라 **기존 `summary`+`originalText`** 를 입력으로 | `responseMimeType: application/json` + Zod급 수동 검증(`ai.ts`의 `parseResult` 패턴 재사용) |
| `src/lib/shorts/scene.ts` | 스크립트 → `scenes[{index,duration,text,visual,prompt,imageRef}]`, 합=`duration`±2s, 씬당 3~7s, 최대 8씬 | 총 길이 보정 로직 포함 |
| `src/lib/shorts/subtitle.ts` | 씬 텍스트 + TTS 타이밍 → SRT(+ASS 스타일). 한국어 2줄/줄당 13자 룰 | 순수 함수 → **단위 테스트 대상 1순위** |
| `src/lib/shorts/storage.ts` | Supabase Storage `shorts/{pageId}/{kind}.{ext}` 업/다운로드, 서명 URL | 서비스 롤 키는 서버 전용 |
| `src/lib/shorts/notion.ts` | Shorts 속성 전용 reader/writer (`getShortsItem`, `patchShorts`) | 기존 `notion.ts` 의 `notionFetch` 재사용 |
| `src/lib/shorts/jobs.ts` | `shorts_jobs` enqueue / claim(FOR UPDATE SKIP LOCKED) / complete / 재시도·백오프 | 동시성 안전 |
| `src/lib/shorts/pipeline.ts` | `runShortsTick()` — 상태별 소량 배치 처리, `REVIEW` 통과 금지 가드 | `MAX_PER_TICK = 2` |

#### API 라우트 (워커 ↔ Vercel)

| 파일 | 메서드 | 역할 |
| --- | --- | --- |
| `src/app/api/shorts/jobs/route.ts` | `POST` | 워커가 작업 1건 claim (Bearer `WORKER_SECRET`) |
| `src/app/api/shorts/jobs/[id]/route.ts` | `PATCH` | 진행률/로그 업데이트 |
| `src/app/api/shorts/jobs/[id]/complete/route.ts` | `POST` | 결과 URL 회신 → Notion `VIDEO_READY` + `REVIEW` |
| `src/app/api/shorts/preview/[pageId]/route.ts` | `GET` | 서명 URL 리다이렉트(관리자 미리보기) |
| `src/app/api/youtube/oauth/route.ts` | `GET` | 최초 1회 refresh token 발급용 콜백 |

#### 관리자 UI

| 파일 | 역할 |
| --- | --- |
| `src/app/shorts/page.tsx` | 상태별 칸반(IDEA/SCRIPT/VIDEO/REVIEW/PUBLISHED) + 대본·씬 인라인 편집 |
| `src/app/shorts/actions.ts` | server actions: 숏츠 생성, 대본 재생성, 씬 수정, **승인**, 업로드, 스킵 |
| `src/components/ShortsPreview.tsx` | 9:16 `<video>` + 씬 타임라인 |
| `src/components/Nav.tsx` (수정) | "숏츠" 탭 추가 |

#### 워커 (Vercel 밖)

```text
worker/
├─ package.json          # node 22, 의존성: 없음(내장 fetch) + fluent-ffmpeg 선택
├─ Dockerfile            # FROM node:22-slim + ffmpeg
├─ src/index.ts          # 폴링 루프: claim → render → complete
├─ src/render.ts         # 씬 클립 다운로드 → concat → TTS 믹스 → BGM ducking → 자막 burn-in → 워터마크 → 9:16 crop
├─ src/ffmpeg.ts         # 명령 빌더 (아래 3-D)
└─ README.md             # 로컬/Fly.io 실행법
```

#### 문서

- `docs/SHORTS_SETUP.md` — API 키 발급(Seedance/ElevenLabs/YouTube OAuth), Notion 속성 추가, 워커 배포. (`XCONDA_SETUP.md` 문체 그대로)
- `XCONDA_SETUP.md` 에 Shorts 섹션 링크 한 줄 추가.

---

## 3-C. 데이터 계약 (확정안)

```jsonc
// Script JSON  (Notion rich_text, 2000자 청크 분할 저장)
{
  "hook": "지금 AI 영상 만드는 사람이라면 이걸 알아야 합니다.",
  "body": ["문장1", "문장2", "문장3"],
  "ending": "자세한 건 프로필 링크에서.",
  "duration": 35,          // 목표 초 (20~59)
  "keywords": ["Seedance", "AI 영상"],
  "titleForYoutube": "…",
  "description": "…",
  "hashtags": ["#AI", "#쇼츠"]
}
```

```jsonc
// Scene JSON
{
  "aspect": "9:16",
  "totalDuration": 35,
  "scenes": [
    {
      "index": 0,
      "duration": 4,
      "text": "지금 AI 영상 만드는 사람이라면",   // 자막/TTS 문구
      "visual": "화면 가득 찬 타이포 + 어두운 배경",  // 사람이 읽는 연출 노트
      "prompt": "cinematic dark studio, neon text glow, vertical 9:16, slow push-in",  // 영상/이미지 모델 입력
      "imageRef": null,     // 있으면 슬라이드쇼 모드에서 사용
      "transition": "cut"
    }
  ]
}
```

`shorts_jobs` 테이블:

```sql
create table if not exists shorts_jobs (
  id            serial primary key,
  page_id       text not null,              -- Notion page id
  kind          text not null,              -- 'render' | 'upload'
  status        text not null default 'queued', -- queued|claimed|running|done|failed
  spec          jsonb not null default '{}'::jsonb,  -- RenderSpec (씬 URL, TTS URL, 자막, 워터마크)
  result        jsonb,
  progress      integer not null default 0,
  attempts      integer not null default 0,
  claimed_by    text,
  claimed_at    timestamptz,
  finished_at   timestamptz,
  error         text,
  created_at    timestamptz not null default now()
);
create index if not exists shorts_jobs_status_idx on shorts_jobs (status, created_at);
```

## 3-D. FFmpeg 합성 순서 (worker/src/ffmpeg.ts)

```text
1) 씬별 클립 정규화 :  scale=1080:1920:force_original_aspect_ratio=increase, crop=1080:1920, fps=30
   (슬라이드쇼 모드: zoompan 으로 Ken Burns)
2) concat (filter_complex, 트랜지션은 xfade 0.2s)
3) 오디오 : TTS(-0dB) + BGM(sidechaincompress 로 -18dB ducking) → amix
4) 자막   : subtitles=out.ass  (burn-in, 한국어 폰트 Pretendard 임베드)
5) 워터마크: overlay=W-w-40:H-h-120
6) 출력   : -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart
7) 썸네일 : -ss 00:00:01 -vframes 1 thumb.jpg
```

품질 게이트(자동 QA, 통과 못하면 `VIDEO_FAILED`): 길이 15~59s, 해상도 1080x1920, 오디오 트랙 존재, 무음 구간 < 3s, 파일 < 100MB.

---

## 4. 구현 순서 (PR 단위)

| # | PR | 내용 | 검증 방법 | 예상 |
| --- | --- | --- | --- | --- |
| 1 | `shorts: 스키마 + 상태머신` | `db/schema.ts`, 마이그레이션, `shorts/types.ts`, Notion 속성 확장 + `ensureDatabase` 누락속성 PATCH | 기존 파이프라인 회귀 없음 확인, Notion DB에 속성 자동 생성 | 0.5일 |
| 2 | `shorts: 대본/씬 생성` | `script.ts`, `scene.ts`, `shorts/notion.ts`, `runShortsTick` 의 IDEA→SCENE_READY 구간, 관리자 화면 대본 확인 | 실제 X 항목 하나로 `IDEA → SCENE_READY` | 1일 |
| 3 | `shorts: TTS + 자막` | `engines/audio/*`, `subtitle.ts`, `storage.ts` | mp3 + srt 산출물이 Storage에 뜸 | 1일 |
| 4 | `shorts: 슬라이드쇼 렌더 워커` | `worker/*`, `api/shorts/jobs/*`, `slideshow.ts` | **키 없이 첫 shorts.mp4 완성** ← 최대 마일스톤 | 1.5일 |
| 5 | `shorts: 리뷰 게이트 + 칸반 UI` | `app/shorts/*`, `ShortsPreview`, 승인 액션 | 승인 없이는 업로드 불가 확인 | 1일 |
| 6 | `publishers: YouTube` | `publishers/youtube.ts`, OAuth 라우트, APPROVED→PUBLISHED | 비공개(unlisted)로 실업로드 | 1일 |
| 7 | `engines: Seedance adapter` | `seedance.ts` + provider 스위치 | 같은 항목을 슬라이드쇼/Seedance 둘 다로 렌더 | 1일 |
| 8 | `engines: Wan/Kling stub + 비용 가드` | 월 렌더 상한, 실패 백오프 | — | 0.5일 |

> 4번(슬라이드쇼)을 3번보다 먼저 당기고 싶다면 무음 영상으로 먼저 돌려도 된다. 중요한 건 **유료 영상 API를 붙이기 전에 전 구간이 한 번 끝까지 흐르는 것**.

---

## 5. 환경변수 추가분 (`.env.example` 갱신)

```text
# --- Shorts ---
WORKER_SECRET=                      # 렌더 워커 인증 (필수)
SUPABASE_URL=                       # Storage 업로드
SUPABASE_SERVICE_ROLE_KEY=
SHORTS_BUCKET=shorts

# Video providers (선택 — 없으면 slideshow 모드)
SEEDANCE_API_KEY=
SEEDANCE_BASE_URL=
WAN_API_KEY=
KLING_API_KEY=

# TTS
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
# (폴백) GEMINI_API_KEY 재사용 — Gemini TTS

# YouTube
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REFRESH_TOKEN=
YOUTUBE_DEFAULT_PRIVACY=unlisted    # 안전 기본값
```

---

## 6. 리스크와 대응

| 리스크 | 대응 |
| --- | --- |
| Notion 속성 미생성 상태에서 PATCH → 400 | `ensureDatabase()` 가 매 틱이 아니라 **설정 저장 시 1회** 누락 속성만 추가. 런타임은 없는 속성 무시 |
| Notion rich_text 2000자 제한에 Script/Scene JSON이 걸림 | 기존 `richTextChunks()` 재사용(최대 ~22k자). 초과 시 Storage에 JSON 업로드 후 URL만 저장 |
| 영상 생성 비용 폭주 | `settings.shortsMonthlyLimit` + `shorts_jobs` 집계로 하드 캡. 기본 자동 생성 **OFF** |
| 워커 다운 → 작업 영구 claimed | `claimed_at` 10분 초과 시 자동 requeue (`attempts < 3`) |
| AI가 이상한 영상 → 자동 업로드 | `REVIEW` 게이트를 코드 레벨에서 강제 + YouTube 기본 `unlisted` |
| 저작권(BGM/이미지) | BGM은 로열티프리 로컬 파일만 화이트리스트, 출처를 Notion `Note` 에 기록 |
| 기존 메일러 회귀 | Shorts 코드는 별도 모듈 + 별도 틱. `settings.shortsEnabled=false` 면 import 경로조차 타지 않음 |

---

## 7. 이번 계획에서 **하지 않는** 것

- blog-writer 코드 직접 이식 (필요한 패턴은 이미 `xconda/` 에 반영됨)
- 최상위 `collectors/ extractors/ …` 디렉터리 재배치 — Next.js 빌드/배포 이점이 없고 기존 import 전부 깨짐
- Vercel 안에서의 FFmpeg 실행
- 인스타 릴스/틱톡 퍼블리셔 (`publishers/` 인터페이스만 열어두고 YouTube부터)
```

