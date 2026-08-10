import assert from "node:assert/strict";
import test from "node:test";
import { buildProjectJournalSummary, weeklyDateRange } from "../../api/_lib/project-site-journal.js";

test("həftəlik interval son gün daxil olmaqla yeddi günü əhatə edir", () => {
  assert.deepEqual(weeklyDateRange("2026-08-10"), { start: "2026-08-04", end: "2026-08-10" });
});

test("obyekt jurnalı davamiyyət, texnika, gecikmə və təhlükəsizlik göstəricilərini hesablayır", () => {
  const summary = buildProjectJournalSummary({
    start: "2026-08-04", end: "2026-08-10",
    logs: [
      { workDate: "2026-08-08", workerCount: 8, workerHours: 64, equipmentHours: 3.5, delayMinutes: 30, safetyNote: "" },
      { workDate: "2026-08-08", workerCount: 4, workerHours: 28, equipmentHours: 0, delayMinutes: 0, safetyNote: "Baryer yeniləndi" },
      { workDate: "2026-08-09", workerCount: 6, workerHours: 48, equipmentHours: 2, delayMinutes: 90, safetyNote: "" },
      { workDate: "2026-08-01", workerCount: 20, workerHours: 160, equipmentHours: 8, delayMinutes: 60, safetyNote: "" }
    ], issues: [], documents: []
  });
  assert.equal(summary.workdays, 2);
  assert.equal(summary.workerShifts, 18);
  assert.equal(summary.workerHours, 140);
  assert.equal(summary.equipmentHours, 5.5);
  assert.equal(summary.delayHours, 2);
  assert.equal(summary.safetyAlerts, 1);
});

test("qüsur və sənəd xülasəsi açıq riskləri, aktları və son çertyoj reviziyasını ayırır", () => {
  const summary = buildProjectJournalSummary({
    start: "2026-08-04", end: "2026-08-10", logs: [],
    issues: [
      { status: "open", severity: "critical", dueDate: "2026-08-08" },
      { status: "in_progress", severity: "medium", dueDate: "2026-08-12" },
      { status: "verified", severity: "high", dueDate: "2026-08-05" }
    ],
    documents: [
      { type: "hidden_work", status: "accepted", inspectionDate: "2026-08-06" },
      { type: "inspection", status: "pending", inspectionDate: "2026-08-07" },
      { type: "drawing_revision", status: "superseded", revisionCode: "R02", inspectionDate: "2026-08-05" },
      { type: "drawing_revision", status: "accepted", revisionCode: "R03", inspectionDate: "2026-08-09" }
    ]
  });
  assert.equal(summary.openIssues, 2);
  assert.equal(summary.criticalIssues, 1);
  assert.equal(summary.overdueIssues, 1);
  assert.equal(summary.acceptedActs, 1);
  assert.equal(summary.pendingActs, 1);
  assert.equal(summary.latestDrawingRevision, "R03");
});
