import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBusiness } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBusiness(req);
    if (!auth.ok) return auth.response;
    const { businessId } = auth;

    const service = await prisma.service.findFirst({
      where: { id: params.id, businessId },
    });

    if (!service) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }

    return NextResponse.json({ service });
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

    // Whitelist allowed fields only; client cannot override businessId
    const updateData: Record<string, any> = {};
    if (body.name !== undefined) updateData.name = String(body.name).trim();
    if (body.description !== undefined) updateData.description = body.description ? String(body.description).trim() : null;
    if (body.durationMinutes !== undefined) updateData.durationMinutes = Number(body.durationMinutes);
    if (body.bufferMinutes !== undefined) updateData.bufferMinutes = Number(body.bufferMinutes);
    if (body.price !== undefined) updateData.price = Number(body.price);
    if (body.isActive !== undefined) updateData.isActive = Boolean(body.isActive);

    const updateRes = await prisma.service.updateMany({
      where: { id: params.id, businessId },
      data: updateData,
    });

    if (updateRes.count === 0) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }

    const updated = await prisma.service.findFirst({
      where: { id: params.id, businessId },
    });

    return NextResponse.json({ service: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBusiness(req);
    if (!auth.ok) return auth.response;
    const { businessId } = auth;

    const delRes = await prisma.service.deleteMany({
      where: { id: params.id, businessId },
    });

    if (delRes.count === 0) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
