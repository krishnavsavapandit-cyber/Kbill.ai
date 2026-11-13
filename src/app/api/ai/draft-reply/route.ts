import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { draftWhatsAppReply } from "@/lib/ai";
import { requireBusiness } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const auth = await requireBusiness(req);
    if (!auth.ok) return auth.response;
    const { businessId } = auth;

    const { conversationId } = await req.json();
    if (!conversationId) {
      return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
    }

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, businessId },
      include: {
        customer: true,
        messages: {
          orderBy: { createdAt: "asc" },
          take: 15,
        },
      },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: { services: true, integrationConfig: true },
    });
    if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

    const history = conversation.messages.map((m) => ({
      sender: m.senderType === "CUSTOMER" ? conversation.customer.name : "Business",
      text: m.body,
      time: m.createdAt.toISOString(),
    }));

    const apiKey = business.integrationConfig?.geminiApiKey || process.env.GEMINI_API_KEY || "";

    const aiResult = await draftWhatsAppReply(
      history,
      {
        name: business.name,
        category: business.category || undefined,
        hours: `${business.workingHoursStart} - ${business.workingHoursEnd}`,
        services: business.services.map((s) => ({
          name: s.name,
          price: s.price,
          duration: s.durationMinutes,
        })),
      },
      apiKey
    );

    if (!aiResult.success) {
      return NextResponse.json(
        {
          error: aiResult.error,
          code: aiResult.code || "AI_ERROR",
          needsConfig: aiResult.code === "API_KEY_MISSING",
        },
        { status: aiResult.code === "API_KEY_MISSING" ? 428 : 502 }
      );
    }

    const draftMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        businessId,
        direction: "OUTBOUND",
        senderType: "AI_ASSISTANT",
        body: aiResult.data.reply,
        status: "PENDING_APPROVAL",
        isAiGenerated: true,
        aiConfidence: aiResult.data.confidence,
      },
    });

    return NextResponse.json({
      draft: draftMessage,
      meta: aiResult.data,
      success: true,
    });
  } catch (err: any) {
    console.error("Draft reply error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
