import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateBusinessInsights } from "@/lib/ai";
import { requireBusiness } from "@/lib/auth";
import { decryptSecret } from "@/lib/encryption";

export async function POST(req: Request) {
  try {
    const auth = await requireBusiness(req);
    if (!auth.ok) return auth.response;
    const { businessId } = auth;

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: { integrationConfig: true },
    });
    if (!business) return NextResponse.json({ error: "No business found" }, { status: 404 });

    const [payments, invoices, customers, quotations, appointments] = await Promise.all([
      prisma.payment.findMany({ where: { businessId, status: "SUCCESSFUL" } }),
      prisma.invoice.findMany({ where: { businessId, status: { in: ["ISSUED", "PARTIAL", "OVERDUE"] } } }),
      prisma.customer.count({ where: { businessId } }),
      prisma.quotation.findMany({ where: { businessId } }),
      prisma.appointment.count({ where: { businessId, status: { not: "CANCELLED" } } }),
    ]);

    const verifiedRevenue = payments.reduce((acc, p) => acc + p.amount, 0);
    const outstandingRevenue = invoices.reduce((acc, i) => acc + (i.totalAmount - i.amountPaid), 0);
    const quotationCount = quotations.length;
    const quotationTotalValue = quotations.reduce((acc, q) => acc + q.totalAmount, 0);
    const converted = quotations.filter((q) => ["ACCEPTED", "INVOICED"].includes(q.status)).length;
    const conversionRate = quotationCount > 0 ? Math.round((converted / quotationCount) * 100) : 0;

    const rawKey = business.integrationConfig?.geminiApiKey || process.env.GEMINI_API_KEY || "";
    const apiKey = decryptSecret(rawKey) || rawKey;

    const insightsResult = await generateBusinessInsights(
      {
        verifiedRevenue,
        outstandingRevenue,
        totalCustomers: customers,
        quotationCount,
        quotationTotalValue,
        conversionRate,
        appointmentCount: appointments,
      },
      apiKey
    );

    if (!insightsResult.success) {
      return NextResponse.json(
        {
          error: insightsResult.error,
          code: insightsResult.code || "AI_ERROR",
          needsConfig: insightsResult.code === "API_KEY_MISSING",
        },
        { status: insightsResult.code === "API_KEY_MISSING" ? 428 : 502 }
      );
    }

    return NextResponse.json({ insights: insightsResult.data, success: true });
  } catch (err: any) {
    console.error("AI Insights error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
