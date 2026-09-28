import { db } from "@/db";
import { subscribers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

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

  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
      <div className="mb-4 text-4xl">✉️</div>
      {!sub ? (
        <p className="text-slate-600">유효하지 않은 수신거부 링크입니다.</p>
      ) : done || !sub.active ? (
        <>
          <h1 className="mb-2 text-xl font-bold">수신거부 완료</h1>
          <p className="text-sm text-slate-600">{sub.email} 주소로 더 이상 메일이 발송되지 않습니다.</p>
        </>
      ) : (
        <>
          <h1 className="mb-2 text-xl font-bold">메일 수신을 중단할까요?</h1>
          <p className="mb-6 text-sm text-slate-600">{sub.email}</p>
          <form action={unsubscribe}>
            <input type="hidden" name="token" value={token} />
            <button className="rounded-lg bg-rose-600 px-5 py-2 text-sm font-semibold text-white hover:bg-rose-700">수신거부</button>
          </form>
        </>
      )}
    </div>
  );
}
