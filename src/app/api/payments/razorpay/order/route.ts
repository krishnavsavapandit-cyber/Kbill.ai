import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createRazorpayOrder, SUBSCRIPTION_PLANS, PlanKey } from "@/lib/razorpay";
import { requireBusiness } from "@/lib/auth";
import { decryptSecret } from "@/lib/encryption";

export async function POST(req: Request) {
  try {
    const auth = await requireBusiness(req);
    if (!auth.ok) return auth.response;
    const { businessId } = auth;

    const body = await req.json();
    const { type, invoiceId, planId } = body; // type: "INVOICE" | "SUBSCRIPTION"

    let amountInPaise = 0;
    let receipt = `rcpt_${Date.now()}`;
    let notes: Record<string, string> = { businessId };

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: { integrationConfig: true },
    });
    if (!business) return NextResponse.json({ error: "No business found" }, { status: 404 });

    let keyId = "";
    let keySecret = "";

    // 1. Validate Target Entity and Compute Amount STRICTLY Server-Side
    if (type === "INVOICE") {
      if (!invoiceId) {
        return NextResponse.json({ error: "invoiceId is required" }, { status: 400 });
      }

      const invoice = await prisma.invoice.findFirst({
        where: { id: invoiceId, businessId },
        include: { customer: true },
      });

      if (!invoice) {
        return NextResponse.json({ error: "Invoice not found for this business" }, { status: 404 });
      }

      const dueAmount = invoice.totalAmount - invoice.amountPaid;
      if (dueAmount <= 0 || invoice.status === "PAID") {
        return NextResponse.json(
          { error: "Invoice is already paid in full.", code: "INVOICE_ALREADY_PAID" },
          { status: 400 }
        );
      }

      // Security requirement: Calculate amount strictly server-side from DB invoice
      amountInPaise = Math.round(dueAmount * 100);
      receipt = `inv_${invoice.invoiceNumber.replace(/[^a-zA-Z0-9]/g, "")}`;
      notes.invoiceId = invoice.id;
      notes.customerName = invoice.customer.name;
      notes.paymentType = "INVOICE";

      // Invoice money destination: Merchant business's Razorpay credentials
      keyId = business.integrationConfig?.razorpayKeyId || process.env.RAZORPAY_KEY_ID || "";
      const rawSec = business.integrationConfig?.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET || "";
      keySecret = decryptSecret(rawSec) || rawSec;
    } else if (type === "SUBSCRIPTION") {
      const plan = SUBSCRIPTION_PLANS[planId as PlanKey];
      if (!plan) {
        return NextResponse.json(
          { error: "Invalid subscription plan selected." },
          { status: 400 }
        );
      }

      // Plan price strictly determined from server configuration
      amountInPaise = plan.priceInPaise;
      receipt = `sub_${plan.id}_${Date.now()}`;
      notes.planId = plan.id;
      notes.paymentType = "SUBSCRIPTION";

      // Platform subscription money destination: Platform's master Razorpay account
      keyId = process.env.RAZORPAY_KEY_ID || business.integrationConfig?.razorpayKeyId || "";
      keySecret = process.env.RAZORPAY_KEY_SECRET || business.integrationConfig?.razorpayKeySecret || "";
    } else {
      return NextResponse.json(
        { error: "Invalid payment type. Must be INVOICE or SUBSCRIPTION." },
        { status: 400 }
      );
    }

    // 2. Validate Razorpay credentials
    if (!keyId || !keySecret) {
      return NextResponse.json(
        {
          error: "Razorpay credentials are not configured. Please enter your Razorpay Key ID and Secret in Settings > Integrations.",
          code: "RAZORPAY_NOT_CONNECTED",
          needsConfig: true,
        },
        { status: 428 }
      );
    }

    // 3. Create server-side order with Razorpay
    const orderResult = await createRazorpayOrder({
      amountInPaise,
      currency: "INR",
      receipt,
      notes,
      config: { keyId, keySecret },
    });

    if (!orderResult.success) {
      return NextResponse.json(
        {
          error: `Razorpay Order Error: ${orderResult.error}`,
          code: orderResult.code,
        },
        { status: 502 }
      );
    }

    // 4. Bind Razorpay order to database payment and invoice
    await prisma.payment.create({
      data: {
        businessId,
        invoiceId: type === "INVOICE" ? invoiceId : null,
        amount: amountInPaise / 100,
        currency: "INR",
        status: "PENDING",
        razorpayOrderId: orderResult.orderId,
        receiptNumber: receipt,
        metadata: JSON.stringify(notes),
      },
    });

    return NextResponse.json({
      success: true,
      orderId: orderResult.orderId,
      amount: amountInPaise,
      currency: "INR",
      keyId,
    });
  } catch (err: any) {
    console.error("Razorpay order error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
