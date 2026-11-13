import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBusiness } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await requireBusiness(req);
    if (!auth.ok) return auth.response;
    const { businessId, business } = auth;

    // 1. Verified Revenue (ONLY from real payments with SUCCESSFUL status for THIS business)
    const successfulPayments = await prisma.payment.findMany({
      where: {
        businessId,
        status: "SUCCESSFUL",
      },
      select: { amount: true },
    });
    const verifiedRevenue = successfulPayments.reduce((acc, curr) => acc + curr.amount, 0);

    // 2. Outstanding Invoices (Real unpaid invoice balance for THIS business)
    const unpaidInvoices = await prisma.invoice.findMany({
      where: {
        businessId,
        status: { in: ["ISSUED", "PARTIAL", "OVERDUE"] },
      },
      select: { totalAmount: true, amountPaid: true },
    });
    const outstandingRevenue = unpaidInvoices.reduce(
      (acc, curr) => acc + (curr.totalAmount - curr.amountPaid),
      0
    );
    const outstandingInvoiceCount = unpaidInvoices.length;

    // 3. Total Customers for THIS business
    const totalCustomers = await prisma.customer.count({
      where: { businessId },
    });

    // 4. Quotations Metrics for THIS business
    const allQuotations = await prisma.quotation.findMany({
      where: { businessId },
      select: { status: true, totalAmount: true },
    });
    const quotationCount = allQuotations.length;
    const quotationTotalValue = allQuotations.reduce((acc, curr) => acc + curr.totalAmount, 0);
    const convertedQuotes = allQuotations.filter((q) =>
      ["ACCEPTED", "INVOICED"].includes(q.status)
    ).length;
    const conversionRate =
      quotationCount > 0 ? Math.round((convertedQuotes / quotationCount) * 100) : 0;

    // 5. Upcoming Appointments for THIS business
    const upcomingAppointments = await prisma.appointment.findMany({
      where: {
        businessId,
        startTime: { gte: new Date() },
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
      },
      include: {
        customer: { select: { name: true, phone: true } },
        service: { select: { name: true, durationMinutes: true } },
      },
      orderBy: { startTime: "asc" },
      take: 5,
    });

    // 6. Recent Customer Messages for THIS business
    const recentMessages = await prisma.message.findMany({
      where: { businessId },
      include: {
        conversation: {
          include: { customer: { select: { name: true, phone: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    // 7. Activity Feed for THIS business
    const activityLogs = await prisma.activityLog.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      take: 8,
    });

    // 8. Subscription for THIS business
    const subscription = await prisma.subscription.findFirst({
      where: { businessId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      business: {
        id: business.id,
        name: business.name,
        currency: business.currency,
        slug: business.slug,
      },
      metrics: {
        verifiedRevenue,
        outstandingRevenue,
        outstandingInvoiceCount,
        totalCustomers,
        quotationCount,
        quotationTotalValue,
        conversionRate,
        upcomingAppointmentCount: upcomingAppointments.length,
      },
      upcomingAppointments,
      recentMessages,
      activityLogs,
      subscription: subscription || { plan: "STARTER", status: "ACTIVE" },
    });
  } catch (error: any) {
    console.error("Dashboard metrics error:", error);
    return NextResponse.json(
      { error: "Failed to load dashboard metrics", details: error.message },
      { status: 500 }
    );
  }
}
