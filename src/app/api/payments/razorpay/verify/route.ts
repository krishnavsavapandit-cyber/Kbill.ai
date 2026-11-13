import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyRazorpayPaymentSignature } from "@/lib/razorpay";
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

    const body = await req.json();
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, invoiceId, planId } = body;

    // 1. Parameter Validation
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json(
        { error: "razorpay_order_id, razorpay_payment_id, and razorpay_signature are required." },
        { status: 400 }
      );
    }

    // 2. Tenant Isolation Check: Order MUST belong to THIS business
    const existingPayment = await prisma.payment.findFirst({
      where: { razorpayOrderId: razorpay_order_id, businessId },
    });
    if (!existingPayment) {
      return NextResponse.json(
        { error: "Payment order not found for this business", code: "ORDER_NOT_FOUND" },
        { status: 404 }
      );
    }

    // 3. Order-to-Invoice Binding Check
    let boundInvoice: any = null;
    if (existingPayment.invoiceId) {
      // If invoiceId was passed by client, it MUST match the order's bound invoice
      if (invoiceId && invoiceId !== existingPayment.invoiceId) {
        return NextResponse.json(
          {
            error: "Order is bound to a different invoice. Verification rejected.",
            code: "INVOICE_MISMATCH",
          },
          { status: 400 }
        );
      }

      boundInvoice = await prisma.invoice.findFirst({
        where: { id: existingPayment.invoiceId, businessId },
      });
      if (!boundInvoice) {
        return NextResponse.json(
          { error: "Bound invoice not found for this business", code: "INVOICE_NOT_FOUND" },
          { status: 404 }
        );
      }
    } else if (invoiceId) {
      // Order was created as subscription or non-invoice, but client sent invoiceId
      return NextResponse.json(
        { error: "This payment order was not created for an invoice.", code: "ORDER_TYPE_MISMATCH" },
        { status: 400 }
      );
    }

    // 4. Replay Prevention Checks
    // Check A: Has this payment order already been successfully processed?
    if (existingPayment.status === "SUCCESSFUL") {
      return NextResponse.json(
        {
          error: "Payment order has already been verified and processed.",
          code: "PAYMENT_ALREADY_PROCESSED",
        },
        { status: 409 }
      );
    }

    // Check B: Has this Razorpay payment ID already been processed in any payment?
    const duplicatePayment = await prisma.payment.findFirst({
      where: { razorpayPaymentId: razorpay_payment_id, status: "SUCCESSFUL" },
    });
    if (duplicatePayment) {
      return NextResponse.json(
        {
          error: "This Razorpay payment ID has already been processed.",
          code: "PAYMENT_REPLAY_DETECTED",
        },
        { status: 409 }
      );
    }

    // 5. Secret Key Resolution (Account Routing)
    const isInvoicePayment = Boolean(existingPayment.invoiceId);
    const rawSecret = isInvoicePayment
      ? business.integrationConfig?.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET || ""
      : process.env.RAZORPAY_KEY_SECRET || business.integrationConfig?.razorpayKeySecret || "";
    const keySecret = decryptSecret(rawSecret) || rawSecret;

    if (!keySecret) {
      return NextResponse.json(
        { error: "Razorpay Secret Key missing on server." },
        { status: 500 }
      );
    }

    // 6. Cryptographic Signature Verification (HMAC-SHA256 with timing-safe comparison)
    const isValid = verifyRazorpayPaymentSignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
      keySecret,
    });

    if (!isValid) {
      await prisma.payment.updateMany({
        where: { razorpayOrderId: razorpay_order_id, businessId },
        data: { status: "FAILED" },
      });

      return NextResponse.json(
        {
          verified: false,
          error: "Invalid Razorpay cryptographic payment signature. Payment could not be verified.",
          code: "INVALID_SIGNATURE",
        },
        { status: 400 }
      );
    }

    // 7. Atomic Transaction: Mark Payment SUCCESSFUL and Settle Target Invoice / Subscription
    const effectivePlanId = planId || (existingPayment.metadata ? JSON.parse(existingPayment.metadata)?.planId : null);

    const updatedPayment = await prisma.$transaction(async (tx) => {
      await tx.payment.updateMany({
        where: { razorpayOrderId: razorpay_order_id, businessId },
        data: {
          status: "SUCCESSFUL",
          razorpayPaymentId: razorpay_payment_id,
          razorpaySignature: razorpay_signature,
          verifiedAt: new Date(),
        },
      });

      // Settle invoice if bound
      if (boundInvoice) {
        await tx.invoice.updateMany({
          where: { id: boundInvoice.id, businessId },
          data: {
            status: "PAID",
            amountPaid: boundInvoice.totalAmount,
          },
        });

        await tx.activityLog.create({
          data: {
            businessId,
            action: "INVOICE_PAID",
            entityType: "INVOICE",
            entityId: boundInvoice.id,
            description: `Invoice ${boundInvoice.invoiceNumber} paid in full (₹${boundInvoice.totalAmount.toLocaleString("en-IN")}) via Razorpay (${razorpay_payment_id}).`,
          },
        });
      }

      // Upgrade subscription if plan purchase
      if (effectivePlanId) {
        const biz = await tx.business.findUnique({
          where: { id: businessId },
          select: { planExpiresAt: true },
        });

        const now = new Date();
        const currentExpiry =
          biz?.planExpiresAt && biz.planExpiresAt.getTime() > now.getTime()
            ? new Date(biz.planExpiresAt)
            : now;
        const periodEnd = new Date(currentExpiry.getTime() + 30 * 24 * 60 * 60 * 1000);

        await tx.business.update({
          where: { id: businessId },
          data: {
            planId: effectivePlanId.toUpperCase(),
            planExpiresAt: periodEnd,
          },
        });

        const sub = await tx.subscription.findFirst({ where: { businessId } });
        if (sub) {
          await tx.subscription.updateMany({
            where: { id: sub.id, businessId },
            data: {
              plan: effectivePlanId,
              status: "ACTIVE",
              currentPeriodStart: new Date(),
              currentPeriodEnd: periodEnd,
            },
          });
        } else {
          await tx.subscription.create({
            data: {
              businessId,
              plan: effectivePlanId,
              status: "ACTIVE",
              currentPeriodStart: new Date(),
              currentPeriodEnd: periodEnd,
            },
          });
        }

        await tx.activityLog.create({
          data: {
            businessId,
            action: "SUBSCRIPTION_UPGRADED",
            entityType: "SUBSCRIPTION",
            entityId: effectivePlanId,
            description: `30-Day plan upgraded to ${effectivePlanId} via verified Razorpay payment (${razorpay_payment_id}).`,
          },
        });
      }

      return tx.payment.findFirst({
        where: { razorpayOrderId: razorpay_order_id, businessId },
      });
    });

    return NextResponse.json({
      verified: true,
      paymentId: razorpay_payment_id,
      payment: updatedPayment,
      planExtended: Boolean(effectivePlanId),
    });
  } catch (err: any) {
    console.error("Payment verify error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
