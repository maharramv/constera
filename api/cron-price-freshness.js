import { query } from "./_lib/db.js";
import { runCatalogQualityScan } from "./_lib/catalog-quality.js";
import { ApiError, assertMethod, sendJson, withApiErrors } from "./_lib/http.js";
import { runPriceFreshnessScan } from "./_lib/price-monitor.js";
import { runDueSupplierFeeds } from "./_lib/supplier-feeds.js";

export default withApiErrors(async (req, res) => {
  assertMethod(req, ["GET"]);
  const secret = process.env.CRON_SECRET || "";
  if (secret.length < 24 || req.headers.authorization !== `Bearer ${secret}`) {
    throw new ApiError(401, "cron_unauthorized", "Cron sorğusu təsdiqlənmədi.");
  }

  const [priceScan, qualityScan, supplierFeeds] = await Promise.all([
    runPriceFreshnessScan({ notify: true }),
    runCatalogQualityScan({ probeLinks: true, linkLimit: 8 }),
    runDueSupplierFeeds(3)
  ]);
  const sessions = await query("DELETE FROM sessions WHERE expires_at <= now() RETURNING id");
  const attempts = await query("DELETE FROM auth_attempts WHERE created_at < now() - interval '7 days' RETURNING id");
  const challenges = await query(
    "DELETE FROM auth_challenges WHERE expires_at <= now() OR consumed_at < now() - interval '1 day' RETURNING id"
  );

  return sendJson(res, 200, {
    ok: true,
    data: {
      expiredPrices: priceScan.expiredProducts,
      createdPriceReviews: priceScan.createdRequests,
      notifiedSupplierUsers: priceScan.notifiedUsers,
      catalogQuality: qualityScan,
      supplierFeeds,
      deletedSessions: sessions.length,
      deletedAuthAttempts: attempts.length,
      deletedAuthChallenges: challenges.length
    },
    completedAt: new Date().toISOString()
  });
});
