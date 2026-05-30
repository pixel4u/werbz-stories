interface SendOtpInput {
  to: string;
  code: string;
}

function fromEmail(): string {
  return process.env.EMAIL_FROM || "";
}

async function sendWithResend(input: SendOtpInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  const from = fromEmail();
  if (!from) throw new Error("EMAIL_FROM is required for Resend");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: "Your werbz Stories login code",
      text: `Your verification code is ${input.code}. It expires in 5 minutes.`,
    }),
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Resend failed: ${msg}`);
  }
}

async function sendWithPostmark(input: SendOtpInput): Promise<void> {
  const apiKey = process.env.POSTMARK_API_KEY;
  if (!apiKey) throw new Error("POSTMARK_API_KEY is not set");
  const from = fromEmail();
  if (!from) throw new Error("EMAIL_FROM is required for Postmark");

  const res = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      "X-Postmark-Server-Token": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      From: from,
      To: input.to,
      Subject: "Your werbz Stories login code",
      TextBody: `Your verification code is ${input.code}. It expires in 5 minutes.`,
    }),
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Postmark failed: ${msg}`);
  }
}

export async function sendOtpEmail(input: SendOtpInput): Promise<void> {
  if (process.env.RESEND_API_KEY) {
    await sendWithResend(input);
    return;
  }

  if (process.env.POSTMARK_API_KEY) {
    await sendWithPostmark(input);
    return;
  }

  if (process.env.NODE_ENV !== "production") {
    console.log(`[DEV OTP] ${input.to} -> ${input.code}`);
    return;
  }

  throw new Error("Email provider not configured. Set RESEND_API_KEY or POSTMARK_API_KEY.");
}
