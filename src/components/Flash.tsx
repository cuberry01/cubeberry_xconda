import { IconAlert, IconCheckCircle } from "./icons";

/**
 * 서버 액션 결과 메시지.
 * 성공은 role="status", 오류는 role="alert"로 스크린리더에 즉시 알립니다.
 */
export function Flash({ msg, err }: { msg?: string; err?: string }) {
  if (!msg && !err) return null;
  const isError = Boolean(err);
  const text = err || msg;

  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className={`mb-6 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ring-1 ring-inset motion-safe:animate-flash-in ${
        isError
          ? "border-rose-400/30 bg-rose-500/10 text-rose-100 ring-rose-400/20"
          : "border-primary/30 bg-primary/10 text-emerald-50 ring-primary/20"
      }`}
    >
      {isError ? (
        <IconAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
      ) : (
        <IconCheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
      )}
      <p className="leading-6">{text}</p>
    </div>
  );
}

export type FlashParams = Promise<{ msg?: string; err?: string }>;
