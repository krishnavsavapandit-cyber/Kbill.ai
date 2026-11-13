import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBusiness } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBusiness(req);
    if (!auth.ok) return auth.response;
    const { businessId } = auth;

    const appointment = await prisma.appointment.findFirst({
      where: { id: params.id, businessId },
      include: { customer: true, service: true },
    });

    if (!appointment) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }

    return NextResponse.json({ appointment });
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
    const { status, staffNotes } = body;

    const updateData: Record<string, any> = {};
    if (status !== undefined) updateData.status = status;
    if (staffNotes !== undefined) updateData.staffNotes = staffNotes;

    const updateRes = await prisma.appointment.updateMany({
      where: { id: params.id, businessId },
      data: updateData,
    });

    if (updateRes.count === 0) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }

    const updated = await prisma.appointment.findFirst({
      where: { id: params.id, businessId },
      include: { customer: true, service: true },
    });

    if (status && updated) {
      await prisma.activityLog.create({
        data: {
          businessId,
          action: "APPOINTMENT_STATUS_CHANGED",
          entityType: "APPOINTMENT",
          entityId: updated.id,
          description: `Appointment with ${updated.customer.name} status changed to ${status}.`,
        },
      });
    }

    return NextResponse.json({ appointment: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBusiness(req);
    if (!auth.ok) return auth.response;
    const { businessId } = auth;

    const delRes = await prisma.appointment.deleteMany({
      where: { id: params.id, businessId },
    });

    if (delRes.count === 0) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
