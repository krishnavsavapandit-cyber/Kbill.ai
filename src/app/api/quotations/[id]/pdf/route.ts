import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateDocumentPdf } from "@/lib/pdf";
import { requireBusiness } from "@/lib/auth";

export async function GET(req: Request, { params }: { params: { id: string } }) {
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

    const doc = generateDocumentPdf({
      type: "QUOTATION",
      docNumber: quotation.quotationNumber,
      issueDate: new Date(quotation.issueDate).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      dueDateOrValidUntil: new Date(quotation.validUntil).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      business: {
        name: quotation.business.name,
        phone: quotation.business.phone,
        email: quotation.business.email,
        address: quotation.business.address,
        city: quotation.business.city,
        gstin: quotation.business.gstin,
      },
      customer: {
        name: quotation.customer.name,
        company: quotation.customer.company,
        phone: quotation.customer.phone,
        email: quotation.customer.email,
        address: quotation.customer.address,
        gstin: quotation.customer.gstin,
      },
      placeOfSupply: quotation.placeOfSupply,
      isInterState: quotation.isInterState,
      cgstRate: quotation.cgstRate,
      cgstAmount: quotation.cgstAmount,
      sgstRate: quotation.sgstRate,
      sgstAmount: quotation.sgstAmount,
      igstRate: quotation.igstRate,
      igstAmount: quotation.igstAmount,
      items: quotation.items.map((it) => ({
        description: it.description,
        hsnSac: it.hsnSac,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        amount: it.amount,
      })),
      subtotal: quotation.subtotal,
      taxAmount: quotation.taxAmount,
      taxRate: quotation.taxRate,
      discountAmount: quotation.discountAmount,
      totalAmount: quotation.totalAmount,
      notes: quotation.notes,
      terms: quotation.terms,
    });

    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${quotation.quotationNumber}.pdf"`,
      },
    });
  } catch (err: any) {
    console.error("PDF generation error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
