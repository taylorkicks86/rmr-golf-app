const RESEND_BATCH_SIZE = 4;
const RESEND_BATCH_DELAY_MS = 2000;
const RESEND_MAX_RETRIES = 3;

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function shouldPauseResendBatch(sentInBatch: number): boolean {
  return sentInBatch >= RESEND_BATCH_SIZE;
}

export async function pauseResendBatch() {
  await sleep(RESEND_BATCH_DELAY_MS);
}

function isRateLimitError(error: unknown): boolean {
  const candidate = error as { status?: number; statusCode?: number; message?: string } | null;
  const message = String(candidate?.message ?? "").toLowerCase();
  return (
    candidate?.status === 429 ||
    candidate?.statusCode === 429 ||
    message.includes("rate limit") ||
    message.includes("too many requests")
  );
}

export async function sendResendEmailWithRetry({
  from,
  to,
  subject,
  html,
}: {
  from: string;
  to: string;
  subject: string;
  html: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Server is missing RESEND_API_KEY.");
  }

  for (let attempt = 0; attempt <= RESEND_MAX_RETRIES; attempt += 1) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        html,
      }),
    });

    const body = (await response.json().catch(() => null)) as { id?: string; message?: string } | null;
    if (response.ok) {
      return body?.id ?? null;
    }

    const error = Object.assign(new Error(body?.message ?? "Resend failed to send the email."), {
      status: response.status,
      statusCode: response.status,
    });

    if (!isRateLimitError(error) || attempt === RESEND_MAX_RETRIES) {
      throw error;
    }

    await sleep(RESEND_BATCH_DELAY_MS * Math.pow(2, attempt));
  }

  return null;
}
