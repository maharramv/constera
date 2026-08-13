import test from "node:test";
import assert from "node:assert/strict";
import { calculateThreeWayMatch, procurementControlSummary } from "../../api/_lib/procurement-control.js";
import { normalizeAiInvoiceDocument, prepareAiInvoiceDocumentRequest } from "../../api/_lib/ai-foundation.js";

const purchaseOrder = {
  id: "spo-1",
  number: 10001,
  supplierName: "Test Təchizatçı",
  currency: "AZN",
  totalAmount: 200,
  items: [{ id: "spi-1", sku: "SKU-1", title: "Sement", quantity: 10, unit: "kisə", unitPrice: 20 }]
};
const receipts = [{
  id: "pgr-1",
  status: "posted",
  items: [{ purchaseOrderItemId: "spi-1", acceptedQuantity: 10 }]
}];

test("üçlü uyğunlaşdırma sifariş, qəbul və faktura bərabər olduqda ödənişə hazırlıq yaradır", () => {
  const result = calculateThreeWayMatch({
    purchaseOrder,
    receipts,
    invoice: {
      id: "sin-1", subtotal: 200, taxAmount: 0, deliveryAmount: 0, totalAmount: 200,
      items: [{ purchaseOrderItemId: "spi-1", quantity: 10, unitPrice: 20, lineTotal: 200 }]
    }
  });
  assert.equal(result.status, "matched");
  assert.equal(result.score, 100);
  assert.equal(result.issues.length, 0);
});

test("qəbul edilməmiş miqdar və fərqli qiymət avtomatik uyğunlaşdırmanı bloklayır", () => {
  const result = calculateThreeWayMatch({
    purchaseOrder,
    receipts: [{ ...receipts[0], items: [{ purchaseOrderItemId: "spi-1", acceptedQuantity: 4 }] }],
    invoice: {
      id: "sin-2", subtotal: 220, taxAmount: 0, deliveryAmount: 0, totalAmount: 220,
      items: [{ purchaseOrderItemId: "spi-1", quantity: 10, unitPrice: 22, lineTotal: 220 }]
    }
  });
  assert.equal(result.status, "exception");
  assert.ok(result.issues.some((item) => item.code === "accepted_quantity_exceeded"));
  assert.ok(result.issues.some((item) => item.code === "unit_price_mismatch"));
});

test("faktura valyutası sifariş valyutasından fərqlidirsə uyğunlaşdırma bloklanır", () => {
  const result = calculateThreeWayMatch({
    purchaseOrder,
    receipts,
    invoice: {
      id: "sin-currency", currency: "USD", subtotal: 200, taxAmount: 0, deliveryAmount: 0, totalAmount: 200,
      items: [{ purchaseOrderItemId: "spi-1", quantity: 10, unitPrice: 20, lineTotal: 200 }]
    }
  });
  assert.equal(result.status, "exception");
  assert.ok(result.issues.some((item) => item.code === "currency_mismatch"));
});

test("əvvəlki fakturalar kumulyativ artıq fakturalanmanı aşkarlayır", () => {
  const result = calculateThreeWayMatch({
    purchaseOrder,
    receipts,
    invoice: {
      id: "sin-current", subtotal: 120, taxAmount: 0, deliveryAmount: 0, totalAmount: 120,
      items: [{ purchaseOrderItemId: "spi-1", quantity: 6, unitPrice: 20, lineTotal: 120 }]
    },
    previousInvoices: [{
      id: "sin-old", status: "approved", totalAmount: 100,
      items: [{ purchaseOrderItemId: "spi-1", quantity: 5 }]
    }]
  });
  assert.equal(result.status, "exception");
  assert.ok(result.issues.some((item) => item.code === "ordered_quantity_exceeded"));
});

test("sifariş yekununu aşan kumulyativ faktura ödəniş təsdiqini bloklayır", () => {
  const result = calculateThreeWayMatch({
    purchaseOrder,
    receipts,
    invoice: {
      id: "sin-current-total", subtotal: 120, taxAmount: 0, deliveryAmount: 0, totalAmount: 120,
      items: [{ purchaseOrderItemId: "spi-1", quantity: 6, unitPrice: 20, lineTotal: 120 }]
    },
    previousInvoices: [{
      id: "sin-old-total", status: "approved", totalAmount: 100,
      items: [{ purchaseOrderItemId: "spi-1", quantity: 4 }]
    }]
  });
  assert.equal(result.status, "exception");
  assert.ok(result.issues.some((item) => item.code === "purchase_total_exceeded"));
});

test("AI faktura konteksti yalnız satınalma mövqelərini və təhlükəsiz sənədi saxlayır", () => {
  const prepared = prepareAiInvoiceDocumentRequest({
    input: { document: { fileName: "faktura.pdf", mimeType: "application/pdf", contentBase64: "JVBERi0xLjQ=" } },
    purchaseOrder: { ...purchaseOrder, hidden: "saxlanmamalıdır" }
  });
  assert.equal(prepared.context.purchaseOrder.items[0].purchaseOrderItemId, "spi-1");
  assert.equal(prepared.context.purchaseOrder.hidden, undefined);
  const normalized = normalizeAiInvoiceDocument({
    purchaseOrder,
    invoice: {
      invoiceNumber: "INV-1", invoiceDate: "2026-08-13", dueDate: "2026-08-20",
      currency: "AZN", subtotal: 200, taxAmount: 0, deliveryAmount: 0, totalAmount: 200,
      confidence: 0.9, warnings: [],
      items: [
        { purchaseOrderItemId: "spi-1", description: "Sement", quantity: 10, unitPrice: 20, lineTotal: 200, confidence: 0.9 },
        { purchaseOrderItemId: "saxta-id", description: "Saxta mövqe", quantity: 1, unitPrice: 1, lineTotal: 1, confidence: 0.9 }
      ]
    }
  });
  assert.equal(normalized.output.items.length, 1);
  assert.match(normalized.output.warnings.join(" "), /avtomatik tapılmadı/);
});

test("satınalma KPI-ları açıq, fərqli və ödəniş gözləyən fakturaları sayır", () => {
  const result = procurementControlSummary({
    purchaseOrders: [{ status: "issued" }, { status: "delivered" }],
    receipts,
    invoices: [
      { status: "exception", matchStatus: "exception", totalAmount: 100 },
      { status: "approved", matchStatus: "matched", totalAmount: 200 },
      { status: "paid", matchStatus: "matched", totalAmount: 300 },
      { status: "matched", matchStatus: "matched", totalAmount: 500, currency: "USD" }
    ]
  });
  assert.equal(result.openPurchaseOrders, 1);
  assert.equal(result.matchExceptions, 1);
  assert.equal(result.awaitingPayment, 1);
  assert.equal(result.paidAmount, 300);
  assert.equal(result.registeredAmount, 600);
  assert.equal(result.foreignCurrencyInvoices, 1);
});
