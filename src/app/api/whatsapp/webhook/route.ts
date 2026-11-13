import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyMetaSignature } from "@/lib/whatsapp";
import { decryptSecret } from "@/lib/encryption";
import { draftWhatsAppReply } from "@/lib/ai";

/**
 * Meta Webhook Verification Handshake (GET)
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  // Verify against tenant-configured token or platform default token
  const matchingConfig = token
    ? await prisma.integrationConfig.findFirst({
        where: { metaWebhookVerifyToken: token },
      })
    : null;

  const platformToken =
    process.env.META_WA_WEBHOOK_VERIFY_TOKEN || "businessos_webhook_token_2026";

  if (mode === "subscribe" && (matchingConfig || token === platformToken)) {
    return new Response(challenge || "", { status: 200 });
  }

  return new Response("Forbidden: Invalid verification token", { status: 403 });
}

/**
 * Meta Webhook Event Notification (POST)
 */
export async function POST(req: Request) {
  try {
    // 1. Read RAW request body as text for cryptographic HMAC-SHA256 verification
    const rawBody = await req.text();
    const signature = req.headers.get("x-hub-signature-256");

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON webhook payload" }, { status: 400 });
    }

    const entry = payload?.entry?.[0];
    const change = entry?.changes?.[0]?.value;

    if (!change) return NextResponse.json({ received: true });

    // 2. Identify the target business from phone_number_id or default tenant
    const phoneNumberId = change?.metadata?.phone_number_id;
    let business: any = null;

    if (phoneNumberId) {
      const config = await prisma.integrationConfig.findFirst({
        where: { metaPhoneNumberId: phoneNumberId },
        include: { business: { include: { integrationConfig: true, services: true } } },
      });
      business = config?.business;
    }

    if (!business) {
      business = await prisma.business.findFirst({
        include: { integrationConfig: true, services: true },
      });
    }

    if (!business) return NextResponse.json({ received: true });

    // 3. Cryptographic Signature Verification
    const rawSecret =
      business.integrationConfig?.metaAppSecret || process.env.META_WA_APP_SECRET || "";
    const appSecret = decryptSecret(rawSecret) || rawSecret;

    if (appSecret) {
      if (!signature) {
        return new Response("Missing x-hub-signature-256 header", { status: 400 });
      }

      const isValid = verifyMetaSignature(rawBody, signature, appSecret);
      if (!isValid) {
        return new Response("Invalid Meta webhook HMAC signature", { status: 401 });
      }
    } else if (signature) {
      // Signature provided but no app secret on server
      const platformSecret = process.env.META_WA_APP_SECRET || "";
      if (platformSecret && !verifyMetaSignature(rawBody, signature, platformSecret)) {
        return new Response("Invalid Meta webhook HMAC signature", { status: 401 });
      }
    }

    // 4. Inbound Messages Processing (with wamid Idempotency)
    if (change.messages && change.messages.length > 0) {
      for (const msg of change.messages) {
        const metaId = msg.id; // e.g., wamid.HBgM...

        // Idempotency: Duplicate wamid MUST be ignored to prevent duplicate messages & logs
        if (metaId) {
          const existingMessage = await prisma.message.findFirst({
            where: { metaMessageId: metaId },
          });
          if (existingMessage) {
            continue; // Already processed this message
          }
        }

        const fromPhone = `+${msg.from}`;
        const messageText = msg.text?.body || `[Unsupported message type: ${msg.type}]`;

        // Find or create customer
        let customer = await prisma.customer.findFirst({
          where: {
            businessId: business.id,
            phone: { contains: msg.from.slice(-10) },
          },
        });

        if (!customer) {
          const contactName = change.contacts?.[0]?.profile?.name || `Customer +${msg.from}`;
          customer = await prisma.customer.create({
            data: {
              businessId: business.id,
              name: contactName,
              phone: fromPhone,
            },
          });
        }

        // Upsert conversation
        const conversation = await prisma.conversation.upsert({
          where: {
            businessId_customerId_channel: {
              businessId: business.id,
              customerId: customer.id,
              channel: "WHATSAPP",
            },
          },
          update: {
            lastMessageAt: new Date(),
            lastMessageText: messageText,
            unreadCount: { increment: 1 },
          },
          create: {
            businessId: business.id,
            customerId: customer.id,
            channel: "WHATSAPP",
            lastMessageAt: new Date(),
            lastMessageText: messageText,
            unreadCount: 1,
          },
        });

        // Save incoming message
        await prisma.message.create({
          data: {
            conversationId: conversation.id,
            businessId: business.id,
            direction: "INBOUND",
            senderType: "CUSTOMER",
            body: messageText,
            status: "DELIVERED",
            metaMessageId: metaId,
          },
        });

        await prisma.activityLog.create({
          data: {
            businessId: business.id,
            action: "WHATSAPP_MESSAGE_RECEIVED",
            entityType: "MESSAGE",
            entityId: metaId || customer.id,
            description: `Received WhatsApp message from ${customer.name} (${fromPhone}): "${messageText}"`,
          },
        });

        // Attempt automated AI reply drafting (STAYS in PENDING_APPROVAL for human review)
        const apiKey = business.integrationConfig?.geminiApiKey || process.env.GEMINI_API_KEY;
        if (apiKey) {
          try {
            const aiDraft = await draftWhatsAppReply(
              [{ sender: customer.name, text: messageText }],
              {
                name: business.name,
                category: business.category || undefined,
                services: business.services?.map((s: any) => ({
                  name: s.name,
                  price: s.price,
                  duration: s.durationMinutes,
                })) || [],
              },
              apiKey
            );

            if (aiDraft.success) {
              await prisma.message.create({
                data: {
                  conversationId: conversation.id,
                  businessId: business.id,
                  direction: "OUTBOUND",
                  senderType: "AI_ASSISTANT",
                  body: aiDraft.data.reply,
                  status: "PENDING_APPROVAL", // Explicit: human review required before sending
                  isAiGenerated: true,
                  aiConfidence: aiDraft.data.confidence,
                },
              });
            }
          } catch (aiErr) {
            console.error("Auto draft error:", aiErr);
          }
        }
      }
    }

    // 5. Status Updates (SENT, DELIVERED, READ, FAILED)
    if (change.statuses && change.statuses.length > 0) {
      for (const st of change.statuses) {
        const metaId = st.id;
        const rawStatus = (st.status || "").toUpperCase();
        const allowedStatuses = ["SENT", "DELIVERED", "READ", "FAILED"];

        if (metaId && allowedStatuses.includes(rawStatus)) {
          await prisma.message.updateMany({
            where: { metaMessageId: metaId },
            data: { status: rawStatus },
          });
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("Webhook processing error:", err);
    return NextResponse.json({ received: true });
  }
}
