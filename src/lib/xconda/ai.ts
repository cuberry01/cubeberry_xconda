// AI 요약 엔진 — blog-writer의 Engine 추상화 패턴 참고.
// 지금은 Gemini 하나뿐이지만 인터페이스로 분리해 두면 OpenAI/Claude로 교체하기 쉽다.

import type { XcondaConfig } from "./config";

export interface SummarizeInput {
  url: string;
  author: string;
  date: Date | null;
  text: string;
}

export interface SummarizeResult {
  title: string;
  summary: string;
  announcement: string;
  category: string;
  tags: string[];
  relevant: boolean;
  reason: string;
}

export interface AIEngine {
  readonly name: string;
  summarize(input: SummarizeInput): Promise<SummarizeResult>;
}

const SYSTEM = `당신은 X(트위터) 게시물과 웹 콘텐츠를 랜딩 페이지 공지로 요약하는 한국어 에디터입니다.

규칙:
- 모든 출력은 한국어로 작성합니다. 원문이 영어여도 요약은 한국어입니다.
- 원문에 있는 사실만 담습니다. 추측, 과장, 광고성 표현을 추가하지 않습니다.
- 해시태그와 멘션 표시는 요약에서 제거하되 고유명사는 유지합니다.
- title: 40자 이내. 핵심 주제가 드러나게 구체적으로 씁니다(모델명·회사명 포함).
- summary: 2~4문장. 무엇이 새롭고 왜 중요한지.
- announcement: 랜딩 페이지 공지 카드에 쓸 1~2문장. 독자에게 말하듯 간결하게.
- category: "AI 모델", "AI 영상", "AI 이미지", "AI 도구", "뉴스", "기타" 중 하나만.
- tags: 3~5개, 각 15자 이내.
- relevant: AI·기술 소식으로 공지 가치가 있으면 true, 아니면 false.
- reason: relevant 판단 이유를 한 문장으로.

반드시 아래 JSON 형식만 출력합니다. 다른 설명은 넣지 않습니다.
{"title":"...","summary":"...","announcement":"...","category":"...","tags":["..."],"relevant":true,"reason":"..."}`;

function buildPrompt(input: SummarizeInput): string {
  const date = input.date ? input.date.toISOString().slice(0, 10) : "알 수 없음";
  const text = input.text.slice(0, 15_000);
  return `[작성자] ${input.author || "알 수 없음"}
[날짜] ${date}
[출처] ${input.url}

[원문]
${text}`;
}

function extractJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        // 아래로 흘러 에러 처리
      }
    }
    throw new Error(`Gemini 출력을 JSON으로 파싱하지 못했습니다: ${text.slice(0, 200)}`);
  }
}

function parseResult(raw: string): SummarizeResult {
  const o = extractJson(raw) as Record<string, unknown>;
  const str = (v: unknown, max: number, fallback = "") =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : fallback;
  const tags = Array.isArray(o.tags)
    ? o.tags.filter((t): t is string => typeof t === "string" && !!t.trim()).map((t) => t.trim().slice(0, 20)).slice(0, 5)
    : [];
  return {
    title: str(o.title, 80) || "제목 없음",
    summary: str(o.summary, 1000),
    announcement: str(o.announcement, 500),
    category: str(o.category, 40) || "기타",
    tags,
    relevant: typeof o.relevant === "boolean" ? o.relevant : true,
    reason: str(o.reason, 300),
  };
}

export class GeminiEngine implements AIEngine {
  readonly name = "gemini";

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async summarize(input: SummarizeInput): Promise<SummarizeResult> {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: "user", parts: [{ text: buildPrompt(input) }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 2048,
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(45_000),
      },
    );
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      throw new Error(`Gemini API ${res.status}: ${detail}`);
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      promptFeedback?: { blockReason?: string };
    };
    const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    if (!text.trim()) {
      throw new Error(`Gemini가 응답하지 않았습니다 (${data.promptFeedback?.blockReason ?? "원인 불명"})`);
    }
    return parseResult(text);
  }
}

export function getAIEngine(cfg: XcondaConfig): AIEngine {
  if (!cfg.geminiApiKey) {
    throw new Error("GEMINI_API_KEY 환경변수가 설정되지 않았습니다. XCONDA_SETUP.md를 참고하세요.");
  }
  return new GeminiEngine(cfg.geminiApiKey, cfg.geminiModel);
}

export async function summarizeWithAI(cfg: XcondaConfig, input: SummarizeInput): Promise<SummarizeResult> {
  return getAIEngine(cfg).summarize(input);
}
