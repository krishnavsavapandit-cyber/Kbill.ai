import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateQuotationFromPrompt } from "@/lib/ai";
import { requireBusiness } from "@/lib/auth";
import { decryptSecret } from "@/lib/encryption";

export async function POST(req: Request) {
  try {
    const auth = await requireBusiness(req);
    if (!auth.ok) return auth.response;
    const { businessId } = auth;

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: { services: true, integrationConfig: true },
    });
    if (!business) return NextResponse.json({ error: "No business configured" }, { status: 404 });

    const body = await req.json();
    const { prompt } = body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return NextResponse.json({ error: "Please provide a description of the quote needed." }, { status: 400 });
    }

    const rawKey = business.integrationConfig?.geminiApiKey || process.env.GEMINI_API_KEY || "";
    const apiKey = decryptSecret(rawKey) || rawKey;

    const aiResult = await generateQuotationFromPrompt(
      prompt,
      {
        name: business.name,
        currency: business.currency,
        services: business.services.map((s) => ({ id: s.id, name: s.name, price: s.price })),
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

    return NextResponse.json({ quotation: aiResult.data, success: true });
  } catch (err: any) {
    console.error("AI Quote error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
