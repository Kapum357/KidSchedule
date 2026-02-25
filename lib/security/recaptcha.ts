/**
 * KidSchedule – Google reCAPTCHA verification
 */

export interface RecaptchaVerificationResult {
  success: boolean;
  score?: number;
  action?: string;
}

type RecaptchaApiResponse = {
  success: boolean;
  score?: number;
  action?: string;
  challenge_ts?: string;
  hostname?: string;
  "error-codes"?: string[];
};

function isRecaptchaConfigured(): boolean {
  return Boolean(
    process.env.RECAPTCHA_SECRET_KEY && process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY
  );
}

/**
 * Verify recaptcha token server-side.
 * If recaptcha is not configured, this returns success in development/fallback mode.
 */
export async function verifyRecaptchaToken(
  token: string | null,
  remoteIp?: string
): Promise<RecaptchaVerificationResult> {
  if (!isRecaptchaConfigured()) {
    return { success: true, score: 1 };
  }

  if (!token) {
    return { success: false };
  }

  const body = new URLSearchParams({
    secret: process.env.RECAPTCHA_SECRET_KEY ?? "",
    response: token,
  });

  if (remoteIp && remoteIp !== "unknown") {
    body.set("remoteip", remoteIp);
  }

  try {
    const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      cache: "no-store",
    });

    if (!response.ok) {
      return { success: false };
    }

    const data = (await response.json()) as RecaptchaApiResponse;
    const minScore = Number(process.env.RECAPTCHA_MIN_SCORE ?? 0.5);

    if (!data.success) {
      return { success: false, score: data.score, action: data.action };
    }

    if (typeof data.score === "number" && data.score < minScore) {
      return { success: false, score: data.score, action: data.action };
    }

    return {
      success: true,
      score: data.score,
      action: data.action,
    };
  } catch {
    return { success: false };
  }
}
