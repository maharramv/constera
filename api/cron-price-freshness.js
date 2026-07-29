import { query } from "./_lib/db.js";
import { ApiError, assertMethod, sendJson, withApiErrors } from "./_lib/http.js";
import { runPriceFreshnessScan } from "./_lib/price-monitor.js";

export default withApiErrors(async (req, res) => {
  assertMethod(req, ["GET"]);
  const secret = process.env.CRON_SECRET || "";
  if (secret.length < 24 || req.headers.authorization !== `Bearer ${secret}`) {
    throw new ApiError(401, "cron_unauthorized", "Cron sorğusu təsdiqlənmədi.");
  }

  const priceScan = await runPriceFreshnessScan({ notify: true });
  const sessions = await query("DELETE FROM sessions WHERE expires_at <= now() RETURNING id");
  const attempts = await query("DELETE FROM auth_attempts WHERE created_at < now() - interval '7 days' RETURNING id");

  return sendJson(res, 200, {
    ok: true,
    data: {
      expiredPrices: priceScan.expiredProducts,
      createdPriceReviews: priceScan.createdRequests,
      notifiedSupplierUsers: priceScan.notifiedUsers,
      deletedSessions: sessions.length,
      deletedAuthAttempts: attempts.length
    },
    completedAt: new Date().toISOString()
  });
});
