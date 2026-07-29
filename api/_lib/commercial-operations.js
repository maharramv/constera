const money = (value) => Math.round(Number(value || 0) * 100) / 100;

export const calculateSettlementAmounts = ({
  grossAmount,
  refundAmount = 0,
  commissionRate,
  adjustmentAmount = 0
}) => {
  const gross = Math.max(0, money(grossAmount));
  const refund = Math.min(gross, Math.max(0, money(refundAmount)));
  const rate = Math.max(0, Math.min(100, Number(commissionRate || 0)));
  const adjustment = money(adjustmentAmount);
  const commission = money((gross - refund) * rate / 100);
  return {
    grossAmount: gross,
    refundAmount: refund,
    commissionAmount: commission,
    adjustmentAmount: adjustment,
    netAmount: money(gross - refund - commission + adjustment)
  };
};

export const settlementTransitionAllowed = (current, next) => ({
  draft: ["approved", "cancelled"],
  approved: ["paid", "cancelled"],
  paid: [],
  cancelled: []
})[current]?.includes(next) || false;
