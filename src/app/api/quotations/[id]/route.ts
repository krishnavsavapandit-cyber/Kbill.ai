import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBusiness } from "@/lib/auth";
import { z } from "zod";

const UpdateQuotationSchema = z.object({
  status: z.enum(["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED", "INVOICED"]).optional(),
  notes: z.string().optional().nullable(),
  terms: z.string().optional().nullable(),
});

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

    return NextResponse.json({ quotation });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBusiness(req);
    if (!auth.ok) return auth.response;
    const { businessId } = auth;

    const body = await req.json();
    const parsed = UpdateQuotationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.issues }, { status: 400 });
    }

    const updateData: Record<string, any> = {};
    if (parsed.data.status) updateData.status = parsed.data.status;
    if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
    if (parsed.data.terms !== undefined) updateData.terms = parsed.data.terms;

    // Defense-in-depth: updateMany strictly scoped by { id, businessId }
    const res = await prisma.quotation.updateMany({
      where: { id: params.id, businessId },
      data: updateData,
    });

    if (res.count === 0) {
      return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
    }

    const updated = await prisma.quotation.findFirst({
      where: { id: params.id, businessId },
      include: { customer: true, items: true },
    });

    if (parsed.data.status && updated) {
      await prisma.activityLog.create({
        data: {
          businessId,
          action: "QUOTATION_STATUS_CHANGED",
          entityType: "QUOTATION",
          entityId: updated.id,
          description: `Quotation ${updated.quotationNumber} marked as ${parsed.data.status} (Customer: ${updated.customer.name}).`,
        },
      });
    }

    return NextResponse.json({ quotation: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBusiness(req);
    if (!auth.ok) return auth.response;
    const { businessId } = auth;

    // Defense-in-depth: deleteMany strictly scoped by { id, businessId }
    const res = await prisma.quotation.deleteMany({
      where: { id: params.id, businessId },
    });

    if (res.count === 0) {
      return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
