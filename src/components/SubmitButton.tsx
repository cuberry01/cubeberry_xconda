"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { IconSpinner } from "./icons";
import { BUTTON_BASE, BUTTON_SIZE, BUTTON_VARIANTS, type ButtonSize, type ButtonVariant } from "./ui";

export function SubmitButton({
  children,
  className = "",
  variant = "primary",
  size = "md",
  confirm,
  pendingText = "처리 중…",
}: {
  children: ReactNode;
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  confirm?: string;
  pendingText?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className={`${BUTTON_BASE} ${BUTTON_SIZE[size]} ${BUTTON_VARIANTS[variant]} ${className}`}
    >
      {pending ? (
        <>
          <IconSpinner className="h-4 w-4 motion-safe:animate-spin" />
          <span>{pendingText}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
