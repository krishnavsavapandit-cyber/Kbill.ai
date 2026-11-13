import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { testWhatsAppConnection } from "@/lib/whatsapp";
import { testRazorpayConnection } from "@/lib/razorpay";
import { requireBusiness } from "@/lib/auth";
import { encryptSecret, decryptSecret, isEncrypted } from "@/lib/encryption";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await requireBusiness(req);
    if (!auth.ok) return auth.response;
    const { businessId, business } = auth;

    const fullBusiness = await prisma.business.findUnique({
      where: { id: businessId },
      include: { integrationConfig: true },
    });
    if (!fullBusiness) return NextResponse.json({ error: "Business not found" }, { status: 404 });

    const config = fullBusiness.integrationConfig;

    // 1. Database Status
    let databaseStatus = { connected: true, type: "SQLite / Supabase Compatible", details: "Persistent & Relational" };
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (e: any) {
      databaseStatus = { connected: false, type: "Error", details: e.message };
    }

    // 2. AI API (Google Gemini) Status
    const geminiKey = decryptSecret(config?.geminiApiKey) || process.env.GEMINI_API_KEY || "";
    let aiStatus = {
      connected: false,
      provider: "Google Gemini 1.5 Flash",
      details: "No API Key configured. Add GEMINI_API_KEY to enable AI Quotations and ReplyPilot drafts.",
    };
    if (geminiKey) {
      try {
        const testRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash?key=${geminiKey}`
        );
        if (testRes.ok) {
          aiStatus = {
            connected: true,
            provider: "Google Gemini 1.5 Flash",
            details: "Active & Validated (Structured JSON generation enabled)",
          };
        } else {
          const err = await testRes.json();
          aiStatus = {
            connected: false,
            provider: "Google Gemini 1.5 Flash",
            details: `Authentication failed: ${err?.error?.message || "Invalid Key"}`,
          };
        }
      } catch (err: any) {
        aiStatus = {
          connected: false,
          provider: "Google Gemini 1.5 Flash",
          details: `Network error verifying key: ${err.message}`,
        };
      }
    }

    // 3. WhatsApp Business Cloud API Status
    const waPhoneId = config?.metaPhoneNumberId || process.env.META_WA_PHONE_NUMBER_ID || "";
    const waToken = decryptSecret(config?.metaAccessToken) || process.env.META_WA_ACCESS_TOKEN || "";
    const waResult = await testWhatsAppConnection({ phoneNumberId: waPhoneId, accessToken: waToken });

    const whatsappStatus = {
      connected: waResult.connected,
      phoneNumberId: waPhoneId ? `${waPhoneId.slice(0, 4)}••••${waPhoneId.slice(-4)}` : null,
      webhookVerifyToken: config?.metaWebhookVerifyToken || "businessos_webhook_token_2026",
      details: waResult.statusMessage,
    };

    // 4. Razorpay Status
    const rzpKey = config?.razorpayKeyId || process.env.RAZORPAY_KEY_ID || "";
    const rzpSecret = decryptSecret(config?.razorpayKeySecret) || process.env.RAZORPAY_KEY_SECRET || "";
    const rzpResult = await testRazorpayConnection({ keyId: rzpKey, keySecret: rzpSecret });

    const razorpayStatus = {
      connected: rzpResult.connected,
      mode: rzpResult.mode,
      keyId: rzpKey ? `${rzpKey.slice(0, 8)}••••` : null,
      details: rzpResult.statusMessage,
    };

    // 5. Email (SMTP) Status
    const smtpHost = process.env.SMTP_HOST || "";
    const emailStatus = {
      connected: Boolean(smtpHost),
      details: smtpHost ? `Configured with ${smtpHost}` : "Not connected. Using in-app downloadable PDFs.",
    };

    return NextResponse.json({
      integrations: {
        database: databaseStatus,
        ai: aiStatus,
        whatsapp: whatsappStatus,
        razorpay: razorpayStatus,
        email: emailStatus,
      },
      rawConfig: {
        hasGeminiKey: Boolean(geminiKey),
        metaPhoneNumberId: waPhoneId,
        hasMetaAccessToken: Boolean(waToken),
        metaWebhookVerifyToken: config?.metaWebhookVerifyToken || "businessos_webhook_token_2026",
        metaAppSecretSet: Boolean(decryptSecret(config?.metaAppSecret) || process.env.META_WA_APP_SECRET),
        razorpayKeyId: rzpKey,
        hasRazorpaySecret: Boolean(rzpSecret),
        hasRazorpayWebhookSecret: Boolean(decryptSecret(config?.razorpayWebhookSecret) || process.env.RAZORPAY_WEBHOOK_SECRET),
        isRazorpayLive: config?.isRazorpayLive || false,
        credentialsEncryptedAtRest: true,
      },
      businessSlug: fullBusiness.slug,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireBusiness(req);
    if (!auth.ok) return auth.response;
    const { businessId } = auth;

    const body = await req.json();
    const {
      geminiApiKey,
      metaPhoneNumberId,
      metaAccessToken,
      metaWabaId,
      metaWebhookVerifyToken,
      metaAppSecret,
      razorpayKeyId,
      razorpayKeySecret,
      razorpayWebhookSecret,
      isRazorpayLive,
    } = body;

    const updated = await prisma.integrationConfig.upsert({
      where: { businessId },
      update: {
        ...(geminiApiKey !== undefined && { geminiApiKey: encryptSecret(geminiApiKey) }),
        ...(metaPhoneNumberId !== undefined && { metaPhoneNumberId: metaPhoneNumberId ? metaPhoneNumberId.trim() : null }),
        ...(metaAccessToken !== undefined && { metaAccessToken: encryptSecret(metaAccessToken) }),
        ...(metaWabaId !== undefined && { metaWabaId: metaWabaId ? metaWabaId.trim() : null }),
        ...(metaWebhookVerifyToken !== undefined && { metaWebhookVerifyToken: metaWebhookVerifyToken ? metaWebhookVerifyToken.trim() : "businessos_webhook_token_2026" }),
        ...(metaAppSecret !== undefined && { metaAppSecret: encryptSecret(metaAppSecret) }),
        ...(razorpayKeyId !== undefined && { razorpayKeyId: razorpayKeyId ? razorpayKeyId.trim() : null }),
        ...(razorpayKeySecret !== undefined && { razorpayKeySecret: encryptSecret(razorpayKeySecret) }),
        ...(razorpayWebhookSecret !== undefined && { razorpayWebhookSecret: encryptSecret(razorpayWebhookSecret) }),
        ...(isRazorpayLive !== undefined && { isRazorpayLive: Boolean(isRazorpayLive) }),
      },
      create: {
        businessId,
        geminiApiKey: encryptSecret(geminiApiKey),
        metaPhoneNumberId: metaPhoneNumberId ? metaPhoneNumberId.trim() : null,
        metaAccessToken: encryptSecret(metaAccessToken),
        metaWabaId: metaWabaId ? metaWabaId.trim() : null,
        metaWebhookVerifyToken: metaWebhookVerifyToken ? metaWebhookVerifyToken.trim() : "businessos_webhook_token_2026",
        metaAppSecret: encryptSecret(metaAppSecret),
        razorpayKeyId: razorpayKeyId ? razorpayKeyId.trim() : null,
        razorpayKeySecret: encryptSecret(razorpayKeySecret),
        razorpayWebhookSecret: encryptSecret(razorpayWebhookSecret),
        isRazorpayLive: Boolean(isRazorpayLive),
      },
    });

    await prisma.activityLog.create({
      data: {
        businessId,
        action: "INTEGRATION_SETTINGS_UPDATED",
        entityType: "SETTINGS",
        entityId: updated.id,
        description: "Updated external service integration credentials (encrypted at rest with AES-256-GCM).",
      },
    });

    return NextResponse.json({ success: true, config: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
