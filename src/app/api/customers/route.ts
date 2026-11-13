import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBusiness } from "@/lib/auth";
import { validateGSTIN } from "@/lib/gst";
import { z } from "zod";

export const dynamic = "force-dynamic";

const CreateCustomerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Phone is required"),
  email: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  gstin: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  // Explicitly ignore/disallow client-sent businessId
});

export async function GET(req: Request) {
  try {
    const auth = await requireBusiness(req);
    if (!auth.ok) return auth.response;
    const { businessId } = auth;

    const customers = await prisma.customer.findMany({
      where: { businessId },
      include: {
        _count: {
          select: {
            quotations: true,
            invoices: true,
            appointments: true,
            conversations: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ customers });
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
    const parsed = CreateCustomerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.issues }, { status: 400 });
    }

    let validatedGstin: string | null = null;
    let customerState: string | null = parsed.data.state ? parsed.data.state.trim() : null;

    if (parsed.data.gstin && parsed.data.gstin.trim() !== "") {
      const gstinCheck = validateGSTIN(parsed.data.gstin);
      if (!gstinCheck.valid) {
        return NextResponse.json(
          { error: "Invalid GSTIN", message: gstinCheck.error },
          { status: 400 }
        );
      }
      validatedGstin = parsed.data.gstin.trim().toUpperCase();
      if (!customerState && gstinCheck.stateName) {
        customerState = gstinCheck.stateName;
      }
    }

    // Explicit field whitelist: businessId is ALWAYS taken from session, never from body
    const customer = await prisma.customer.create({
      data: {
        businessId,
        name: parsed.data.name.trim(),
        phone: parsed.data.phone.trim(),
        email: parsed.data.email ? parsed.data.email.trim() : null,
        company: parsed.data.company ? parsed.data.company.trim() : null,
        gstin: validatedGstin,
        address: parsed.data.address ? parsed.data.address.trim() : null,
        city: parsed.data.city ? parsed.data.city.trim() : null,
        state: customerState,
        notes: parsed.data.notes ? parsed.data.notes.trim() : null,
      },
    });

    await prisma.activityLog.create({
      data: {
        businessId,
        action: "CUSTOMER_CREATED",
        entityType: "CUSTOMER",
        entityId: customer.id,
        description: `Added new customer: ${customer.name} (${customer.phone})`,
      },
    });

    return NextResponse.json({ customer }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
