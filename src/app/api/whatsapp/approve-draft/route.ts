import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp";
import { requireBusiness } from "@/lib/auth";
import { decryptSecret } from "@/lib/encryption";

export async function POST(req: Request) {
  try {
    const auth = await requireBusiness(req);
    if (!auth.ok) return auth.response;
    const { businessId, userId } = auth;

    const body = await req.json();
    const { draftMessageId, editedText } = body;

    if (!draftMessageId) {
      return NextResponse.json({ error: "draftMessageId is required" }, { status: 400 });
    }

    const draft = await prisma.message.findFirst({
      where: { id: draftMessageId, businessId },
      include: {
        conversation: { include: { customer: true } },
      },
    });

    if (!draft) {
      return NextResponse.json({ error: "Draft message not found" }, { status: 404 });
    }

    // Security check: Message must explicitly be in PENDING_APPROVAL status
    if (draft.status !== "PENDING_APPROVAL") {
      return NextResponse.json(
        {
          error: `Message cannot be approved: current status is ${draft.status}. Only PENDING_APPROVAL drafts can be approved.`,
          code: "NOT_A_PENDING_DRAFT",
        },
        { status: 400 }
      );
    }

    const messageText = editedText !== undefined ? editedText : draft.body;
    const recipientPhone = draft.conversation.customer.phone;

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
          error: "Meta WhatsApp credentials not configured. Please enter your Meta credentials in Settings to send live messages.",
          code: "WHATSAPP_NOT_CONNECTED",
        },
        { status: 428 }
      );
    }

    const sendResult = await sendWhatsAppTextMessage(recipientPhone, messageText, {
      phoneNumberId,
      accessToken,
    });

    if (!sendResult.success) {
      return NextResponse.json(
        {
          error: `Meta WhatsApp API error: ${sendResult.error}`,
          code: sendResult.code || "SEND_FAILED",
          details: sendResult.details,
        },
        { status: 502 }
      );
    }

    const updateMsgRes = await prisma.message.updateMany({
      where: { id: draft.id, businessId },
      data: {
        body: messageText,
        status: "SENT",
        metaMessageId: sendResult.messageId || null,
        approvedByUserId: userId,
        approvedAt: new Date(),
      },
    });

    if (updateMsgRes.count === 0) {
      return NextResponse.json({ error: "Draft message not found" }, { status: 404 });
    }

    await prisma.conversation.updateMany({
      where: { id: draft.conversationId, businessId },
      data: {
        lastMessageAt: new Date(),
        lastMessageText: messageText,
      },
    });

    const updated = await prisma.message.findFirst({
      where: { id: draft.id, businessId },
    });

    await prisma.activityLog.create({
      data: {
        businessId,
        userId,
        action: "AI_REPLY_APPROVED_AND_SENT",
        entityType: "MESSAGE",
        entityId: draft.id,
        description: `Approved & sent AI WhatsApp reply to ${draft.conversation.customer.name} (${recipientPhone}).`,
      },
    });

    return NextResponse.json({ message: updated, success: true });
  } catch (err: any) {
    console.error("Approve draft error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
