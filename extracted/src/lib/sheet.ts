import { createHash } from "crypto";
import { parseKstDateTime } from "./time";

export function parseSheetUrl(url: string): { id: string; gid: string | null } | null {
  const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const id = idMatch?.[1] ?? (/^[a-zA-Z0-9-_]{25,}$/.test(url.trim()) ? url.trim() : null);
  if (!id) return null;
  const gidMatch = url.match(/[#&?]gid=(\d+)/);
  return { id, gid: gidMatch?.[1] ?? null };
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export async function fetchSheetRows(url: string): Promise<string[][]> {
  const parsed = parseSheetUrl(url);
  if (!parsed) throw new Error("올바른 구글 스프레드시트 URL이 아닙니다.");
  const exportUrl = `https://docs.google.com/spreadsheets/d/${parsed.id}/export?format=csv${
    parsed.gid ? `&gid=${parsed.gid}` : ""
  }`;
  const res = await fetch(exportUrl, { cache: "no-store", redirect: "follow" });
  const ct = res.headers.get("content-type") ?? "";
  if (!res.ok || ct.includes("text/html")) {
    throw new Error(
      `시트를 읽을 수 없습니다 (HTTP ${res.status}). 공유 설정을 '링크가 있는 모든 사용자 - 뷰어'로 바꿔주세요.`,
    );
  }
  const text = await res.text();
  return parseCsv(text.replace(/^\uFEFF/, ""));
}

const COLUMN_ALIASES: Record<string, string[]> = {
  id: ["id", "번호", "no", "key"],
  schedule: ["발송일시", "발송시간", "발송일", "발송 일시", "예약일시", "날짜", "일시", "send_at", "sendat", "date", "datetime", "schedule"],
  subject: ["제목", "메일제목", "메일 제목", "subject", "title"],
  body: ["본문", "내용", "메일내용", "메일 내용", "body", "content", "message"],
  link: ["링크", "url", "link", "바로가기"],
  image: ["이미지", "이미지url", "이미지 url", "썸네일", "image", "imageurl", "thumbnail"],
  recipients: ["수신자", "받는사람", "받는 사람", "수신", "to", "recipients", "email", "이메일"],
  active: ["사용", "사용여부", "발송여부", "활성", "active", "enabled", "use"],
};

function norm(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, "").replace(/[()]/g, "");
}

export function mapHeader(header: string[]) {
  const map: Record<string, number> = {};
  header.forEach((h, idx) => {
    const n = norm(h);
    for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (map[key] !== undefined) continue;
      if (aliases.some((a) => norm(a) === n)) map[key] = idx;
    }
  });
  return map;
}

export type SheetContent = {
  key: string;
  rowNumber: number;
  subject: string;
  body: string;
  link: string;
  imageUrl: string;
  recipients: string;
  rawSchedule: string;
  scheduledAt: Date | null;
  active: boolean;
};

const INACTIVE_VALUES = ["n", "no", "x", "false", "0", "아니오", "보류", "중지", "제외", "미사용"];

export function rowsToContents(rows: string[][], defaultTime: string): {
  items: SheetContent[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const headerIdx = rows.findIndex((r) => r.some((c) => c.trim() !== ""));
  if (headerIdx < 0) return { items: [], warnings: ["시트가 비어 있습니다."] };
  const header = rows[headerIdx];
  const map = mapHeader(header);
  if (map.subject === undefined) {
    throw new Error(
      `'제목' 열을 찾을 수 없습니다. 첫 행에 머리글(발송일시, 제목, 본문, 링크, 이미지, 수신자, 사용)을 입력해주세요. 현재 머리글: ${header.join(", ")}`,
    );
  }
  const get = (r: string[], k: string) => (map[k] !== undefined ? (r[map[k]] ?? "").trim() : "");

  const items: SheetContent[] = [];
  const seen = new Set<string>();
  rows.slice(headerIdx + 1).forEach((r, i) => {
    const rowNumber = headerIdx + i + 2;
    const subject = get(r, "subject");
    if (!subject) return;
    const rawSchedule = get(r, "schedule");
    const scheduledAt = rawSchedule ? parseKstDateTime(rawSchedule, defaultTime) : null;
    if (rawSchedule && !scheduledAt) {
      warnings.push(`${rowNumber}행: 발송일시 '${rawSchedule}'를 해석할 수 없어 대기열(기본 발송시간)로 처리합니다.`);
    }
    const idVal = get(r, "id");
    let key = idVal
      ? `id:${idVal}`
      : "h:" + createHash("sha1").update(`${subject}|${rawSchedule}`).digest("hex").slice(0, 16);
    if (seen.has(key)) key = `${key}:${rowNumber}`;
    seen.add(key);
    const activeRaw = get(r, "active").toLowerCase();
    items.push({
      key,
      rowNumber,
      subject,
      body: get(r, "body"),
      link: get(r, "link"),
      imageUrl: get(r, "image"),
      recipients: get(r, "recipients"),
      rawSchedule,
      scheduledAt,
      active: !INACTIVE_VALUES.includes(activeRaw),
    });
  });
  return { items, warnings };
}

export function rowsToSubscribers(rows: string[][]) {
  const headerIdx = rows.findIndex((r) => r.some((c) => c.trim() !== ""));
  if (headerIdx < 0) return [];
  const header = rows[headerIdx].map(norm);
  let emailIdx = header.findIndex((h) => ["이메일", "email", "메일", "e-mail", "이메일주소", "메일주소"].includes(h));
  let nameIdx = header.findIndex((h) => ["이름", "name", "성명", "닉네임"].includes(h));
  let dataRows = rows.slice(headerIdx + 1);
  if (emailIdx < 0) {
    // no header — detect column containing emails
    emailIdx = rows[headerIdx].findIndex((c) => isEmail(c));
    nameIdx = -1;
    dataRows = rows.slice(headerIdx);
    if (emailIdx < 0) return [];
  }
  return dataRows
    .map((r) => ({ email: (r[emailIdx] ?? "").trim().toLowerCase(), name: nameIdx >= 0 ? (r[nameIdx] ?? "").trim() : "" }))
    .filter((s) => isEmail(s.email));
}

export function isEmail(s: string) {
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(s.trim());
}

export function splitEmails(s: string) {
  return s
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(isEmail);
}
