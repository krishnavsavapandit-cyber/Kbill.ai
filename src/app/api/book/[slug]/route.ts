import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  try {
    const business = await prisma.business.findUnique({
      where: { slug: params.slug },
      include: {
        services: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            description: true,
            durationMinutes: true,
            bufferMinutes: true,
            price: true,
            currency: true,
          },
          orderBy: { name: "asc" },
        },
      },
    });

    if (!business) {
      return NextResponse.json({ error: "Business not found." }, { status: 404 });
    }

    return NextResponse.json({
      business: {
        id: business.id,
        name: business.name,
        slug: business.slug,
        phone: business.phone,
        email: business.email,
        address: business.address,
        city: business.city,
        currency: business.currency,
        brandColor: business.brandColor,
        workingHoursStart: business.workingHoursStart,
        workingHoursEnd: business.workingHoursEnd,
        workingDays: business.workingDays,
        timezone: business.timezone || "Asia/Kolkata",
      },
      services: business.services,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
