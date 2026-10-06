// 구글 드라이브 이미지 지원.
//
// 시트 '이미지' 열에 드라이브 공유 링크(/file/d/…/view, open?id=…, uc?id=… 등)를
// 붙여넣으면 메일에 바로 심을 수 있는 직접 이미지 주소로 변환한다.
// 변환된 주소는 파일이 "링크가 있는 모든 사용자 – 뷰어"로 공유되어 있을 때 동작한다.

const FILE_ID_RE = "[a-zA-Z0-9_-]{10,}";

const DRIVE_PATTERNS: RegExp[] = [
  // https://drive.google.com/file/d/{id}/view?usp=sharing
  new RegExp(`drive\\.google\\.com/file/d/(${FILE_ID_RE})`, "i"),
  // https://drive.google.com/open?id={id} / uc?id={id} / uc?export=view&id={id}
  new RegExp(`drive\\.google\\.com/(?:open|uc)\\b[^\\s]*[?&]id=(${FILE_ID_RE})`, "i"),
  // https://docs.google.com/uc?export=download&id={id}
  new RegExp(`docs\\.google\\.com/uc\\b[^\\s]*[?&]id=(${FILE_ID_RE})`, "i"),
  // https://drive.usercontent.google.com/download?id={id}&export=download
  new RegExp(`drive\\.usercontent\\.google\\.com/[^\\s]*[?&]id=(${FILE_ID_RE})`, "i"),
];

/** 드라이브 공유 링크에서 파일 ID를 뽑는다. 드라이브 주소가 아니면 null. */
export function extractDriveFileId(url: string): string | null {
  const s = (url || "").trim();
  if (!s) return null;
  for (const re of DRIVE_PATTERNS) {
    const m = s.match(re);
    if (m) return m[1];
  }
  return null;
}

/**
 * 시트에 적힌 이미지 주소를 메일 임베드 가능한 주소로 정리한다.
 * - 드라이브 공유 링크 → `https://lh3.googleusercontent.com/d/{파일ID}`
 * - 이미 직접 이미지 주소(외부 URL, lh3 등)는 그대로 둔다.
 */
export function resolveImageUrl(raw: string): { url: string; driveFileId: string | null } {
  const s = (raw || "").trim();
  if (!s) return { url: "", driveFileId: null };
  const fileId = extractDriveFileId(s);
  if (!fileId) return { url: s, driveFileId: null };
  return { url: `https://lh3.googleusercontent.com/d/${fileId}`, driveFileId: fileId };
}

/**
 * 이미지 주소가 실제로 읽히는지 확인한다 (공유 설정 검증용).
 * 메일 전송을 막지 않도록 실패해도 경고만 만든다.
 */
export async function checkImageAccessible(
  url: string,
  timeoutMs = 8000,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": "Mozilla/5.0 (sheet-mailer image check)" },
    });
    if (!res.ok) {
      return {
        ok: false,
        reason:
          res.status === 403 || res.status === 404
            ? "공유되지 않았거나 삭제된 파일"
            : `서버 응답 ${res.status}`,
      };
    }
    const ct = res.headers.get("content-type") ?? "";
    if (ct && !ct.startsWith("image/") && !ct.includes("octet-stream")) {
      return { ok: false, reason: `이미지가 아님 (${ct})` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error && e.name === "TimeoutError" ? "확인 시간 초과" : "주소 확인 실패" };
  }
}
