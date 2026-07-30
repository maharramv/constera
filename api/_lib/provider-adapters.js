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

const normalizedIban = () => String(process.env.BANK_TRANSFER_IBAN || "")
  .replace(/\s+/g, "")
  .toUpperCase();

const hasValidIbanChecksum = (iban) => {
  if (!/^AZ[0-9]{2}[0-9A-Z]{24}$/.test(iban)) return false;
  const rearranged = `${iban.slice(4)}${iban.slice(0, 4)}`
    .replace(/[A-Z]/g, (character) => String(character.charCodeAt(0) - 55));
  let remainder = 0;
  for (const digit of rearranged) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
};

export const bankTransferReadiness = () => (
  String(process.env.BANK_TRANSFER_ACCOUNT_NAME || "").trim().length >= 3
  && String(process.env.BANK_TRANSFER_BANK_NAME || "").trim().length >= 2
  && hasValidIbanChecksum(normalizedIban())
);

export const bankTransferInstructions = () => {
  if (!bankTransferReadiness()) return null;
  return {
    accountName: String(process.env.BANK_TRANSFER_ACCOUNT_NAME).trim(),
    bankName: String(process.env.BANK_TRANSFER_BANK_NAME).trim(),
    iban: normalizedIban(),
    taxId: String(process.env.BANK_TRANSFER_TAX_ID || "").trim(),
    currency: "AZN",
    note: "Təyinat hissəsində sifariş nömrəsini qeyd edin."
  };
};

export const providerReadiness = () => ({
  payment: configuredHttpsEndpoint(process.env.PAYMENT_WEBHOOK_URL, process.env.PAYMENT_WEBHOOK_SECRET),
  bankTransfer: bankTransferReadiness(),
  electronicInvoice: configuredHttpsEndpoint(process.env.EINVOICE_WEBHOOK_URL, process.env.EINVOICE_WEBHOOK_SECRET),
  aiEstimate: configuredHttpsEndpoint(process.env.AI_ESTIMATE_WEBHOOK_URL, process.env.AI_ESTIMATE_WEBHOOK_SECRET),
  email: configuredHttpsEndpoint(process.env.EMAIL_WEBHOOK_URL, process.env.NOTIFICATION_WEBHOOK_SECRET || "configured"),
  whatsapp: configuredHttpsEndpoint(process.env.WHATSAPP_WEBHOOK_URL, process.env.NOTIFICATION_WEBHOOK_SECRET || "configured")
});

export const providerConfigurationStatus = () => {
  const readiness = providerReadiness();
  const items = [
    ["payment", "Kart ödənişi", process.env.PAYMENT_WEBHOOK_URL, process.env.PAYMENT_WEBHOOK_SECRET, true],
    ["electronicInvoice", "Elektron qaimə", process.env.EINVOICE_WEBHOOK_URL, process.env.EINVOICE_WEBHOOK_SECRET, true],
    ["aiEstimate", "AI smeta", process.env.AI_ESTIMATE_WEBHOOK_URL, process.env.AI_ESTIMATE_WEBHOOK_SECRET, true],
    ["email", "E-poçt", process.env.EMAIL_WEBHOOK_URL, process.env.NOTIFICATION_WEBHOOK_SECRET, false],
    ["whatsapp", "WhatsApp", process.env.WHATSAPP_WEBHOOK_URL, process.env.NOTIFICATION_WEBHOOK_SECRET, false]
  ];
  return [{
    key: "bankTransfer",
    label: "Bank köçürməsi",
    ready: readiness.bankTransfer,
    accountConfigured: Boolean(String(process.env.BANK_TRANSFER_ACCOUNT_NAME || "").trim()),
    bankConfigured: Boolean(String(process.env.BANK_TRANSFER_BANK_NAME || "").trim()),
    ibanConfigured: Boolean(normalizedIban()),
    secretRequired: false
  }, ...items.map(([key, label, endpoint, secret, secretRequired]) => {
    let endpointValid = false;
    try {
      endpointValid = new URL(endpoint || "").protocol === "https:";
    } catch {
      endpointValid = false;
    }
    return {
      key,
      label,
      ready: Boolean(readiness[key]),
      endpointConfigured: Boolean(endpoint),
      endpointValid,
      secretConfigured: Boolean(secret),
      secretRequired
    };
  })];
};

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
