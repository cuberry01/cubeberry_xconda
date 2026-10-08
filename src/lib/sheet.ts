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
  const lastMappedColumn = Math.max(...Object.values(map));
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
    const ignoredValue = r.slice(lastMappedColumn + 1).find((cell) => cell.trim() !== "");
    if (ignoredValue) {
      warnings.push(`${rowNumber}행: '사용' 열 뒤의 값 '${ignoredValue}'은(는) 읽지 않습니다. 제목에 쉼표가 있으면 한 셀에 입력했는지 확인해주세요.`);
    }
    const rawSchedule = get(r, "schedule");
    const scheduledAt = rawSchedule ? parseKstDateTime(rawSchedule, defaultTime) : null;
    if (rawSchedule && !scheduledAt) {
      warnings.push(`${rowNumber}행: 발송일시 '${rawSchedule}'를 해석할 수 없어 대기열(기본 발송시간)로 처리합니다.`);
    }
    const recipients = get(r, "recipients");
    if (hasTrailingDotEmail(recipients)) {
      warnings.push(`${rowNumber}행: 수신자 주소 끝에 마침표(.)가 있습니다. 해당 주소는 발송 대상에서 빠지므로 끝의 점을 제거하세요.`);
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
      recipients,
      rawSchedule,
      scheduledAt,
      active: !INACTIVE_VALUES.includes(activeRaw),
    });
  });
  return { items, warnings };
}

function hasTrailingDotEmail(value: string) {
  return value.split(/[\s,;]+/).some((part) => {
    const email = part.trim();
    return email.endsWith(".") && isEmail(email.slice(0, -1));
  });
}

export function rowsToSubscribers(rows: string[][], warnings: string[] = []) {
  const headerIdx = rows.findIndex((r) => r.some((c) => c.trim() !== ""));
  if (headerIdx < 0) return [];
  const header = rows[headerIdx].map(norm);
  let emailIdx = header.findIndex((h) => ["이메일", "email", "메일", "e-mail", "이메일주소", "메일주소"].includes(h));
  let nameIdx = header.findIndex((h) => ["이름", "name", "성명", "닉네임"].includes(h));
  let dataRows = rows.slice(headerIdx + 1);
  let dataStartRow = headerIdx + 1;
  if (emailIdx < 0) {
    // 머리글이 없으면 첫 행에서 이메일 열을 추정한다. 끝에 점이 잘못 붙은 주소도 찾아
    // 해당 행을 건너뛰면서 동기화 결과에 원인을 알린다.
    emailIdx = rows[headerIdx].findIndex((c) => {
      const value = c.trim();
      return isEmail(value) || (value.endsWith(".") && isEmail(value.slice(0, -1)));
    });
    nameIdx = -1;
    dataRows = rows.slice(headerIdx);
    dataStartRow = headerIdx;
    if (emailIdx < 0) return [];
  }
  const unique = new Map<string, { email: string; name: string }>();
  const trailingDotRows: number[] = [];
  for (const [index, row] of dataRows.entries()) {
    const subscriber = {
      email: (row[emailIdx] ?? "").trim().toLowerCase(),
      name: nameIdx >= 0 ? (row[nameIdx] ?? "").trim() : "",
    };
    if (!isEmail(subscriber.email)) {
      if (subscriber.email.endsWith(".")) trailingDotRows.push(dataStartRow + index + 1);
      continue;
    }

    const previous = unique.get(subscriber.email);
    // 한 번의 bulk upsert에 같은 이메일이 두 번 들어가면 PostgreSQL이 실패한다.
    // 중복 행에서는 비어 있지 않은 최신 이름을 우선한다.
    if (!previous || subscriber.name) unique.set(subscriber.email, subscriber);
  }
  if (trailingDotRows.length) {
    const shownRows = trailingDotRows.slice(0, 8).join(", ");
    const moreRows = trailingDotRows.length > 8 ? ` 외 ${trailingDotRows.length - 8}개` : "";
    warnings.push(
      `구독자 시트 ${trailingDotRows.length}개 행(${shownRows}행${moreRows})의 이메일 주소 끝에 마침표(.)가 있어 제외했습니다. 끝의 점을 제거한 뒤 다시 동기화하세요.`,
    );
  }
  return [...unique.values()];
}

export function isEmail(s: string) {
  const email = s.trim();
  // Gmail rejects an address with a final dot as a non-existent recipient. Keep dots inside
  // addresses (for example, first.last@example.com) valid, but don't let the final dot through.
  if (email.endsWith(".")) return false;
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email);
}

export function splitEmails(s: string) {
  return s
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(isEmail);
}
