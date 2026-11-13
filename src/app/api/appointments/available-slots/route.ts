import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAvailableTimeSlots } from "@/lib/booking";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const serviceId = searchParams.get("serviceId");
    const dateStr = searchParams.get("date"); // YYYY-MM-DD
    const businessSlug = searchParams.get("businessSlug");

    if (!serviceId || !dateStr) {
      return NextResponse.json(
        { error: "serviceId and date are required" },
        { status: 400 }
      );
    }

    if (!businessSlug) {
      return NextResponse.json(
        { error: "businessSlug is required" },
        { status: 400 }
      );
    }

    const business = await prisma.business.findUnique({
      where: { slug: businessSlug },
    });

    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const service = await prisma.service.findFirst({
      where: { id: serviceId, businessId: business.id },
    });

    if (!service) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }

    const result = await getAvailableTimeSlots({
      businessId: business.id,
      serviceId: service.id,
      dateStr,
    });

    // Explicitly guarantee no customer or sensitive data is returned
    return NextResponse.json({
      slots: result.slots.map((s) => ({
        startTime: s.startTime,
        endTime: s.endTime,
        timeLabel: s.timeLabel,
        available: s.available,
      })),
      businessOpen: result.businessOpen,
      reason: result.reason,
    });
  } catch (err: any) {
    console.error("Available slots error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
