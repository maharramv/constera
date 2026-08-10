const number = (value) => {
  const result = Number(value || 0);
  return Number.isFinite(result) ? result : 0;
};

const rounded = (value) => Number(number(value).toFixed(3));

export const buildProjectMaterialSummary = (projectItems = [], receipts = [], movements = []) => {
  const receiptByItem = new Map();
  const movementByItem = new Map();

  receipts.forEach((receipt) => {
    const current = receiptByItem.get(receipt.projectItemId) || { delivered: 0, accepted: 0, rejected: 0 };
    current.delivered += number(receipt.deliveredQuantity);
    current.accepted += number(receipt.acceptedQuantity);
    current.rejected += number(receipt.rejectedQuantity);
    receiptByItem.set(receipt.projectItemId, current);
  });

  movements.forEach((movement) => {
    const current = movementByItem.get(movement.projectItemId) || { used: 0, waste: 0, returned: 0 };
    if (movement.type === "use") current.used += number(movement.quantity);
    if (movement.type === "waste") current.waste += number(movement.quantity);
    if (movement.type === "return") current.returned += number(movement.quantity);
    movementByItem.set(movement.projectItemId, current);
  });

  const items = projectItems.map((item) => {
    const receipt = receiptByItem.get(item.rowId) || { delivered: 0, accepted: 0, rejected: 0 };
    const movement = movementByItem.get(item.rowId) || { used: 0, waste: 0, returned: 0 };
    const planned = number(item.quantity);
    const available = receipt.accepted - movement.used - movement.waste + movement.returned;
    const consumed = movement.used + movement.waste - movement.returned;
    return {
      projectItemId: item.rowId,
      itemId: item.id,
      title: item.title,
      unit: item.unit,
      planned: rounded(planned),
      delivered: rounded(receipt.delivered),
      accepted: rounded(receipt.accepted),
      rejected: rounded(receipt.rejected),
      used: rounded(movement.used),
      waste: rounded(movement.waste),
      returned: rounded(movement.returned),
      available: rounded(available),
      planVariance: rounded(planned - consumed),
      receiptProgress: planned > 0 ? Math.min(100, Math.round((receipt.accepted / planned) * 100)) : 0,
      wasteRate: movement.used + movement.waste > 0
        ? Number(((movement.waste / (movement.used + movement.waste)) * 100).toFixed(1))
        : 0,
      hasNegativeBalance: available < 0
    };
  });

  const totals = items.reduce((result, item) => {
    result.planned += item.planned;
    result.accepted += item.accepted;
    result.rejected += item.rejected;
    result.used += item.used;
    result.waste += item.waste;
    result.returned += item.returned;
    result.available += item.available;
    if (item.hasNegativeBalance) result.negativeBalanceItems += 1;
    return result;
  }, { planned: 0, accepted: 0, rejected: 0, used: 0, waste: 0, returned: 0, available: 0, negativeBalanceItems: 0 });

  Object.keys(totals).forEach((key) => {
    if (key !== "negativeBalanceItems") totals[key] = rounded(totals[key]);
  });
  totals.wasteRate = totals.used + totals.waste > 0
    ? Number(((totals.waste / (totals.used + totals.waste)) * 100).toFixed(1))
    : 0;

  return { totals, items };
};

export const receiptStatus = ({ deliveredQuantity, acceptedQuantity, rejectedQuantity }) => {
  const delivered = number(deliveredQuantity);
  const accepted = number(acceptedQuantity);
  const rejected = number(rejectedQuantity);
  if (delivered <= 0 || accepted < 0 || rejected < 0 || accepted + rejected > delivered) return "invalid";
  if (accepted === 0 && rejected === delivered) return "rejected";
  if (accepted === delivered && rejected === 0) return "accepted";
  return "partial";
};
