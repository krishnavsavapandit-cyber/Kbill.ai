import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBusiness } from "@/lib/auth";
import { calculateGst } from "@/lib/gst";
import { generateNextInvoiceNumber } from "@/lib/invoice-sequence";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBusiness(req);
    if (!auth.ok) return auth.response;
    const { businessId } = auth;

    const quotation = await prisma.quotation.findFirst({
      where: { id: params.id, businessId },
      include: {
        customer: true,
        items: true,
        business: true,
      },
    });

    if (!quotation) {
      return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
    }

    const issueDate = new Date();
    const dueDate = new Date(issueDate);
    dueDate.setDate(dueDate.getDate() + 7);

    // Compute GST split based on place of supply and business/customer location
    const gstCalc = calculateGst({
      subtotal: quotation.subtotal,
      taxRate: quotation.taxRate,
      discountAmount: quotation.discountAmount,
      businessState: quotation.business.state,
      businessGstin: quotation.business.gstin,
      customerState: quotation.customer.state,
      customerGstin: quotation.customer.gstin,
      placeOfSupply: quotation.placeOfSupply,
    });

    const invoice = await prisma.$transaction(async (tx) => {
      // Concurrency-safe sequential invoice numbering per business and financial year
      const { invoiceNumber, financialYear, sequenceNumber } = await generateNextInvoiceNumber(
        tx,
        businessId,
        issueDate
      );

      const createdInvoice = await tx.invoice.create({
        data: {
          businessId,
          customerId: quotation.customerId,
          quotationId: quotation.id,
          invoiceNumber,
          financialYear,
          sequenceNumber,
          status: "ISSUED",
          issueDate,
          dueDate,
          subtotal: gstCalc.subtotal,
          taxAmount: gstCalc.totalTaxAmount,
          discountAmount: gstCalc.discountAmount,
          totalAmount: gstCalc.totalAmount,
          amountPaid: 0,
          placeOfSupply: gstCalc.placeOfSupply,
          isInterState: gstCalc.isInterState,
          cgstRate: gstCalc.cgstRate,
          cgstAmount: gstCalc.cgstAmount,
          sgstRate: gstCalc.sgstRate,
          sgstAmount: gstCalc.sgstAmount,
          igstRate: gstCalc.igstRate,
          igstAmount: gstCalc.igstAmount,
          notes: quotation.notes || `Converted from quotation ${quotation.quotationNumber}`,
          items: {
            create: quotation.items.map((it) => ({
              description: it.description,
              hsnSac: it.hsnSac,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              amount: it.amount,
              serviceId: it.serviceId,
            })),
          },
        },
        include: {
          customer: true,
          items: true,
          quotation: { include: { items: true } },
        },
      });

      await tx.quotation.updateMany({
        where: { id: quotation.id, businessId },
        data: {
          status: "INVOICED",
          invoiceId: createdInvoice.id,
        },
      });

      await tx.activityLog.create({
        data: {
          businessId,
          action: "INVOICE_GENERATED",
          entityType: "INVOICE",
          entityId: createdInvoice.id,
          description: `Converted quotation ${quotation.quotationNumber} into Invoice ${invoiceNumber} for ${quotation.customer.name} (₹${gstCalc.totalAmount.toLocaleString("en-IN")})`,
        },
      });

      return createdInvoice;
    });

    return NextResponse.json({ invoice, success: true });
  } catch (err: any) {
    console.error("Convert to invoice error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
