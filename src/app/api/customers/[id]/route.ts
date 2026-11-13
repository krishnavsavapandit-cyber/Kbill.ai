import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBusiness } from "@/lib/auth";
import { validateGSTIN } from "@/lib/gst";
import { z } from "zod";

const UpdateCustomerSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  email: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  gstin: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBusiness(req);
    if (!auth.ok) return auth.response;
    const { businessId } = auth;

    const customer = await prisma.customer.findFirst({
      where: { id: params.id, businessId },
      include: {
        quotations: true,
        invoices: true,
        appointments: true,
        conversations: true,
      },
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    return NextResponse.json({ customer });
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
    const parsed = UpdateCustomerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.issues }, { status: 400 });
    }

    // Explicit field whitelist - never spread body, ignore any businessId in payload
    const updateData: Record<string, any> = {};
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name.trim();
    if (parsed.data.phone !== undefined) updateData.phone = parsed.data.phone.trim();
    if (parsed.data.email !== undefined) updateData.email = parsed.data.email ? parsed.data.email.trim() : null;
    if (parsed.data.company !== undefined) updateData.company = parsed.data.company ? parsed.data.company.trim() : null;
    if (parsed.data.gstin !== undefined) {
      if (parsed.data.gstin && parsed.data.gstin.trim() !== "") {
        const gstinCheck = validateGSTIN(parsed.data.gstin);
        if (!gstinCheck.valid) {
          return NextResponse.json(
            { error: "Invalid GSTIN", message: gstinCheck.error },
            { status: 400 }
          );
        }
        updateData.gstin = parsed.data.gstin.trim().toUpperCase();
        if (parsed.data.state === undefined && gstinCheck.stateName) {
          updateData.state = gstinCheck.stateName;
        }
      } else {
        updateData.gstin = null;
      }
    }
    if (parsed.data.state !== undefined) updateData.state = parsed.data.state ? parsed.data.state.trim() : null;
    if (parsed.data.address !== undefined) updateData.address = parsed.data.address ? parsed.data.address.trim() : null;
    if (parsed.data.city !== undefined) updateData.city = parsed.data.city ? parsed.data.city.trim() : null;
    if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes ? parsed.data.notes.trim() : null;

    // Defense-in-depth: updateMany strictly scoped by { id, businessId }
    const res = await prisma.customer.updateMany({
      where: { id: params.id, businessId },
      data: updateData,
    });

    if (res.count === 0) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const updated = await prisma.customer.findFirst({
      where: { id: params.id, businessId },
    });

    return NextResponse.json({ customer: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBusiness(req);
    if (!auth.ok) return auth.response;
    const { businessId } = auth;

    // Check if customer exists and belongs to this business
    const customer = await prisma.customer.findFirst({
      where: { id: params.id, businessId },
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    // Check for statutory financial dependencies (invoices must be retained for 6 years under GST law)
    const invoiceCount = await prisma.invoice.count({
      where: { customerId: params.id, businessId },
    });

    if (invoiceCount > 0) {
      // DPDP Erasure with Statutory Exemption: Anonymize all personal data
      await prisma.$transaction(async (tx) => {
        await tx.customer.updateMany({
          where: { id: params.id, businessId },
          data: {
            name: "Anonymized Customer",
            phone: `+91000000${params.id.slice(-4)}`,
            email: null,
            company: null,
            gstin: null,
            address: null,
            city: null,
            state: null,
            notes: "[Personal data anonymized under DPDP erasure request]",
          },
        });

        // Scrub communication content
        const convos = await tx.conversation.findMany({
          where: { customerId: params.id, businessId },
          select: { id: true },
        });
        const convoIds = convos.map((c) => c.id);
        if (convoIds.length > 0) {
          await tx.message.updateMany({
            where: { conversationId: { in: convoIds } },
            data: {
              body: "[Redacted under DPDP data erasure request]",
            },
          });
        }

        await tx.activityLog.create({
          data: {
            businessId,
            action: "CUSTOMER_ANONYMIZED_DPDP",
            entityType: "CUSTOMER",
            entityId: params.id,
            description: `Customer ${customer.name} personal data anonymized per DPDP Act erasure request (${invoiceCount} tax invoices retained)`,
          },
        });
      });

      return NextResponse.json({
        success: true,
        anonymized: true,
        message: "Customer personal data anonymized per DPDP Act (invoices retained for statutory tax compliance).",
      });
    }

    // If no invoices exist, delete customer record and clean up associations
    const res = await prisma.customer.deleteMany({
      where: { id: params.id, businessId },
    });

    await prisma.activityLog.create({
      data: {
        businessId,
        action: "CUSTOMER_DELETED_DPDP",
        entityType: "CUSTOMER",
        entityId: params.id,
        description: `Customer ${customer.name} completely erased per DPDP Act request`,
      },
    });

    return NextResponse.json({ success: true, deleted: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
