import { query } from "./_lib/db.js";
import { ApiError, assertMethod, sendJson, withApiErrors } from "./_lib/http.js";

export default withApiErrors(async (req, res) => {
  assertMethod(req, ["GET"]);
  const secret = process.env.CRON_SECRET || "";
  if (secret.length < 24 || req.headers.authorization !== `Bearer ${secret}`) {
    throw new ApiError(401, "cron_unauthorized", "Cron sorğusu təsdiqlənmədi.");
  }

  const expired = await query(
    `UPDATE products
        SET price_status = 'expired', price_note = COALESCE(price_note, '') ||
            CASE WHEN COALESCE(price_note, '') = '' THEN '' ELSE ' · ' END || '30 gündən köhnə qiymət',
            updated_at = now()
      WHERE price_status = 'confirmed'
        AND COALESCE(price_verified_at, updated_at) < now() - interval '30 days'
      RETURNING id`
  );
  const sessions = await query("DELETE FROM sessions WHERE expires_at <= now() RETURNING id");
  const attempts = await query("DELETE FROM auth_attempts WHERE created_at < now() - interval '7 days' RETURNING id");

  return sendJson(res, 200, {
    ok: true,
    data: {
      expiredPrices: expired.length,
      deletedSessions: sessions.length,
      deletedAuthAttempts: attempts.length
    },
    completedAt: new Date().toISOString()
  });
});
