const money = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export const proposalStatuses = Object.freeze([
  "draft",
  "issued",
  "accepted",
  "expired",
  "cancelled"
]);

export const proposalVatModes = Object.freeze([
  "excluded",
  "included",
  "not_applicable"
]);

export const calculateCommercialProposalTotals = ({
  subtotal,
  discountAmount = 0,
  deliveryAmount = 0,
  vatMode = "excluded",
  vatRate = 18
}) => {
  const normalizedSubtotal = money(Math.max(0, Number(subtotal) || 0));
  const normalizedDiscount = money(Math.max(0, Number(discountAmount) || 0));
  const normalizedDelivery = money(Math.max(0, Number(deliveryAmount) || 0));
  const normalizedVatRate = money(Math.min(100, Math.max(0, Number(vatRate) || 0)));
  const taxableAmount = money(Math.max(0, normalizedSubtotal - normalizedDiscount + normalizedDelivery));
  const vatAmount = vatMode === "excluded"
    ? money(taxableAmount * normalizedVatRate / 100)
    : vatMode === "included" && normalizedVatRate > 0
      ? money(taxableAmount * normalizedVatRate / (100 + normalizedVatRate))
      : 0;
  const totalAmount = vatMode === "excluded"
    ? money(taxableAmount + vatAmount)
    : taxableAmount;

  return {
    subtotal: normalizedSubtotal,
    discountAmount: normalizedDiscount,
    deliveryAmount: normalizedDelivery,
    taxableAmount,
    vatMode,
    vatRate: normalizedVatRate,
    vatAmount,
    totalAmount
  };
};

export const formatCommercialProposalNumber = (sequence, date = new Date()) => {
  const year = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Baku",
    year: "numeric"
  }).format(date);
  return `KT-${year}-${String(sequence).padStart(6, "0")}`;
};

export const effectiveProposalStatus = (status, validUntil, date = new Date()) => {
  if (status !== "issued" || !validUntil) return status;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Baku",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
  return String(validUntil).slice(0, 10) < today ? "expired" : status;
};

export const mapCommercialProposal = (row) => ({
  id: row.id,
  documentNumber: row.document_number,
  rfqId: row.rfq_id,
  rfqTitle: row.rfq_title || row.customer_snapshot?.title || "",
  selectedOfferId: row.selected_offer_id || null,
  customerId: row.customer_id || null,
  version: Number(row.version || 1),
  status: effectiveProposalStatus(row.status, row.valid_until),
  currency: row.currency,
  subtotal: Number(row.subtotal || 0),
  discountAmount: Number(row.discount_amount || 0),
  deliveryAmount: Number(row.delivery_amount || 0),
  vatMode: row.vat_mode,
  vatRate: Number(row.vat_rate || 0),
  vatAmount: Number(row.vat_amount || 0),
  totalAmount: Number(row.total_amount || 0),
  validUntil: row.valid_until,
  paymentTerms: row.payment_terms || "",
  deliveryTerms: row.delivery_terms || "",
  warrantyTerms: row.warranty_terms || "",
  note: row.note || "",
  customer: row.customer_snapshot || {},
  supplier: row.supplier_snapshot || {},
  items: row.items_snapshot || [],
  comparisons: row.offer_comparison || [],
  selectedSupplierName: row.selected_supplier_name || row.supplier_snapshot?.name || "",
  orderId: row.order_id || null,
  orderNumber: row.order_number ? Number(row.order_number) : null,
  issuedAt: row.issued_at,
  acceptedAt: row.accepted_at,
  cancelledAt: row.cancelled_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});
