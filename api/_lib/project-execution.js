const roundMoney = (value) => Number((Number(value || 0) + Number.EPSILON).toFixed(2));

export const lineAmount = (quantity, unitRate) => roundMoney(Number(quantity || 0) * Number(unitRate || 0));

export const calculatePaymentCertificate = ({
  workAmount,
  contractAmount,
  advancePercent = 0,
  advanceRecoveryPercent = 0,
  retentionPercent = 0,
  taxPercent = 0,
  priorAdvanceRecovery = 0,
  priorRetention = 0,
  priorRetentionRelease = 0,
  otherDeductions = 0,
  releaseRetention = false
}) => {
  const gross = roundMoney(Math.max(0, Number(workAmount || 0)));
  const advanceTotal = roundMoney(Math.max(0, Number(contractAmount || 0)) * Math.max(0, Number(advancePercent || 0)) / 100);
  const advanceRemaining = roundMoney(Math.max(0, advanceTotal - Math.max(0, Number(priorAdvanceRecovery || 0))));
  const advanceRecovery = roundMoney(Math.min(
    advanceRemaining,
    gross * Math.max(0, Number(advanceRecoveryPercent || 0)) / 100
  ));
  const retention = roundMoney(gross * Math.max(0, Number(retentionPercent || 0)) / 100);
  const retentionHeld = roundMoney(Math.max(
    0,
    Math.max(0, Number(priorRetention || 0)) + retention - Math.max(0, Number(priorRetentionRelease || 0))
  ));
  const retentionRelease = releaseRetention ? retentionHeld : 0;
  const deductions = roundMoney(Math.max(0, Number(otherDeductions || 0)));
  const tax = roundMoney(gross * Math.max(0, Number(taxPercent || 0)) / 100);
  const netPayable = roundMoney(Math.max(0, gross + tax - advanceRecovery - retention - deductions + retentionRelease));
  return {
    workAmount: gross,
    advanceTotal,
    advanceRemaining,
    advanceRecoveryAmount: advanceRecovery,
    retentionAmount: retention,
    retentionHeld,
    retentionReleaseAmount: retentionRelease,
    otherDeductions: deductions,
    taxAmount: tax,
    netPayable
  };
};

const transitions = Object.freeze({
  contract: {
    draft: ["active", "cancelled"],
    active: ["suspended", "completed", "cancelled"],
    suspended: ["active", "cancelled"]
  },
  measurement: {
    draft: ["submitted", "cancelled"],
    submitted: ["accepted", "rejected", "cancelled"]
  },
  certificate: {
    draft: ["submitted", "cancelled"],
    submitted: ["certified", "rejected", "cancelled"],
    rejected: ["draft", "cancelled"],
    certified: ["paid"]
  }
});

export const canTransitionExecution = (type, current, next) => Boolean(transitions[type]?.[current]?.includes(next));

export const progressPercent = (completedAmount, contractAmount) => {
  const denominator = Number(contractAmount || 0);
  if (denominator <= 0) return 0;
  return Number(Math.min(100, Math.max(0, Number(completedAmount || 0) / denominator * 100)).toFixed(1));
};
