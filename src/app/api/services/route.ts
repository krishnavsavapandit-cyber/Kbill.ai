import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBusiness } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await requireBusiness(req);
    if (!auth.ok) return auth.response;
    const { businessId } = auth;

    const services = await prisma.service.findMany({
      where: { businessId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ services });
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
    const { name, description, durationMinutes = 30, bufferMinutes = 10, price = 0 } = body;

    if (!name || name.trim().length === 0) {
      return NextResponse.json({ error: "Service name is required." }, { status: 400 });
    }

    const service = await prisma.service.create({
      data: {
        businessId,
        name: name.trim(),
        description: description || null,
        durationMinutes: Number(durationMinutes) || 30,
        bufferMinutes: Number(bufferMinutes) || 10,
        price: Number(price) || 0,
        isActive: true,
      },
    });

    return NextResponse.json({ service }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
