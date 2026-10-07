/** Provider-specific errors that require pausing delivery rather than retrying each recipient. */
export const GMAIL_DAILY_SENDING_LIMIT_MARKER = "Daily user sending limit exceeded";
export const GMAIL_DAILY_SENDING_LIMIT_ERROR = `Gmail SMTP 550-5.4.5 ${GMAIL_DAILY_SENDING_LIMIT_MARKER}`;

/** Gmail's daily sending quota is enforced over a rolling period, not at our local midnight. */
export const GMAIL_DAILY_SENDING_LIMIT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * Nodemailer exposes the SMTP response on a few different fields depending on where the
 * server rejects a message. Inspect the common fields and `cause` chain so a quota error
 * can be recognized even when wrapped by another error.
 */
function errorDetails(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;

  for (let depth = 0; current && depth < 5; depth++) {
    if (typeof current === "string" || typeof current === "number") {
      parts.push(String(current));
      break;
    }
    if (typeof current !== "object") break;

    const value = current as Record<string, unknown>;
    for (const key of ["message", "response", "code", "responseCode"]) {
      const field = value[key];
      if (typeof field === "string" || typeof field === "number") parts.push(String(field));
    }
    current = value.cause;
  }

  return parts.join("\n");
}

/** True only for Google's explicit SMTP 550 5.4.5 daily-sending-limit rejection. */
export function isGmailDailySendingLimitError(error: unknown): boolean {
  const details = errorDetails(error);
  return /daily user sending limit exceeded/i.test(details) && /5\.4\.5/i.test(details);
}

/** Keep ordinary provider errors readable without dumping arbitrarily large SMTP responses. */
export function errorMessage(error: unknown): string {
  const details = errorDetails(error);
  return (details.split("\n").find(Boolean) || String(error)).slice(0, 1_000);
}
