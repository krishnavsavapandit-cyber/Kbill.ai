import crypto from "crypto";

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret?: string;
  isLive?: boolean;
}

/**
 * Honest Plan Tiers: One-Time 30-Day Prepaid Access.
 * Disclosed: India RBI regulations require e-mandate registration for recurring auto-debit.
 * Until full Razorpay Subscriptions recurring mandates are integrated with banks,
 * these tiers represent upfront 30-day prepaid plan purchases, NOT silent monthly auto-debit.
 */
export const SUBSCRIPTION_PLANS = {
  STARTER: {
    id: "STARTER",
    name: "Starter (30-Day Plan)",
    priceInInr: 199,
    priceInPaise: 19900,
    interval: "30_days",
    billingModel: "ONE_TIME_PURCHASE",
    description: "One-time 30-day access for solo entrepreneurs and micro-businesses.",
    features: [
      "Up to 50 Quotes/Invoices for 30 days",
      "Official Meta WhatsApp messaging integration",
      "SlotWise appointment booking (1 calendar)",
      "Customer directory & activity tracking",
      "Standard PDF quotation generator",
    ],
  },
  PRO: {
    id: "PRO",
    name: "Pro (30-Day Plan)",
    priceInInr: 499,
    priceInPaise: 49900,
    interval: "30_days",
    billingModel: "ONE_TIME_PURCHASE",
    description: "One-time 30-day access for growing service businesses.",
    features: [
      "Unlimited Quotations & Invoices for 30 days",
      "AI Quotation line item generation from prompt",
      "AI WhatsApp reply suggestions with approval flow",
      "Multiple service types & automated booking buffers",
      "Verified Razorpay payments & invoice tracking",
      "Custom business branding on PDFs",
    ],
  },
  BUSINESS: {
    id: "BUSINESS",
    name: "Business (30-Day Plan)",
    priceInInr: 999,
    priceInPaise: 99900,
    interval: "30_days",
    billingModel: "ONE_TIME_PURCHASE",
    description: "One-time 30-day access for multi-staff businesses with priority automation.",
    features: [
      "Everything in Pro Plan for 30 days",
      "Multi-staff calendar assignment & schedules",
      "AI Conversation Summaries & Lead Intent Extraction",
      "AI Strategic Business Insights & Growth Advisor",
      "Dedicated Webhook listeners & audit logs",
      "Priority customer assistance",
    ],
  },
} as const;

export type PlanKey = keyof typeof SUBSCRIPTION_PLANS;

/**
 * Server-side order creation via Razorpay Orders API
 * POST https://api.razorpay.com/v1/orders
 */
export async function createRazorpayOrder(params: {
  amountInPaise: number;
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
  config: RazorpayConfig;
}): Promise<
  | { success: true; orderId: string; amount: number; currency: string; order: any }
  | { success: false; error: string; code?: string }
> {
  const { amountInPaise, currency = "INR", receipt, notes = {}, config } = params;

  if (!config.keyId || !config.keySecret) {
    return {
      success: false,
      error: "Razorpay credentials not configured. Please enter your Razorpay Key ID and Secret in Settings.",
      code: "CREDENTIALS_MISSING",
    };
  }

  const authHeader = Buffer.from(`${config.keyId.trim()}:${config.keySecret.trim()}`).toString("base64");

  try {
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${authHeader}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Math.round(amountInPaise),
        currency,
        receipt,
        notes,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        success: false,
        error: data?.error?.description || data?.error?.message || `Razorpay order failed: HTTP ${res.status}`,
        code: data?.error?.code || "ORDER_CREATION_FAILED",
      };
    }

    return {
      success: true,
      orderId: data.id,
      amount: data.amount,
      currency: data.currency,
      order: data,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Failed to communicate with Razorpay API.",
      code: "NETWORK_ERROR",
    };
  }
}

/**
 * Verifies Razorpay payment signature cryptographically using timing-safe comparison.
 * generated_signature = hmac_sha256(order_id + "|" + razorpay_payment_id, secret)
 */
export function verifyRazorpayPaymentSignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
  keySecret: string;
}): boolean {
  const { orderId, paymentId, signature, keySecret } = params;
  if (!orderId || !paymentId || !signature || !keySecret) return false;

  const body = `${orderId}|${paymentId}`;
  const expectedSignature = crypto
    .createHmac("sha256", keySecret.trim())
    .update(body)
    .digest("hex");

  const expectedBuf = Buffer.from(expectedSignature, "utf8");
  const signatureBuf = Buffer.from(signature.trim(), "utf8");

  if (expectedBuf.length !== signatureBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}

/**
 * Verifies Razorpay Webhook signature on the RAW request body with timing-safe comparison.
 */
export function verifyRazorpayWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  webhookSecret: string
): boolean {
  if (!signatureHeader || !webhookSecret) return false;

  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret.trim())
    .update(rawBody)
    .digest("hex");

  const expectedBuf = Buffer.from(expectedSignature, "utf8");
  const signatureBuf = Buffer.from(signatureHeader.trim(), "utf8");

  if (expectedBuf.length !== signatureBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}

/**
 * Validates Razorpay API credentials against Razorpay Payments API
 */
export async function testRazorpayConnection(config: RazorpayConfig): Promise<{
  connected: boolean;
  mode: "test" | "live" | "not_connected";
  statusMessage: string;
}> {
  if (!config.keyId || !config.keySecret) {
    return {
      connected: false,
      mode: "not_connected",
      statusMessage: "Razorpay Key ID and Key Secret are not set.",
    };
  }

  const isTest = config.keyId.startsWith("rzp_test_");
  const authHeader = Buffer.from(`${config.keyId.trim()}:${config.keySecret.trim()}`).toString("base64");

  try {
    const res = await fetch("https://api.razorpay.com/v1/payments?count=1", {
      headers: { Authorization: `Basic ${authHeader}` },
    });

    if (res.ok) {
      return {
        connected: true,
        mode: isTest ? "test" : "live",
        statusMessage: `Connected successfully (${isTest ? "Test Mode" : "Live Mode"}).`,
      };
    }

    const err = await res.json();
    return {
      connected: false,
      mode: "not_connected",
      statusMessage: err?.error?.description || `Authentication failed: HTTP ${res.status}`,
    };
  } catch (err: any) {
    return {
      connected: false,
      mode: "not_connected",
      statusMessage: `Connection check failed: ${err.message}`,
    };
  }
}
