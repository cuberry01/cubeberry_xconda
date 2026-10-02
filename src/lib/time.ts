// Korea Standard Time (UTC+9, no DST)
export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function kstParts(date: Date = new Date()) {
  const k = new Date(date.getTime() + KST_OFFSET_MS);
  return {
    year: k.getUTCFullYear(),
    month: k.getUTCMonth() + 1,
    day: k.getUTCDate(),
    hour: k.getUTCHours(),
    minute: k.getUTCMinutes(),
    weekday: k.getUTCDay(), // 0=Sun
  };
}

export function kstDateKey(date: Date = new Date()) {
  const p = kstParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function fromKst(y: number, m: number, d: number, h = 0, mi = 0, s = 0) {
  return new Date(Date.UTC(y, m - 1, d, h, mi, s) - KST_OFFSET_MS);
}

/** 경과 시간(ms). 미래 시각이면 음수. 서버 렌더에서 "지금"을 쓰는 계산을 모아둔다. */
export function elapsedMs(date: Date, now: Date = new Date()): number {
  return now.getTime() - date.getTime();
}

export function formatKst(date: Date | null | undefined) {
  if (!date) return "-";
  const p = kstParts(date);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${p.year}.${String(p.month).padStart(2, "0")}.${String(p.day).padStart(2, "0")}(${days[p.weekday]}) ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/**
 * 상대 시간 표기 — "방금 전", "4분 전", "3시간 전", "2일 전".
 * 30일이 넘으면 절대 날짜(YYYY.MM.DD)로 바꿔 오해를 줄입니다.
 * `now`를 넘길 수 있어 서버 렌더 시점을 고정할 수 있습니다.
 */
export function formatRelativeKst(date: Date | null | undefined, now: Date = new Date()): string {
  if (!date) return "-";
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) {
    const soonMin = Math.round(-diffMs / 60_000);
    if (soonMin < 1) return "곧";
    if (soonMin < 60) return `${soonMin}분 후`;
    return `${Math.round(soonMin / 60)}시간 후`;
  }
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  return formatKst(date).slice(0, 10);
}

/**
 * Parse date/time strings commonly produced by Google Sheets CSV export, e.g.
 *  2026-10-01 09:00 / 2026/10/01 9:00:00 / 2026. 10. 1 오전 9:00:00 / 2026.10.01 오후 3:30
 *  10/1/2026 9:00 AM / 2026-10-01T09:00
 * Interpreted as KST. Date only -> 09:00 is NOT assumed; returns midnight flag.
 */
export function parseKstDateTime(
  raw: string,
  defaultTime = "09:00",
): Date | null {
  const s = raw.trim();
  if (!s) return null;

  const pm = /오후|PM|p\.m\./i.test(s);
  const am = /오전|AM|a\.m\./i.test(s);
  const nums = s.match(/\d+/g)?.map(Number) ?? [];
  if (nums.length < 3) return null;

  let y: number, m: number, d: number;
  let rest: number[];
  if (nums[0] > 31) {
    [y, m, d] = nums;
    rest = nums.slice(3);
  } else if (nums[2] > 31) {
    // M/D/YYYY
    [m, d, y] = nums;
    rest = nums.slice(3);
  } else {
    return null;
  }
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;

  let h: number, mi: number, sec: number;
  if (rest.length >= 2) {
    [h, mi] = rest;
    sec = rest[2] ?? 0;
  } else if (rest.length === 1 && /시/.test(s)) {
    h = rest[0];
    mi = 0;
    sec = 0;
  } else {
    const [dh, dm] = defaultTime.split(":").map(Number);
    h = dh || 0;
    mi = dm || 0;
    sec = 0;
  }
  if (pm && h < 12) h += 12;
  if (am && h === 12) h = 0;
  if (h > 23 || mi > 59) return null;

  return fromKst(y, m, d, h, mi, sec);
}
