import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateDocumentPdf } from "@/lib/pdf";
import { requireBusiness } from "@/lib/auth";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBusiness(req);
    if (!auth.ok) return auth.response;
    const { businessId } = auth;

    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, businessId },
      include: {
        customer: true,
        business: true,
        items: true,
        quotation: { include: { items: true } },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    let items: Array<{ description: string; hsnSac?: string | null; quantity: number; unitPrice: number; amount: number }> = [];

    if (invoice.items && invoice.items.length > 0) {
      items = invoice.items.map((it) => ({
        description: it.description,
        hsnSac: it.hsnSac,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        amount: it.amount,
      }));
    } else if (invoice.quotation?.items && invoice.quotation.items.length > 0) {
      items = invoice.quotation.items.map((it) => ({
        description: it.description,
        hsnSac: it.hsnSac,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        amount: it.amount,
      }));
    } else {
      items = [
        {
          description: "Services Rendered per Invoice Terms",
          hsnSac: "998314",
          quantity: 1,
          unitPrice: invoice.subtotal,
          amount: invoice.subtotal,
        },
      ];
    }

    const doc = generateDocumentPdf({
      type: "INVOICE",
      docNumber: invoice.invoiceNumber,
      issueDate: new Date(invoice.issueDate).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      dueDateOrValidUntil: new Date(invoice.dueDate).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      business: {
        name: invoice.business.name,
        phone: invoice.business.phone,
        email: invoice.business.email,
        address: invoice.business.address,
        city: invoice.business.city,
        gstin: invoice.business.gstin,
      },
      customer: {
        name: invoice.customer.name,
        company: invoice.customer.company,
        phone: invoice.customer.phone,
        email: invoice.customer.email,
        address: invoice.customer.address,
        gstin: invoice.customer.gstin,
      },
      placeOfSupply: invoice.placeOfSupply,
      isInterState: invoice.isInterState,
      cgstRate: invoice.cgstRate,
      cgstAmount: invoice.cgstAmount,
      sgstRate: invoice.sgstRate,
      sgstAmount: invoice.sgstAmount,
      igstRate: invoice.igstRate,
      igstAmount: invoice.igstAmount,
      items,
      subtotal: invoice.subtotal,
      taxAmount: invoice.taxAmount,
      taxRate: invoice.isInterState ? invoice.igstRate : (invoice.cgstRate + invoice.sgstRate) || 18,
      discountAmount: invoice.discountAmount,
      totalAmount: invoice.totalAmount,
      notes: invoice.notes,
      terms: "Payment terms: Net 7 days. Late payments may incur standard statutory interest.",
    });

    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoice.invoiceNumber.replace(/\//g, "-")}.pdf"`,
      },
    });
  } catch (err: any) {
    console.error("Invoice PDF generation error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
