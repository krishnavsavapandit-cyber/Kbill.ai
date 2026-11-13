import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppTextMessage, isWithin24HourWindow } from "@/lib/whatsapp";
import { requireBusiness } from "@/lib/auth";
import { decryptSecret } from "@/lib/encryption";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await requireBusiness(req);
    if (!auth.ok) return auth.response;
    const { businessId } = auth;

    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get("conversationId");

    const conversations = await prisma.conversation.findMany({
      where: { businessId },
      include: {
        customer: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { lastMessageAt: "desc" },
    });

    let currentMessages: any[] = [];
    if (conversationId) {
      // Tenant Isolation Check: Verify conversation belongs to this business
      const targetConv = await prisma.conversation.findFirst({
        where: { id: conversationId, businessId },
      });
      if (!targetConv) {
        return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
      }
      currentMessages = await prisma.message.findMany({
        where: { conversationId, businessId },
        orderBy: { createdAt: "asc" },
      });
    } else if (conversations.length > 0) {
      currentMessages = await prisma.message.findMany({
        where: { conversationId: conversations[0].id, businessId },
        orderBy: { createdAt: "asc" },
      });
    }

    return NextResponse.json({
      conversations,
      activeConversationId: conversationId || (conversations[0]?.id ?? null),
      messages: currentMessages,
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
    const { conversationId, customerId, text } = body;

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: "Message text cannot be empty." }, { status: 400 });
    }

    let targetConvId = conversationId;
    let targetCustomer: any = null;

    if (targetConvId) {
      // Body IDOR Protection: verify conversation belongs to business
      const conv = await prisma.conversation.findFirst({
        where: { id: targetConvId, businessId },
        include: { customer: true },
      });
      if (!conv) {
        return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
      }
      targetCustomer = conv.customer;
    } else if (customerId) {
      // Body IDOR Protection: verify customer belongs to business
      targetCustomer = await prisma.customer.findFirst({
        where: { id: customerId, businessId },
      });
      if (!targetCustomer) {
        return NextResponse.json({ error: "Customer not found." }, { status: 404 });
      }
      const conv = await prisma.conversation.upsert({
        where: {
          businessId_customerId_channel: {
            businessId,
            customerId: targetCustomer.id,
            channel: "WHATSAPP",
          },
        },
        update: {},
        create: {
          businessId,
          customerId: targetCustomer.id,
          channel: "WHATSAPP",
        },
      });
      targetConvId = conv.id;
    } else {
      return NextResponse.json({ error: "conversationId or customerId is required." }, { status: 400 });
    }

    // 24-Hour Customer Service Window Enforcement (Meta Policy)
    const activeConv = await prisma.conversation.findUnique({
      where: { id: targetConvId },
      select: { lastMessageAt: true },
    });
    const withinWindow = isWithin24HourWindow(activeConv?.lastMessageAt);
    const isTemplate = Boolean(body.isTemplate || body.templateName || body.type === "template");

    if (!withinWindow && !isTemplate) {
      return NextResponse.json(
        {
          error: "Outside 24-hour customer service window. Free-form messages are blocked by Meta policies. Only approved message templates can be sent.",
          code: "OUTSIDE_24_HOUR_WINDOW",
          lastMessageAt: activeConv?.lastMessageAt,
        },
        { status: 403 }
      );
    }

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: { integrationConfig: true },
    });

    const phoneNumberId = business?.integrationConfig?.metaPhoneNumberId || process.env.META_WA_PHONE_NUMBER_ID || "";
    const rawTok = business?.integrationConfig?.metaAccessToken || process.env.META_WA_ACCESS_TOKEN || "";
    const accessToken = decryptSecret(rawTok) || rawTok;

    if (!phoneNumberId || !accessToken) {
      return NextResponse.json(
        {
          error: "Meta WhatsApp credentials not connected. Please enter your Meta Phone Number ID and Access Token in Settings > Integrations.",
          code: "WHATSAPP_NOT_CONNECTED",
        },
        { status: 428 }
      );
    }

    const sendResult = await sendWhatsAppTextMessage(targetCustomer.phone, text, {
      phoneNumberId,
      accessToken,
    });

    if (!sendResult.success) {
      return NextResponse.json(
        {
          error: `Meta WhatsApp API rejected message: ${sendResult.error}`,
          code: sendResult.code || "SEND_FAILED",
          details: sendResult.details,
        },
        { status: 502 }
      );
    }

    const savedMessage = await prisma.message.create({
      data: {
        conversationId: targetConvId,
        businessId,
        direction: "OUTBOUND",
        senderType: "BUSINESS_USER",
        body: text,
        status: "SENT",
        metaMessageId: sendResult.messageId || null,
      },
    });

    await prisma.conversation.updateMany({
      where: { id: targetConvId, businessId },
      data: {
        lastMessageAt: new Date(),
        lastMessageText: text,
      },
    });

    return NextResponse.json({ message: savedMessage, success: true });
  } catch (err: any) {
    console.error("Send message error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
