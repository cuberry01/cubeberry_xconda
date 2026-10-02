import { db } from "@/db";
import { subscribers } from "@/db/schema";
import { IconAlert, IconCheckCircle, IconMail } from "@/components/icons";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata = { title: "수신거부" };

async function unsubscribe(formData: FormData) {
  "use server";
  const token = String(formData.get("token") || "");
  if (token) await db.update(subscribers).set({ active: false }).where(eq(subscribers.token, token));
  redirect(`/unsubscribe?token=${encodeURIComponent(token)}&done=1`);
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; done?: string }>;
}) {
  const { token, done } = await searchParams;
  const [sub] = token ? await db.select().from(subscribers).where(eq(subscribers.token, token)) : [];

  const doneState = Boolean(done) || Boolean(sub && !sub.active);
  const valid = Boolean(sub);

  return (
    <div className="mx-auto mt-6 max-w-md rounded-2xl border border-line/80 bg-surface p-6 text-center shadow-[0_24px_50px_-42px_rgba(0,0,0,0.95)] sm:mt-10 sm:p-8">
      <span
        className={`mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl ring-1 ring-inset ${
          !valid
            ? "bg-rose-500/10 text-rose-300 ring-rose-400/25"
            : doneState
              ? "bg-primary/15 text-emerald-300 ring-primary/25"
              : "bg-surface-2 text-muted ring-line/80"
        }`}
      >
        {!valid ? (
          <IconAlert className="h-6 w-6" />
        ) : doneState ? (
          <IconCheckCircle className="h-6 w-6" />
        ) : (
          <IconMail className="h-6 w-6" />
        )}
      </span>

      {!valid ? (
        <>
          <h1 className="text-lg font-bold text-ink">유효하지 않은 수신거부 링크입니다</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            메일 하단의 수신거부 버튼을 다시 눌러 새 링크로 접속해 주세요.
          </p>
        </>
      ) : doneState ? (
        <>
          <h1 className="text-lg font-bold text-ink">수신거부 완료</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            <span className="font-medium text-ink-2">{sub?.email}</span> 주소로 더 이상 메일이 발송되지 않습니다.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-lg font-bold text-ink">메일 수신을 중단할까요?</h1>
          <p className="mt-2 break-all text-sm text-muted">{sub?.email}</p>
          <form action={unsubscribe} className="mt-6">
            <input type="hidden" name="token" value={token} />
            <button
              type="submit"
              className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-xl bg-rose-500/90 px-5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-rose-500 sm:w-auto"
            >
              수신거부
            </button>
          </form>
        </>
      )}
    </div>
  );
}
