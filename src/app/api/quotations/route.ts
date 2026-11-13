import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBusiness } from "@/lib/auth";
import { calculateGst, validateHsnSac } from "@/lib/gst";
import { z } from "zod";

export const dynamic = "force-dynamic";

const CreateQuotationSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  items: z
    .array(
      z.object({
        description: z.string().min(1, "Description is required"),
        hsnSac: z.string().optional().nullable(),
        quantity: z.number().positive("Quantity must be positive"),
        unitPrice: z.number().nonnegative("Price must be non-negative"),
        serviceId: z.string().optional().nullable(),
      })
    )
    .min(1, "At least one line item is required"),
  taxRate: z.number().optional().default(18),
  discountAmount: z.number().optional().default(0),
  placeOfSupply: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  terms: z.string().optional().nullable(),
  validDays: z.number().optional().default(15),
});

export async function GET(req: Request) {
  try {
    const auth = await requireBusiness(req);
    if (!auth.ok) return auth.response;
    const { businessId } = auth;

    const quotations = await prisma.quotation.findMany({
      where: { businessId },
      include: {
        customer: true,
        items: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ quotations });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireBusiness(req);
    if (!auth.ok) return auth.response;
    const { businessId } = auth;

    const body = await req.json();
    const parsed = CreateQuotationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.issues }, { status: 400 });
    }

    const { customerId, items, taxRate, discountAmount, placeOfSupply, notes, terms, validDays } = parsed.data;

    // Body IDOR Protection: Verify customer belongs to this business
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, businessId },
    });
    if (!customer) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }

    // Retrieve business for place of supply / state comparison
    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    // Body IDOR Protection & HSN/SAC validation
    for (const item of items) {
      if (item.hsnSac) {
        const hsnCheck = validateHsnSac(item.hsnSac);
        if (!hsnCheck.valid) {
          return NextResponse.json({ error: hsnCheck.error }, { status: 400 });
        }
      }
      if (item.serviceId) {
        const srv = await prisma.service.findFirst({
          where: { id: item.serviceId, businessId },
        });
        if (!srv) {
          return NextResponse.json({ error: `Service ID ${item.serviceId} not found.` }, { status: 404 });
        }
      }
    }

    // Calculate real mathematical totals
    let subtotal = 0;
    const sanitizedItems = items.map((item) => {
      const qty = item.quantity;
      const price = item.unitPrice;
      const amount = Math.round(qty * price * 100) / 100;
      subtotal += amount;
      return {
        description: item.description.trim(),
        hsnSac: item.hsnSac ? item.hsnSac.trim() : null,
        quantity: qty,
        unitPrice: price,
        amount,
        serviceId: item.serviceId || null,
      };
    });

    const gstCalc = calculateGst({
      subtotal,
      taxRate: Number(taxRate),
      discountAmount: Number(discountAmount) || 0,
      businessState: business?.state,
      businessGstin: business?.gstin,
      customerState: customer.state,
      customerGstin: customer.gstin,
      placeOfSupply,
    });

    const count = await prisma.quotation.count({ where: { businessId } });
    const year = new Date().getFullYear();
    const quotationNumber = `QT-${year}-${String(count + 1).padStart(4, "0")}`;

    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + (Number(validDays) || 15));

    const quotation = await prisma.quotation.create({
      data: {
        businessId, // Always from session!
        customerId: customer.id,
        quotationNumber,
        status: "DRAFT",
        issueDate: new Date(),
        validUntil,
        subtotal: gstCalc.subtotal,
        taxRate: gstCalc.totalTaxRate,
        taxAmount: gstCalc.totalTaxAmount,
        discountAmount: gstCalc.discountAmount,
        totalAmount: gstCalc.totalAmount,
        placeOfSupply: gstCalc.placeOfSupply,
        isInterState: gstCalc.isInterState,
        cgstRate: gstCalc.cgstRate,
        cgstAmount: gstCalc.cgstAmount,
        sgstRate: gstCalc.sgstRate,
        sgstAmount: gstCalc.sgstAmount,
        igstRate: gstCalc.igstRate,
        igstAmount: gstCalc.igstAmount,
        notes: notes || null,
        terms: terms || "Payment valid for 15 days from issue date.",
        items: {
          create: sanitizedItems,
        },
      },
      include: {
        customer: true,
        items: true,
      },
    });

    await prisma.activityLog.create({
      data: {
        businessId,
        action: "QUOTATION_CREATED",
        entityType: "QUOTATION",
        entityId: quotation.id,
        description: `Created quotation ${quotationNumber} for ${quotation.customer.name} (₹${gstCalc.totalAmount.toLocaleString("en-IN")})`,
      },
    });

    return NextResponse.json({ quotation }, { status: 201 });
  } catch (err: any) {
    console.error("Create quotation error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
