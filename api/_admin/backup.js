import { requireRole } from "../_lib/auth.js";
import { backupSummary, buildCloudBackup } from "../_lib/cloud-backup.js";
import { recordAudit } from "../_lib/db.js";
import { assertMethod, sendJson, withApiErrors } from "../_lib/http.js";

export default withApiErrors(async (req, res) => {
  assertMethod(req, ["GET"]);
  const user = await requireRole(req, ["super_admin", "admin"]);
  const data = await buildCloudBackup();
  const counts = backupSummary(data);
  await recordAudit({
    actorId: user.id,
    action: "export",
    entityType: "backup",
    entityId: data.backupId,
    details: { counts }
  });
  return sendJson(res, 200, { ok: true, data });
});
