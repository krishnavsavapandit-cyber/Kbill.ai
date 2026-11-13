import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyRazorpayWebhookSignature } from "@/lib/razorpay";
import { decryptSecret } from "@/lib/encryption";

export async function POST(req: Request) {
  try {
    // 1. Read the RAW request body as text (MANDATORY for cryptographic HMAC verification)
    const rawBody = await req.text();
    const signatureHeader = req.headers.get("x-razorpay-signature");

    if (!signatureHeader) {
      return NextResponse.json(
        { error: "Missing x-razorpay-signature header" },
        { status: 400 }
      );
    }

    // 2. Parse payload JSON safely
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON webhook payload" },
        { status: 400 }
      );
    }

    const event = payload?.event;
    const paymentEntity = payload?.payload?.payment?.entity;
    const orderEntity = payload?.payload?.order?.entity;
    const razorpayOrderId = paymentEntity?.order_id || orderEntity?.id;
    const razorpayPaymentId = paymentEntity?.id;

    // 3. Resolve corresponding payment record to determine tenant & webhook secret
    let paymentRecord = null;
    if (razorpayOrderId) {
      paymentRecord = await prisma.payment.findFirst({
        where: { razorpayOrderId },
        include: {
          business: {
            include: { integrationConfig: true },
          },
          invoice: true,
        },
      });
    }

    // Secret resolution: Check merchant's configured webhook secret, fallback to platform secret
    const rawSecret =
      paymentRecord?.business?.integrationConfig?.razorpayWebhookSecret ||
      process.env.RAZORPAY_WEBHOOK_SECRET ||
      process.env.RAZORPAY_KEY_SECRET ||
      paymentRecord?.business?.integrationConfig?.razorpayKeySecret ||
      "";
    const webhookSecret = decryptSecret(rawSecret) || rawSecret;

    if (!webhookSecret) {
      return NextResponse.json(
        { error: "Razorpay Webhook secret not configured on server" },
        { status: 500 }
      );
    }

    // 4. Verify Cryptographic Signature on RAW Body with Timing-Safe Comparison
    const isValid = verifyRazorpayWebhookSignature(rawBody, signatureHeader, webhookSecret);
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid Razorpay webhook signature." },
        { status: 401 }
      );
    }

    // 5. Handle Events with Idempotency
    if (event === "payment.captured" || event === "order.paid") {
      if (!razorpayPaymentId) {
        return NextResponse.json(
          { error: "Missing payment entity in payload" },
          { status: 400 }
        );
      }

      // Idempotency Check A: If payment record is ALREADY successful, do not re-process
      if (
        paymentRecord &&
        paymentRecord.status === "SUCCESSFUL" &&
        paymentRecord.razorpayPaymentId === razorpayPaymentId
      ) {
        return NextResponse.json({
          status: "ok",
          received: true,
          idempotent: true,
          message: "Payment order has already been processed.",
        });
      }

      // Idempotency Check B: Has this payment ID already been marked successful anywhere?
      const alreadyProcessed = await prisma.payment.findFirst({
        where: { razorpayPaymentId, status: "SUCCESSFUL" },
      });
      if (alreadyProcessed) {
        return NextResponse.json({
          status: "ok",
          received: true,
          idempotent: true,
          message: "Payment ID already recorded.",
        });
      }

      // Process payment atomically
      await prisma.$transaction(async (tx) => {
        if (paymentRecord) {
          await tx.payment.updateMany({
            where: { id: paymentRecord.id },
            data: {
              status: "SUCCESSFUL",
              razorpayPaymentId,
              verifiedAt: new Date(),
            },
          });

          if (paymentRecord.invoiceId) {
            await tx.invoice.updateMany({
              where: { id: paymentRecord.invoiceId },
              data: {
                status: "PAID",
                amountPaid: paymentRecord.amount,
              },
            });

            await tx.activityLog.create({
              data: {
                businessId: paymentRecord.businessId,
                action: "INVOICE_PAID",
                entityType: "INVOICE",
                entityId: paymentRecord.invoiceId,
                description: `Invoice paid in full (₹${paymentRecord.amount.toLocaleString("en-IN")}) via Razorpay Webhook (${razorpayPaymentId}).`,
              },
            });
          }

          // If plan purchase / subscription
          if (paymentRecord.subscriptionId || paymentRecord.metadata) {
            const meta = paymentRecord.metadata ? JSON.parse(paymentRecord.metadata) : null;
            const planId = meta?.planId || "STARTER";
            const biz = await tx.business.findUnique({
              where: { id: paymentRecord.businessId },
              select: { planExpiresAt: true },
            });
            const now = new Date();
            const currentExpiry =
              biz?.planExpiresAt && biz.planExpiresAt.getTime() > now.getTime()
                ? new Date(biz.planExpiresAt)
                : now;
            const newExpiry = new Date(currentExpiry.getTime() + 30 * 24 * 60 * 60 * 1000);

            await tx.business.update({
              where: { id: paymentRecord.businessId },
              data: {
                planId: planId.toUpperCase(),
                planExpiresAt: newExpiry,
              },
            });
          }
        }
      });

      return NextResponse.json({
        status: "ok",
        received: true,
        processed: true,
        paymentId: razorpayPaymentId,
      });
    }

    if (event === "payment.failed") {
      if (paymentRecord) {
        if (paymentRecord.status === "FAILED") {
          return NextResponse.json({
            status: "ok",
            received: true,
            idempotent: true,
            message: "Failure status already recorded.",
          });
        }

        await prisma.payment.updateMany({
          where: { id: paymentRecord.id },
          data: {
            status: "FAILED",
            razorpayPaymentId: razorpayPaymentId || null,
          },
        });
      }

      return NextResponse.json({
        status: "ok",
        received: true,
        processed: true,
        statusRecorded: "FAILED",
      });
    }

    // Default response for unhandled events
    return NextResponse.json({
      status: "ok",
      received: true,
      ignored: true,
      event,
    });
  } catch (err: any) {
    console.error("Razorpay webhook error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
