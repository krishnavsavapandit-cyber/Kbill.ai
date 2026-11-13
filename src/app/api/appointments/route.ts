import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBusiness, getSession } from "@/lib/auth";
import { requireFeature } from "@/lib/plans";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await requireBusiness(req);
    if (!auth.ok) return auth.response;
    const { businessId } = auth;

    const appointments = await prisma.appointment.findMany({
      where: { businessId },
      include: {
        customer: true,
        service: true,
      },
      orderBy: { startTime: "asc" },
    });

    return NextResponse.json({ appointments });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      customerId,
      customerName,
      customerPhone,
      customerEmail,
      serviceId,
      startTime,
      customerNotes,
      staffId,
      scopeByService,
      businessSlug,
    } = body;

    if (!serviceId || !startTime) {
      return NextResponse.json({ error: "Service and start time are required." }, { status: 400 });
    }

    // Determine target business (either authenticated user or public booking page with slug)
    const session = await getSession(req);
    let targetBusinessId: string | null = session?.businessId || null;

    if (!targetBusinessId) {
      if (!businessSlug) {
        return NextResponse.json(
          { error: "businessSlug is required for public booking." },
          { status: 400 }
        );
      }
      const b = await prisma.business.findUnique({ where: { slug: businessSlug } });
      if (!b) {
        return NextResponse.json({ error: "Business not found." }, { status: 404 });
      }
      targetBusinessId = b.id;
    }

    const business = await prisma.business.findUnique({ where: { id: targetBusinessId } });
    if (!business) {
      return NextResponse.json({ error: "Business not found." }, { status: 404 });
    }

    // 1. Multi-Tenant Entity Ownership Checks (Reject foreign service or customer immediately)
    const service = await prisma.service.findFirst({
      where: { id: serviceId, businessId: targetBusinessId },
    });
    if (!service) {
      return NextResponse.json({ error: "Service not found." }, { status: 404 });
    }

    let resolvedCustomerId = customerId;
    if (resolvedCustomerId) {
      // Body IDOR Protection: verify customer belongs to this business
      const existing = await prisma.customer.findFirst({
        where: { id: resolvedCustomerId, businessId: targetBusinessId },
      });
      if (!existing) {
        return NextResponse.json({ error: "Customer not found." }, { status: 404 });
      }
    }

    const timeZone = business.timezone || "Asia/Kolkata";
    const startDate = new Date(startTime);
    if (isNaN(startDate.getTime())) {
      return NextResponse.json({ error: "Invalid start time format." }, { status: 400 });
    }

    // 2. Timezone Check: Verify Day of Week in Business Timezone
    const dayName = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(startDate);
    const workingDays = business.workingDays.split(",").map((d) => d.trim());
    if (!workingDays.includes(dayName)) {
      return NextResponse.json(
        {
          error: `Business is closed on ${dayName}s. Operating days: ${business.workingDays}`,
          code: "BUSINESS_CLOSED",
        },
        { status: 400 }
      );
    }

    // 3. Timezone Check: Verify Operating Hours in Business Timezone
    const timeInTz = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(startDate); // e.g. "17:30"

    const duration = service.durationMinutes || 30;
    const endDate = new Date(startDate.getTime() + duration * 60 * 1000);
    const endTimeInTz = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(endDate); // e.g. "18:00"

    if (timeInTz < business.workingHoursStart || endTimeInTz > business.workingHoursEnd) {
      return NextResponse.json(
        {
          error: `Selected slot (${timeInTz} - ${endTimeInTz} ${timeZone}) is outside operating hours (${business.workingHoursStart} - ${business.workingHoursEnd}).`,
          code: "OUTSIDE_WORKING_HOURS",
        },
        { status: 400 }
      );
    }

    // 4. Plan Gating: Check appointment creation limits
    const planCheck = await requireFeature(targetBusinessId!, "create_appointment");
    if (!planCheck.ok) return planCheck.response;

    // 5. Scoped Overlap Filter (per-staff, per-service, or business-wide)
    const conflictFilter: any = {
      businessId: targetBusinessId!,
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
      AND: [
        { startTime: { lt: endDate } },
        { endTime: { gt: startDate } },
      ],
    };

    if (staffId) {
      conflictFilter.staffId = staffId;
    } else if (scopeByService) {
      conflictFilter.serviceId = service.id;
    }

    // Fast pre-check to eliminate unnecessary write contention
    const preCheckConflict = await prisma.appointment.findFirst({
      where: conflictFilter,
    });

    if (preCheckConflict) {
      return NextResponse.json(
        {
          error: "Selected time slot is already booked. Please choose another time.",
          code: "SLOT_CONFLICT",
        },
        { status: 409 }
      );
    }

    // Resolve customer if name and phone provided (public or new customer)
    if (!resolvedCustomerId) {
      if (!customerName || !customerPhone) {
        return NextResponse.json(
          { error: "Customer name and phone number are required." },
          { status: 400 }
        );
      }

      const existingCust = await prisma.customer.findFirst({
        where: {
          businessId: targetBusinessId,
          phone: customerPhone.trim(),
        },
      });

      if (existingCust) {
        resolvedCustomerId = existingCust.id;
      } else {
        const createdCust = await prisma.customer.create({
          data: {
            businessId: targetBusinessId,
            name: customerName.trim(),
            phone: customerPhone.trim(),
            email: customerEmail ? customerEmail.trim() : null,
          },
        });
        resolvedCustomerId = createdCust.id;
      }
    }

    // 4. Database-Level Double-Booking Prevention:
    // Enforced via:
    // A) Database partial unique index: unique_active_appointment_slot on (businessId, startTime) WHERE status NOT IN ('CANCELLED', 'NO_SHOW')
    // B) Serializable transaction with atomic overlap check
    try {
      const appointment = await prisma.$transaction(
        async (tx) => {
          // Serialized atomic interval overlap check inside transaction
          const conflict = await tx.appointment.findFirst({
            where: conflictFilter,
          });

          if (conflict) {
            const err: any = new Error("SLOT_CONFLICT");
            err.code = "SLOT_CONFLICT";
            throw err;
          }

          return tx.appointment.create({
            data: {
              businessId: targetBusinessId!,
              customerId: resolvedCustomerId,
              serviceId: service.id,
              staffId: staffId ? String(staffId).trim() : null,
              startTime: startDate, // Stored in UTC
              endTime: endDate,     // Stored in UTC
              status: "CONFIRMED",
              customerNotes: customerNotes ? String(customerNotes).trim() : null,
            },
            include: {
              customer: true,
              service: true,
            },
          });
        },
        {
          timeout: 10000,
        }
      );

      await prisma.activityLog.create({
        data: {
          businessId: targetBusinessId,
          action: "APPOINTMENT_BOOKED",
          entityType: "APPOINTMENT",
          entityId: appointment.id,
          description: `New appointment booked: ${service.name} with ${appointment.customer.name} for ${startDate.toISOString()}.`,
        },
      });

      return NextResponse.json({ appointment, success: true }, { status: 201 });
    } catch (txErr: any) {
      // 1. Direct collision or DB unique index violation
      if (
        txErr.code === "SLOT_CONFLICT" ||
        txErr.code === "P2002" ||
        txErr.message?.includes("UNIQUE constraint failed") ||
        txErr.message?.includes("SLOT_CONFLICT")
      ) {
        return NextResponse.json(
          {
            error: "Selected time slot is already booked. Please choose another time.",
            code: "SLOT_CONFLICT",
          },
          { status: 409 }
        );
      }

      // 2. Lock contention or timeout: verify whether another concurrent writer claimed the slot
      const isNowBooked = await prisma.appointment.findFirst({
        where: {
          businessId: targetBusinessId,
          status: { notIn: ["CANCELLED", "NO_SHOW"] },
          AND: [
            { startTime: { lt: endDate } },
            { endTime: { gt: startDate } },
          ],
        },
      });

      if (isNowBooked) {
        return NextResponse.json(
          {
            error: "Selected time slot is already booked. Please choose another time.",
            code: "SLOT_CONFLICT",
          },
          { status: 409 }
        );
      }

      console.error("Booking transaction error:", txErr);
      return NextResponse.json({ error: txErr.message }, { status: 500 });
    }
  } catch (err: any) {
    console.error("Create appointment error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
