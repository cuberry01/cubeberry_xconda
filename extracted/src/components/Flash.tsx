export function Flash({ msg, err }: { msg?: string; err?: string }) {
  if (!msg && !err) return null;
  return (
    <div
      className={`mb-6 rounded-xl px-4 py-3 text-sm ring-1 ${
        err ? "bg-rose-50 text-rose-800 ring-rose-200" : "bg-emerald-50 text-emerald-800 ring-emerald-200"
      }`}
    >
      {err ? "⚠️ " : "✅ "}
      {err || msg}
    </div>
  );
}

export type FlashParams = Promise<{ msg?: string; err?: string }>;
