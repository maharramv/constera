import { deliverPendingNotifications } from "./_lib/notifications.js";
import { ApiError, assertMethod, sendJson, withApiErrors } from "./_lib/http.js";

export default withApiErrors(async (req, res) => {
  assertMethod(req, ["GET"]);
  const secret = process.env.CRON_SECRET || "";
  if (secret.length < 24 || req.headers.authorization !== `Bearer ${secret}`) {
    throw new ApiError(401, "cron_unauthorized", "Cron sorğusu təsdiqlənmədi.");
  }
  const result = await deliverPendingNotifications(50);
  return sendJson(res, 200, { ok: true, data: result, completedAt: new Date().toISOString() });
});
