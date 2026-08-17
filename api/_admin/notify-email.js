import { ApiError, assertMethod, readJson, sendJson, withApiErrors } from "../_lib/http.js";

const verifySecret = (req) => {
  const expected = process.env.NOTIFICATION_WEBHOOK_SECRET;
  if (!expected) return;
  const header = req.headers.authorization || "";
  if (header !== `Bearer ${expected}`) {
    throw new ApiError(401, "invalid_webhook_secret", "Webhook autentifikasiyası uğursuz oldu.");
  }
};

export default withApiErrors(async (req, res) => {
  assertMethod(req, ["POST"]);
  verifySecret(req);

  const body = await readJson(req);
  const { recipient, subject, body: text } = body || {};
  if (!recipient || !subject || !text) {
    throw new ApiError(400, "missing_fields", "recipient, subject və body tələb olunur.");
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new ApiError(503, "email_not_configured", "RESEND_API_KEY qurulmayıb.");
  }

  const from = process.env.RESEND_FROM_EMAIL || "ConstEra <onboarding@resend.dev>";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      from,
      to: [recipient],
      subject,
      text
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new ApiError(502, "resend_send_failed", `Resend xətası (${response.status}): ${detail.slice(0, 300)}`);
  }

  const result = await response.json();
  return sendJson(res, 200, { ok: true, id: result.id || null });
});
