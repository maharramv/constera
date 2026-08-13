const amount = (value) => Math.round(Number(value || 0) * 100) / 100;
const quantity = (value) => Math.round(Number(value || 0) * 1_000) / 1_000;

const itemId = (item) => item.purchaseOrderItemId || item.purchase_order_item_id || item.id || "";
const activeInvoice = (invoice) => invoice.status !== "cancelled";
const postedReceipt = (receipt) => receipt.status === "posted";

export const calculateThreeWayMatch = ({
  purchaseOrder = {},
  receipts = [],
  invoice = {},
  previousInvoices = []
} = {}) => {
  const ordered = new Map((purchaseOrder.items || []).map((item) => [item.id, {
    ...item,
    quantity: quantity(item.quantity),
    unitPrice: item.unitPrice === null || item.unitPrice === undefined ? null : amount(item.unitPrice)
  }]));
  const accepted = new Map();
  for (const receipt of receipts.filter(postedReceipt)) {
    for (const item of receipt.items || []) {
      const id = itemId(item);
      accepted.set(id, quantity((accepted.get(id) || 0) + Number(item.acceptedQuantity ?? item.accepted_quantity ?? 0)));
    }
  }
  const previouslyInvoiced = new Map();
  for (const previous of previousInvoices.filter(activeInvoice)) {
    if (previous.id === invoice.id) continue;
    for (const item of previous.items || []) {
      const id = itemId(item);
      previouslyInvoiced.set(id, quantity((previouslyInvoiced.get(id) || 0) + Number(item.quantity || 0)));
    }
  }

  const issues = [];
  const addIssue = (code, severity, message, id = "") => issues.push({ code, severity, message, itemId: id });
  const purchaseCurrency = String(purchaseOrder.currency || "AZN").toUpperCase();
  const invoiceCurrency = String(invoice.currency || purchaseCurrency).toUpperCase();
  if (invoiceCurrency !== purchaseCurrency) {
    addIssue("currency_mismatch", "high", `Faktura valyutası (${invoiceCurrency}) sifariş valyutasına (${purchaseCurrency}) uyğun deyil.`);
  }
  let calculatedSubtotal = 0;
  let matchedItems = 0;
  for (const item of invoice.items || []) {
    const id = itemId(item);
    const orderedItem = ordered.get(id);
    if (!orderedItem) {
      addIssue("unknown_item", "high", "Faktura mövqeyi satınalma sifarişində yoxdur.", id);
      continue;
    }
    const invoiceQuantity = quantity(item.quantity);
    const invoiceUnitPrice = amount(item.unitPrice ?? item.unit_price);
    const invoiceLineTotal = amount(item.lineTotal ?? item.line_total);
    const expectedLineTotal = amount(invoiceQuantity * invoiceUnitPrice);
    const receivedQuantity = accepted.get(id) || 0;
    const cumulativeInvoiceQuantity = quantity((previouslyInvoiced.get(id) || 0) + invoiceQuantity);

    if (orderedItem.unitPrice === null) {
      addIssue("purchase_price_missing", "high", `${orderedItem.title || "Mövqe"} üçün sifariş qiyməti təsdiqlənməyib.`, id);
    } else if (Math.abs(invoiceUnitPrice - orderedItem.unitPrice) > 0.01) {
      addIssue("unit_price_mismatch", "high", `${orderedItem.title || "Mövqe"} üzrə faktura qiyməti sifariş qiymətindən fərqlənir.`, id);
    }
    if (cumulativeInvoiceQuantity - orderedItem.quantity > 0.001) {
      addIssue("ordered_quantity_exceeded", "high", `${orderedItem.title || "Mövqe"} üzrə fakturalanan miqdar sifarişi keçir.`, id);
    }
    if (cumulativeInvoiceQuantity - receivedQuantity > 0.001) {
      addIssue("accepted_quantity_exceeded", "high", `${orderedItem.title || "Mövqe"} üzrə fakturalanan miqdar qəbul edilmiş miqdarı keçir.`, id);
    }
    if (Math.abs(invoiceLineTotal - expectedLineTotal) > 0.01) {
      addIssue("line_total_mismatch", "high", `${orderedItem.title || "Mövqe"} üzrə sətir yekunu miqdar və qiymətə uyğun deyil.`, id);
    }
    calculatedSubtotal = amount(calculatedSubtotal + invoiceLineTotal);
    matchedItems += 1;
  }

  const declaredSubtotal = amount(invoice.subtotal);
  const taxAmount = amount(invoice.taxAmount ?? invoice.tax_amount);
  const deliveryAmount = amount(invoice.deliveryAmount ?? invoice.delivery_amount);
  const declaredTotal = amount(invoice.totalAmount ?? invoice.total_amount);
  const calculatedTotal = amount(declaredSubtotal + taxAmount + deliveryAmount);
  if (!matchedItems) addIssue("invoice_empty", "high", "Fakturada satınalma sifarişinə bağlı mövqe yoxdur.");
  if (Math.abs(declaredSubtotal - calculatedSubtotal) > 0.01) {
    addIssue("subtotal_mismatch", "high", "Faktura ara yekunu mövqelərin cəminə uyğun deyil.");
  }
  if (Math.abs(declaredTotal - calculatedTotal) > 0.01) {
    addIssue("invoice_total_mismatch", "high", "Faktura yekunu ara yekun, vergi və çatdırılma cəminə uyğun deyil.");
  }
  const purchaseTotal = purchaseOrder.totalAmount === null || purchaseOrder.totalAmount === undefined
    ? null
    : amount(purchaseOrder.totalAmount);
  const previousTotal = amount(previousInvoices.filter(activeInvoice).filter((item) => item.id !== invoice.id)
    .reduce((sum, item) => sum + Number(item.totalAmount ?? item.total_amount ?? 0), 0));
  if (purchaseTotal !== null && amount(previousTotal + declaredTotal) - purchaseTotal > 0.01) {
    addIssue("purchase_total_exceeded", "medium", "Fakturaların ümumi məbləği satınalma sifarişinin məbləğini keçir.");
  }

  const score = Math.max(0, 100 - issues.reduce((sum, item) => sum + (item.severity === "medium" ? 10 : 25), 0));
  return {
    status: issues.length ? "exception" : "matched",
    score,
    issues,
    totals: {
      ordered: purchaseTotal,
      previouslyInvoiced: previousTotal,
      invoice: declaredTotal,
      calculatedSubtotal,
      calculatedTotal
    },
    checkedItems: matchedItems,
    checkedAt: new Date().toISOString()
  };
};

export const procurementControlSummary = ({ purchaseOrders = [], receipts = [], invoices = [] } = {}) => ({
  purchaseOrders: purchaseOrders.length,
  openPurchaseOrders: purchaseOrders.filter((item) => !["delivered", "cancelled"].includes(item.status)).length,
  postedReceipts: receipts.filter(postedReceipt).length,
  matchExceptions: invoices.filter((item) => item.status !== "cancelled" && item.matchStatus === "exception").length,
  awaitingApproval: invoices.filter((item) => item.status === "matched").length,
  awaitingPayment: invoices.filter((item) => item.status === "approved").length,
  paidAmount: amount(invoices.filter((item) => item.status === "paid" && (!item.currency || item.currency === "AZN"))
    .reduce((sum, item) => sum + Number(item.totalAmount || 0), 0)),
  registeredAmount: amount(invoices.filter((item) => activeInvoice(item) && (!item.currency || item.currency === "AZN"))
    .reduce((sum, item) => sum + Number(item.totalAmount || 0), 0)),
  foreignCurrencyInvoices: invoices.filter((item) => activeInvoice(item) && item.currency && item.currency !== "AZN").length
});
