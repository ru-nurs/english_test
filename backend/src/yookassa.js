const crypto = require("crypto");

function trimText(value) {
  return String(value || "").trim();
}

function toBasicAuthHeader(shopId, secretKey) {
  const encoded = Buffer.from(`${shopId}:${secretKey}`, "utf8").toString("base64");
  return `Basic ${encoded}`;
}

function normalizeAmountValue(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Invalid payment amount");
  }
  return parsed.toFixed(2);
}

function createIdempotenceKey() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${crypto.randomBytes(12).toString("hex")}`;
}

function parseProviderErrorPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const parts = [payload.code, payload.description, payload.parameter]
    .map((item) => trimText(item))
    .filter(Boolean);
  return parts.join(": ");
}

function createClient(config) {
  const apiUrl = trimText(config.YOOKASSA_API_URL || "https://api.yookassa.ru/v3").replace(/\/+$/, "");
  const shopId = trimText(config.YOOKASSA_SHOP_ID);
  const secretKey = trimText(config.YOOKASSA_SECRET_KEY);

  function ensureConfigured() {
    if (!shopId || !secretKey) {
      throw new Error("YooKassa is not configured");
    }
  }

  function isConfigured() {
    return Boolean(shopId && secretKey);
  }

  async function request(method, endpointPath, { idempotenceKey = "", body } = {}) {
    ensureConfigured();

    const headers = {
      Authorization: toBasicAuthHeader(shopId, secretKey),
      Accept: "application/json",
    };
    if (idempotenceKey) {
      headers["Idempotence-Key"] = idempotenceKey;
    }
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    let response;
    try {
      response = await fetch(`${apiUrl}${endpointPath}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      throw new Error(`YooKassa request failed: ${error.message || "Network error"}`);
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const details = parseProviderErrorPayload(payload);
      throw new Error(
        `YooKassa error ${response.status}${details ? `: ${details}` : ""}`
      );
    }

    return payload;
  }

  async function createPayment({ amountValue, currency = "RUB", description, returnUrl, metadata = {} }) {
    const idempotenceKey = createIdempotenceKey();
    const payload = await request("POST", "/payments", {
      idempotenceKey,
      body: {
        amount: {
          value: normalizeAmountValue(amountValue),
          currency: trimText(currency) || "RUB",
        },
        capture: true,
        confirmation: {
          type: "redirect",
          return_url: trimText(returnUrl),
        },
        description: trimText(description),
        metadata,
      },
    });

    return {
      payment: payload,
      idempotenceKey,
    };
  }

  async function getPayment(paymentId) {
    const cleanPaymentId = trimText(paymentId);
    if (!cleanPaymentId) {
      throw new Error("paymentId is required");
    }
    return request("GET", `/payments/${encodeURIComponent(cleanPaymentId)}`);
  }

  return {
    isConfigured,
    createPayment,
    getPayment,
  };
}

module.exports = {
  createClient,
};
