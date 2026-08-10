const number = (value) => Number(value || 0);

export const weeklyDateRange = (endDate = new Date().toISOString().slice(0, 10)) => {
  const end = new Date(`${endDate}T00:00:00Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
};

export const buildProjectJournalSummary = ({ logs = [], issues = [], documents = [], start, end }) => {
  const periodLogs = logs.filter((item) => item.workDate >= start && item.workDate <= end);
  const openIssues = issues.filter((item) => !["resolved", "verified"].includes(item.status));
  const overdueIssues = openIssues.filter((item) => item.dueDate && item.dueDate < end);
  const acts = documents.filter((item) => item.type !== "drawing_revision");
  const drawings = documents.filter((item) => item.type === "drawing_revision");
  return {
    period: { start, end },
    workdays: new Set(periodLogs.map((item) => item.workDate)).size,
    logCount: periodLogs.length,
    workerShifts: periodLogs.reduce((sum, item) => sum + number(item.workerCount), 0),
    workerHours: number(periodLogs.reduce((sum, item) => sum + number(item.workerHours), 0).toFixed(2)),
    equipmentHours: number(periodLogs.reduce((sum, item) => sum + number(item.equipmentHours), 0).toFixed(2)),
    delayHours: number((periodLogs.reduce((sum, item) => sum + number(item.delayMinutes), 0) / 60).toFixed(2)),
    safetyAlerts: periodLogs.filter((item) => String(item.safetyNote || "").trim()).length,
    openIssues: openIssues.length,
    criticalIssues: openIssues.filter((item) => item.severity === "critical").length,
    overdueIssues: overdueIssues.length,
    acceptedActs: acts.filter((item) => item.status === "accepted").length,
    pendingActs: acts.filter((item) => ["draft", "pending"].includes(item.status)).length,
    latestDrawingRevision: drawings.sort((a, b) => String(b.inspectionDate).localeCompare(String(a.inspectionDate)))[0]?.revisionCode || ""
  };
};
