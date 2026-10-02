# Design System Master File — Xconda

> **LOGIC:** 특정 페이지를 만들 때 먼저 `design-system/xconda/pages/[page-name].md`를 확인합니다.
> 파일이 있으면 이 Master 규칙을 **덮어씁니다**. 없으면 아래 규칙을 따릅니다.

**Project:** Xconda (AI 소식 수집·요약 대시보드)
**Base:** `ui-ux-pro-max` `--design-system` (Variance 3/10 · Motion 3/10 · Density 8/10) 결과를
저장소의 Tailwind v4 토큰으로 **구현에 맞게 조정**한 문서입니다.
**적용 위치:** `src/app/globals.css` (`@theme`), `src/components/ui.tsx`, `src/components/SubmitButton.tsx`

---

## 1. 컬러 토큰 (구현값)

어두운 관제실(Dark Ops) 테마 + 상태 초록. `src/app/globals.css`의 `@theme`에 정의되어 있고,
컴포넌트에서는 **raw hex 대신 토큰 유틸리티**(`bg-surface`, `text-muted`, `ring-line` …)만 사용합니다.

| 역할 | 토큰 | 값 | 대비(배경 대비) |
|------|------|-----|-----------------|
| 페이지 배경 | `--color-canvas` | `#0F172A` | — |
| 카드/패널 | `--color-surface` | `#1B2336` | — |
| 보조 면(호버·코드) | `--color-surface-2` | `#272F42` | — |
| 호버 강조 면 | `--color-surface-3` | `#313C55` | — |
| 얇은 테두리 | `--color-line` | `#2B3550` | 비텍스트 |
| 입력/구분 테두리 | `--color-line-strong` | `#475569` | 비텍스트 |
| 본문 텍스트 | `--color-ink` | `#F8FAFC` | 16:1 이상 |
| 보조 텍스트 | `--color-ink-2` | `#CBD5E1` | 10:1 |
| 흐린 텍스트 | `--color-muted` | `#94A3B8` | 6.1:1 (카드 기준) |
| 가장 흐린 텍스트 | `--color-faint` | `#8B9AB5` | 4.6:1 이상 |
| 액션/성공 | `--color-primary` | `#22C55E` | 버튼 위 텍스트 `--color-on-primary` `#06210F` |
| 액션 호버 | `--color-primary-strong` | `#16A34A` | — |
| 정보/링크 | `--color-accent` | `#38BDF8` | 7:1 |
| 경고 | `--color-warn` | `#FBBF24` | 9:1 |
| 오류 | `--color-danger` | `#FB7185` | 7:1 |

**규칙**
- 상태를 색만으로 전달하지 않는다. 항상 텍스트 배지·라벨을 함께 표시(`Badge`, `StatCard`).
- 배지류는 `bg-<tone>/15 + text-<tone>-300 + ring-<tone>/30` 조합으로 통일 (다크 배경에서 4.5:1 이상).
- 텍스트 대비는 4.5:1 미만 금지. 흐린 텍스트를 더 어둡게 만들지 말 것.

## 2. 타이포그래피

| 역할 | 폰트 | 비고 |
|------|------|------|
| 본문/UI | **IBM Plex Sans KR** | 한글 글리프 포함, 대시보드·데이터 톤 (스킬 권장 Fira Sans는 한글 미지원 → 대체) |
| 숫자/코드/ID | **Fira Code** | 날짜·핸들·DB ID·코드 블록에 `font-mono` |

- 로딩: `src/app/layout.tsx`에서 Google Fonts `<link>` (`display=swap`).
  `next/font/google`은 빌드 시 네트워크가 필요하므로 사용하지 않는다(오프라인 빌드 대응).
- 본문 기본 16px, 데이터 표/보조 텍스트 14px(`text-sm`), 최소 12px 이상만 사용.
- 숫자 정렬이 필요한 곳은 `font-mono` + `tabular-nums`(Fira Code 기본).

## 3. 간격·형태 (Density 8/10)

| 항목 | 값 |
|------|-----|
| 카드 라운드 | `rounded-2xl` (16px) |
| 입력/버튼 라운드 | `rounded-xl` (12px) |
| 카드 패딩 | `p-4`(상태 카드) / `p-5`(패널 본문) |
| 섹션 간격 | `gap-4`(카드 그리드) · `gap-6`(패널) · `mb-6`(헤더) |
| 페이지 컨테이너 | `max-w-6xl px-4` |

## 4. 컴포넌트 규칙

- **버튼** (`SubmitButton`, `LinkButton`, `BUTTON_*`): primary(초록 채움) / secondary(면+테두리) /
  danger(로즈 아웃라인) / ghost(텍스트). 최소 높이 **44px(모바일)·36px(≥640px)**,
  `cursor-pointer`, 150ms 트랜지션, `motion-safe:active:translate-y-px`.
  서버 액션 중에는 스피너 + `aria-busy` + `pendingText`.
- **입력** (`inputClass`, `textareaClass`): 항상 **보이는 라벨**(`labelClass`)과 필요 시 힌트(`hintClass`).
  플레이스홀더만으로 라벨을 대신하지 않는다. 포커스는 전역 `:focus-visible` 아웃라인(2px, primary) 유지.
- **패널** (`Panel`): `제목 + 설명 + 액션 슬롯 + 본문`. 목록형 패널은 `bodyClassName=""` 후 내부에서
  `divide-y divide-line/70` 리스트를 사용한다.
- **상태 카드** (`StatCard`): 라벨 + 값 + 힌트 + 상태 점(장식). 값 텍스트가 항상 상태를 말로 전달.
- **빈 상태** (`EmptyState`): 아이콘 + 제목 + 설명 + **다음 행동 버튼**. 빈 화면을 그대로 두지 않는다.
- **목록**: 모바일에서 가로 스크롤(`overflow-x-auto` + `min-w-*`) 또는 카드형 리스트.
  화면 밖으로 잘리는 표는 금지. 표에는 `caption`(sr-only)과 `scope="col"`을 넣는다.
- **내비게이션**: 데스크톱은 상단, 모바일(<640px)은 하단 탭 5개(44px 이상, safe-area 패딩).
  활성 항목은 `aria-current="page"` + 색·배경 동시 표기.

## 5. 모션

- 기본은 CSS 트랜지션 150–250ms. GSAP/스크롤 애니메이션은 사용하지 않는다(정보 밀도 우선).
- `prefers-reduced-motion: reduce`에서 애니메이션·트랜지션을 사실상 제거(전역 처리).
- 레이아웃을 흔드는 호버(scale/translate로 주변 밀기) 금지. 등장 애니메이션은 `flash-in`(4px)만 사용.

## 6. 금지 패턴 (Do NOT)

- ❌ 이모지를 아이콘으로 사용 (인라인 SVG `src/components/icons.tsx`만 사용)
- ❌ 낮은 대비 텍스트(4.5:1 미만) / 회색 위 회색
- ❌ 포커스 표시 제거(`outline-none` 단독 사용)
- ❌ 플레이스홀더만 있는 폼 필드, 상단에만 몰린 오류 안내
- ❌ 상태를 색으로만 구분, 무한 스피너만 있고 진행 상황을 알 수 없는 로딩
- ❌ 44px 미만 터치 타깃, 고정 내비게이션에 가려지는 콘텐츠
- ❌ 모바일 가로 스크롤(컨테이너 없이 넘치는 표/긴 URL)

## 7. 배포 전 체크리스트

- [x] 이모지 대신 인라인 SVG 아이콘 (일관된 1.75px 스트로크 세트)
- [x] 모든 클릭 요소 `cursor-pointer`
- [x] 호버/포커스 트랜지션 150–300ms, 150ms 통일
- [x] 텍스트 대비 4.5:1 이상 (muted 6.1:1, faint 4.6:1)
- [x] 키보드 포커스 링 상시 노출 + 본문 바로가기 링크
- [x] `prefers-reduced-motion` 존중
- [x] 반응형: 375 / 768 / 1024 / 1440 (sm·lg·xl 브레이크포인트)
- [x] 44px 터치 타깃 · 모바일 하단 탭에 가려지는 콘텐츠 없음(`main` 하단 패딩)
- [x] 빈 상태마다 다음 행동 안내, 로딩 상태는 스피너 + `aria-busy`
- [x] 이미지 `aspect-ratio` + `loading="lazy"`로 CLS 억제
