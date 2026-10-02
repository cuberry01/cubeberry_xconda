import { lookup } from "node:dns/promises";
import { createHash } from "node:crypto";
import { isIP } from "node:net";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 12_000;
const UPLOAD_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 3;
const DEFAULT_BUCKET = "xconda-images";

type ImageStorageStatus = "ready" | "missing" | "incomplete";
type StoredImageStatus = "empty" | "stored" | "already-stored" | "disabled" | "failed";

export interface StoredImageResult {
  url: string;
  status: StoredImageStatus;
  error?: string;
}

interface StorageConfig {
  origin: string;
  serviceKey: string;
  bucket: string;
}

interface ImageFormat {
  contentType: string;
  extension: string;
}

export function getImageStorageStatus(): ImageStorageStatus {
  const hasUrl = Boolean(process.env.SUPABASE_URL?.trim());
  const hasKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  if (hasUrl && hasKey) return "ready";
  return hasUrl || hasKey ? "incomplete" : "missing";
}

export function getImageStorageBucketName(): string {
  return process.env.SUPABASE_STORAGE_BUCKET?.trim() || DEFAULT_BUCKET;
}

function getStorageConfig(): StorageConfig | null {
  const status = getImageStorageStatus();
  if (status === "missing") return null;
  if (status === "incomplete") {
    throw new Error("SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY를 모두 설정해야 합니다.");
  }

  const rawUrl = process.env.SUPABASE_URL!.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim();
  const projectUrl = new URL(rawUrl);
  const isLocalHttp =
    projectUrl.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1", "[::1]"].includes(projectUrl.hostname.toLowerCase());

  if (projectUrl.protocol !== "https:" && !isLocalHttp) {
    throw new Error("SUPABASE_URL은 HTTPS 주소여야 합니다.");
  }
  if (projectUrl.username || projectUrl.password || projectUrl.search || projectUrl.hash || projectUrl.pathname !== "/") {
    throw new Error("SUPABASE_URL에는 프로젝트 origin만 입력하세요.");
  }

  const bucket = getImageStorageBucketName();
  if (!/^[a-z0-9][a-z0-9._-]{0,99}$/i.test(bucket)) {
    throw new Error("SUPABASE_STORAGE_BUCKET 이름 형식이 올바르지 않습니다.");
  }

  return { origin: projectUrl.origin, serviceKey, bucket };
}

function isPublicIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts;

  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && ((b === 0 && (c === 0 || c === 2)) || b === 168)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}

function isPublicIp(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPublicIpv4(address);
  if (version !== 6) return false;

  const normalized = address.toLowerCase().split("%")[0];
  // Reject IPv4-mapped IPv6 too; normal public DNS A records are handled as IPv4.
  if (normalized.startsWith("::ffff:") || normalized === "::" || normalized === "::1") return false;
  if (/^(fc|fd|fe[89ab]|ff)/i.test(normalized) || normalized.startsWith("2001:db8:")) return false;

  // Only globally routable IPv6 unicast (2000::/3) is accepted.
  const firstHextet = Number.parseInt(normalized.split(":")[0] || "0", 16);
  return firstHextet >= 0x2000 && firstHextet <= 0x3fff;
}

async function assertPublicImageUrl(url: URL): Promise<void> {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("이미지 URL은 HTTP 또는 HTTPS만 사용할 수 있습니다.");
  }
  if (url.username || url.password || url.port) {
    throw new Error("인증 정보나 비표준 포트가 포함된 이미지 URL은 허용하지 않습니다.");
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".test")
  ) {
    throw new Error("공개 이미지 호스트가 아닙니다.");
  }

  if (isIP(hostname)) {
    if (!isPublicIp(hostname)) throw new Error("사설 네트워크 이미지 주소는 허용하지 않습니다.");
    return;
  }

  const records = await lookup(hostname, { all: true, verbatim: true });
  if (!records.length || records.some((record) => !isPublicIp(record.address))) {
    throw new Error("이미지 호스트가 공개 IP로 확인되지 않습니다.");
  }
}

async function fetchImageResponse(sourceUrl: string): Promise<Response> {
  let currentUrl = new URL(sourceUrl);

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    await assertPublicImageUrl(currentUrl);
    const response = await fetch(currentUrl, {
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,image/*;q=0.8,*/*;q=0.2",
        "User-Agent": "Mozilla/5.0 (compatible; XcondaImageArchiver/1.0)",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location || redirects === MAX_REDIRECTS) throw new Error("이미지 주소의 리다이렉트 횟수가 너무 많습니다.");
      currentUrl = new URL(location, currentUrl);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`이미지 서버가 HTTP ${response.status}를 반환했습니다.`);
    }

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_IMAGE_BYTES) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("이미지 크기가 8 MB 제한을 넘었습니다.");
    }
    return response;
  }

  throw new Error("이미지를 가져오지 못했습니다.");
}

async function readLimitedBody(response: Response): Promise<Buffer> {
  if (!response.body) throw new Error("이미지 응답 본문이 비어 있습니다.");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_IMAGE_BYTES) {
        await reader.cancel();
        throw new Error("이미지 크기가 8 MB 제한을 넘었습니다.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (!totalBytes) throw new Error("이미지 응답 본문이 비어 있습니다.");
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

function detectImageFormat(bytes: Buffer): ImageFormat | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { contentType: "image/png", extension: "png" };
  }
  if (bytes.length >= 6 && (bytes.subarray(0, 6).toString("ascii") === "GIF87a" || bytes.subarray(0, 6).toString("ascii") === "GIF89a")) {
    return { contentType: "image/gif", extension: "gif" };
  }
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    return { contentType: "image/webp", extension: "webp" };
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(4, 8).toString("ascii") === "ftyp" &&
    /^(avif|avis)$/.test(bytes.subarray(8, 12).toString("ascii"))
  ) {
    return { contentType: "image/avif", extension: "avif" };
  }
  return null;
}

function isAlreadyStored(url: string, config: StorageConfig): boolean {
  try {
    const parsed = new URL(url);
    const prefix = `/storage/v1/object/public/${encodeURIComponent(config.bucket)}/`;
    return parsed.origin === config.origin && parsed.pathname.startsWith(prefix);
  } catch {
    return false;
  }
}

function encodedObjectPath(path: string): string {
  return path.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n]+/g, " ").slice(0, 220);
}

/**
 * Copies a public raster image to a public Supabase Storage bucket. If storage is not
 * configured or mirroring fails, callers can continue using the original URL.
 */
export async function storePublicImage(sourceUrl: string): Promise<StoredImageResult> {
  const originalUrl = (sourceUrl || "").trim();
  if (!originalUrl) return { url: "", status: "empty" };

  try {
    const config = getStorageConfig();
    if (!config) return { url: originalUrl, status: "disabled" };
    if (isAlreadyStored(originalUrl, config)) return { url: originalUrl, status: "already-stored" };

    const response = await fetchImageResponse(originalUrl);
    const bytes = await readLimitedBody(response);
    const format = detectImageFormat(bytes);
    if (!format) throw new Error("지원하지 않는 이미지 형식입니다. JPEG, PNG, GIF, WebP, AVIF만 보관할 수 있습니다.");

    const digest = createHash("sha256").update(bytes).digest("hex");
    const objectPath = `${digest.slice(0, 2)}/${digest}.${format.extension}`;
    const path = encodedObjectPath(objectPath);
    const bucket = encodeURIComponent(config.bucket);
    const uploadUrl = `${config.origin}/storage/v1/object/${bucket}/${path}`;
    const uploadBody = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(uploadBody).set(bytes);
    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.serviceKey}`,
        apikey: config.serviceKey,
        "Content-Type": format.contentType,
        "Cache-Control": "31536000",
        "x-upsert": "true",
      },
      body: uploadBody,
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
    if (!uploadResponse.ok) {
      const detail = (await uploadResponse.text().catch(() => "")).replace(/[\r\n]+/g, " ").slice(0, 140);
      throw new Error(`Supabase Storage 업로드 실패 (HTTP ${uploadResponse.status})${detail ? `: ${detail}` : ""}`);
    }

    const publicUrl = `${config.origin}/storage/v1/object/public/${bucket}/${path}`;
    return { url: publicUrl, status: "stored" };
  } catch (error) {
    return { url: originalUrl, status: "failed", error: errorMessage(error) };
  }
}
