"use client";

import { useEffect, useRef, useState } from "react";
import { IconCheck, IconCopy } from "./icons";
import { BUTTON_BASE, BUTTON_SIZE, BUTTON_VARIANTS, type ButtonSize } from "./ui";

/** 긴 ID·URL을 복사하는 버튼. 성공/실패를 텍스트로도 알려줍니다. */
export function CopyButton({
  value,
  label = "복사",
  size = "sm",
  className = "",
}: {
  value: string;
  label?: string;
  size?: ButtonSize;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "done" | "fail">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        // 클립보드 API가 없는 환경(비보안 컨텍스트) 폴백
        const el = document.createElement("textarea");
        el.value = value;
        el.setAttribute("readonly", "");
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }
      setState("done");
    } catch {
      setState("fail");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1800);
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={`${label}: ${value}`}
      aria-label={state === "done" ? "복사됨" : `${label} — ${value}`}
      className={`${BUTTON_BASE} ${BUTTON_SIZE[size]} ${BUTTON_VARIANTS.ghost} shrink-0 ${className}`}
    >
      {state === "done" ? (
        <>
          <IconCheck className="h-3.5 w-3.5 text-emerald-300" />
          <span className="text-emerald-300">복사됨</span>
        </>
      ) : state === "fail" ? (
        <span className="text-rose-300">복사 실패</span>
      ) : (
        <>
          <IconCopy className="h-3.5 w-3.5" />
          {label}
        </>
      )}
    </button>
  );
}
