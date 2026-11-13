import crypto from "crypto";

export interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
  wabaId?: string;
  appSecret?: string;
  webhookVerifyToken?: string;
}

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
  code?: string;
  details?: any;
}

/**
 * Validates Meta Webhook SHA256 signature using HMAC-SHA256 and timingSafeEqual.
 * Signature format in header: sha256=<hex_digest>
 */
export function verifyMetaSignature(
  payloadRaw: string | Buffer,
  signatureHeader: string | null | undefined,
  appSecret: string
): boolean {
  if (!signatureHeader || !appSecret) return false;

  const parts = signatureHeader.split("=");
  if (parts.length !== 2 || parts[0].trim() !== "sha256") return false;

  const expectedSignature = parts[1].trim();
  const calculatedSignature = crypto
    .createHmac("sha256", appSecret.trim())
    .update(payloadRaw)
    .digest("hex");

  const calcBuf = Buffer.from(calculatedSignature, "utf8");
  const expBuf = Buffer.from(expectedSignature, "utf8");

  if (calcBuf.length !== expBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(calcBuf, expBuf);
}

/**
 * Checks whether the conversation is within Meta's 24-hour customer service window.
 * Outside this window, only pre-approved message templates can be sent.
 */
export function isWithin24HourWindow(lastMessageAt: Date | string | null | undefined): boolean {
  if (!lastMessageAt) return false;
  const time = new Date(lastMessageAt).getTime();
  if (isNaN(time)) return false;
  const diffHours = (Date.now() - time) / (1000 * 60 * 60);
  return diffHours <= 24;
}

/**
 * Send real WhatsApp text message via Meta Graph API v21.0
 */
export async function sendWhatsAppTextMessage(
  recipientPhone: string,
  text: string,
  config: WhatsAppConfig
): Promise<SendMessageResult> {
  if (!config.phoneNumberId || !config.accessToken) {
    return {
      success: false,
      error: "WhatsApp Business credentials missing. Connect your Meta WhatsApp Account in Settings.",
      code: "NOT_CONNECTED",
    };
  }

  // Ensure phone has country code and digits only
  const cleanPhone = recipientPhone.replace(/\D/g, "");

  const url = `https://graph.facebook.com/v21.0/${config.phoneNumberId.trim()}/messages`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: cleanPhone,
        type: "text",
        text: { preview_url: false, body: text },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data?.error?.message || `WhatsApp API error: HTTP ${response.status}`;
      return {
        success: false,
        error: errorMsg,
        code: data?.error?.code?.toString() || "API_ERROR",
        details: data?.error,
      };
    }

    const messageId = data?.messages?.[0]?.id;
    return {
      success: true,
      messageId,
      details: data,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Failed to contact Meta WhatsApp API server.",
      code: "NETWORK_ERROR",
    };
  }
}

/**
 * Send WhatsApp Template Message (for business-initiated sessions)
 */
export async function sendWhatsAppTemplateMessage(
  recipientPhone: string,
  templateName: string,
  languageCode = "en_US",
  components: any[] = [],
  config: WhatsAppConfig
): Promise<SendMessageResult> {
  if (!config.phoneNumberId || !config.accessToken) {
    return {
      success: false,
      error: "WhatsApp Business credentials missing.",
      code: "NOT_CONNECTED",
    };
  }

  const cleanPhone = recipientPhone.replace(/\D/g, "");
  const url = `https://graph.facebook.com/v21.0/${config.phoneNumberId.trim()}/messages`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: cleanPhone,
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode },
          components,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data?.error?.message || `WhatsApp API error: HTTP ${response.status}`,
        code: data?.error?.code?.toString() || "TEMPLATE_ERROR",
        details: data?.error,
      };
    }

    return {
      success: true,
      messageId: data?.messages?.[0]?.id,
      details: data,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Template send failed.",
    };
  }
}

/**
 * Check real connection status of Meta WhatsApp Business Phone Number
 */
export async function testWhatsAppConnection(config: WhatsAppConfig): Promise<{
  connected: boolean;
  statusMessage: string;
  details?: any;
}> {
  if (!config.phoneNumberId || !config.accessToken) {
    return {
      connected: false,
      statusMessage: "Phone Number ID or Access Token is missing.",
    };
  }

  const url = `https://graph.facebook.com/v21.0/${config.phoneNumberId.trim()}?fields=verified_name,display_phone_number,quality_rating,code_verification_status`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.accessToken.trim()}`,
      },
    });

    const data = await res.json();
    if (!res.ok) {
      return {
        connected: false,
        statusMessage: data?.error?.message || `Verification failed: HTTP ${res.status}`,
        details: data?.error,
      };
    }

    return {
      connected: true,
      statusMessage: `Connected: ${data.verified_name || data.display_phone_number || "Meta Phone Number"} (Quality: ${data.quality_rating || "UNKNOWN"})`,
      details: data,
    };
  } catch (err: any) {
    return {
      connected: false,
      statusMessage: `Connection check error: ${err.message}`,
    };
  }
}
