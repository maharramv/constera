import { ApiError } from "./http.js";

const httpsEndpoint = (value, name) => {
  const source = String(value || "").trim();
  if (!source) throw new ApiError(503, "integration_not_configured", `${name} inteqrasiyası qurulmayıb.`);
  try {
    const url = new URL(source);
    if (url.protocol !== "https:") throw new Error("HTTPS tələb olunur");
    return url.toString();
  } catch {
    throw new ApiError(503, "integration_misconfigured", `${name} üçün düzgün HTTPS endpoint yazılmayıb.`);
  }
};

const postProvider = async ({ endpoint, secret, body, name }) => {
  let response;
  try {
    response = await fetch(httpsEndpoint(endpoint, name), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { Authorization: `Bearer ${secret}` } : {})
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000)
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, "provider_unreachable", `${name} xidməti ilə əlaqə qurulmadı.`);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(502, "provider_error", `${name} xidməti sorğunu qəbul etmədi.`, {
      status: response.status,
      message: String(payload.message || payload.error || "").slice(0, 300)
    });
  }
  return payload;
};

const configuredHttpsEndpoint = (value, secret) => {
  if (!value || !secret) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

export const providerReadiness = () => ({
  payment: configuredHttpsEndpoint(process.env.PAYMENT_WEBHOOK_URL, process.env.PAYMENT_WEBHOOK_SECRET),
  electronicInvoice: configuredHttpsEndpoint(process.env.EINVOICE_WEBHOOK_URL, process.env.EINVOICE_WEBHOOK_SECRET),
  aiEstimate: configuredHttpsEndpoint(process.env.AI_ESTIMATE_WEBHOOK_URL, process.env.AI_ESTIMATE_WEBHOOK_SECRET),
  email: configuredHttpsEndpoint(process.env.EMAIL_WEBHOOK_URL, process.env.NOTIFICATION_WEBHOOK_SECRET || "configured"),
  whatsapp: configuredHttpsEndpoint(process.env.WHATSAPP_WEBHOOK_URL, process.env.NOTIFICATION_WEBHOOK_SECRET || "configured")
});

export const createPaymentCheckout = async ({ transaction, order, returnUrl }) => {
  const payload = await postProvider({
    endpoint: process.env.PAYMENT_WEBHOOK_URL,
    secret: process.env.PAYMENT_WEBHOOK_SECRET,
    name: "Kart ödənişi",
    body: {
      action: "create_checkout",
      source: "ConstEra",
      transactionId: transaction.id,
      idempotencyKey: transaction.idempotencyKey,
      order: {
        id: order.id,
        number: order.orderNumber,
        amount: order.totalAmount,
        currency: order.currency,
        companyName: order.companyName,
        contactName: order.contactName,
        email: order.email,
        phone: order.phone
      },
      returnUrl,
      webhookUrl: "https://constera.az/api/integrations?action=payment-webhook"
    }
  });
  const checkoutUrl = String(payload.checkoutUrl || payload.url || "");
  if (!checkoutUrl.startsWith("https://")) {
    throw new ApiError(502, "invalid_provider_response", "Ödəniş provayderi təhlükəsiz checkout URL-i qaytarmadı.");
  }
  return {
    externalId: String(payload.externalId || payload.paymentId || transaction.id),
    checkoutUrl,
    payload
  };
};

export const refundPayment = async ({ refund, transaction, order }) => {
  const payload = await postProvider({
    endpoint: process.env.PAYMENT_WEBHOOK_URL,
    secret: process.env.PAYMENT_WEBHOOK_SECRET,
    name: "Ödəniş geri qaytarılması",
    body: {
      action: "refund_payment",
      source: "ConstEra",
      refundId: refund.id,
      transactionId: transaction.id,
      externalPaymentId: transaction.external_id,
      orderId: order.id,
      amount: refund.amount,
      currency: refund.currency,
      reason: refund.reason
    }
  });
  const status = String(payload.status || "completed").toLowerCase();
  if (!["processing", "completed"].includes(status)) {
    throw new ApiError(502, "invalid_provider_response", "Ödəniş provayderi geri qaytarma əməliyyatını təsdiqləmədi.");
  }
  return {
    externalId: String(payload.externalId || payload.refundId || refund.id),
    status,
    payload
  };
};

export const issueElectronicInvoice = async ({ invoiceId, order }) => {
  const payload = await postProvider({
    endpoint: process.env.EINVOICE_WEBHOOK_URL,
    secret: process.env.EINVOICE_WEBHOOK_SECRET,
    name: "Elektron qaimə",
    body: {
      action: "issue_invoice",
      source: "ConstEra",
      invoiceId,
      order
    }
  });
  const documentUrl = String(payload.documentUrl || payload.url || "");
  if (documentUrl && !documentUrl.startsWith("https://")) {
    throw new ApiError(502, "invalid_provider_response", "Elektron qaimə provayderi təhlükəsiz sənəd URL-i qaytarmadı.");
  }
  return {
    externalId: String(payload.externalId || payload.invoiceId || invoiceId),
    documentUrl,
    payload
  };
};

export const generateProviderEstimate = async ({ requestId, input, deterministicEstimate }) => {
  const payload = await postProvider({
    endpoint: process.env.AI_ESTIMATE_WEBHOOK_URL,
    secret: process.env.AI_ESTIMATE_WEBHOOK_SECRET,
    name: "AI smeta",
    body: {
      action: "generate_estimate",
      source: "ConstEra",
      requestId,
      locale: "az-AZ",
      input,
      deterministicEstimate
    }
  });
  const estimate = payload.estimate && typeof payload.estimate === "object" ? payload.estimate : payload;
  if (!Array.isArray(estimate.rows)) {
    throw new ApiError(502, "invalid_provider_response", "AI smeta provayderi material sətirlərini qaytarmadı.");
  }
  return {
    ...estimate,
    rows: estimate.rows.slice(0, 500)
  };
};
