import { ApiError, assertMethod, sendJson, withApiErrors } from "../_lib/http.js";
import { runProductionMonitor, sendProductionMonitorAlert } from "../_lib/production-monitor.js";

export default withApiErrors(async (req, res) => {
  assertMethod(req, ["GET"]);
  const secret = process.env.CRON_SECRET || "";
  if (secret.length < 24 || req.headers.authorization !== `Bearer ${secret}`) {
    throw new ApiError(401, "cron_unauthorized", "Cron sorğusu təsdiqlənmədi.");
  }
  try {
    const result = await runProductionMonitor();
    return sendJson(res, 200, { ok: true, data: result });
  } catch (error) {
    await sendProductionMonitorAlert({ error }).catch(() => null);
    throw error;
  }
});
