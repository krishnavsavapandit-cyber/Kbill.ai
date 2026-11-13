import { prisma } from "./prisma";
import { addMinutes } from "date-fns";

export interface TimeSlot {
  startTime: string; // ISO string in UTC
  endTime: string;   // ISO string in UTC
  timeLabel: string; // e.g. "05:30 PM" rendered in business timezone
  available: boolean;
}

/**
 * Parses a date string (YYYY-MM-DD) and time string (HH:mm) into a UTC Date
 * based on the specified IANA timezone (default Asia/Kolkata).
 */
export function parseInTimezone(dateStr: string, timeStr: string, timeZone = "Asia/Kolkata"): Date {
  if (timeZone === "Asia/Kolkata") {
    // IST is fixed UTC+05:30 (no DST)
    return new Date(`${dateStr}T${timeStr}:00+05:30`);
  }
  // Generic calculation using Intl
  const utcGuess = new Date(`${dateStr}T${timeStr}:00Z`);
  const invDate = new Date(utcGuess.toLocaleString("en-US", { timeZone }));
  const diff = utcGuess.getTime() - invDate.getTime();
  return new Date(utcGuess.getTime() + diff);
}

/**
 * Formats a UTC Date to a readable time label (e.g. "05:30 PM") in the business timezone.
 */
export function formatTimeInTimezone(date: Date, timeZone = "Asia/Kolkata"): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/**
 * Calculates genuine available booking time slots for a business and service on a specific date.
 * All slots are generated and stored in UTC, and labels are formatted in the business's timezone.
 */
export async function getAvailableTimeSlots(params: {
  businessId: string;
  serviceId: string;
  dateStr: string; // "YYYY-MM-DD"
}): Promise<{
  slots: TimeSlot[];
  businessOpen: boolean;
  reason?: string;
  businessTimezone: string;
}> {
  const { businessId, serviceId, dateStr } = params;

  const [business, service] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId } }),
    prisma.service.findUnique({ where: { id: serviceId } }),
  ]);

  const timeZone = business?.timezone || "Asia/Kolkata";

  if (!business || !service || !service.isActive) {
    return {
      slots: [],
      businessOpen: false,
      reason: "Business or service not found/inactive.",
      businessTimezone: timeZone,
    };
  }

  // 1. Check if business works on this day in its configured timezone
  const midDaySample = parseInTimezone(dateStr, "12:00", timeZone);
  const dayName = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(midDaySample);
  const workingDays = business.workingDays.split(",").map((d) => d.trim());

  if (!workingDays.includes(dayName)) {
    return {
      slots: [],
      businessOpen: false,
      reason: `Closed on ${dayName}s. Configured working days: ${business.workingDays}`,
      businessTimezone: timeZone,
    };
  }

  // 2. Parse working hours in business timezone -> UTC Dates
  const startHourStr = business.workingHoursStart || "09:00";
  const endHourStr = business.workingHoursEnd || "18:00";

  const dayStartUtc = parseInTimezone(dateStr, startHourStr, timeZone);
  const dayCloseUtc = parseInTimezone(dateStr, endHourStr, timeZone);

  // 3. Fetch active appointments that overlap with business operating hours
  const existingAppointments = await prisma.appointment.findMany({
    where: {
      businessId,
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
      startTime: { lt: dayCloseUtc },
      endTime: { gt: dayStartUtc },
    },
    select: {
      id: true,
      startTime: true,
      endTime: true,
    },
  });

  const slots: TimeSlot[] = [];
  const duration = service.durationMinutes || 30;
  const stepMinutes = 30; // 30-minute interval grid

  let currentSlotStart = new Date(dayStartUtc);
  const now = new Date();

  while (true) {
    const currentSlotEnd = addMinutes(currentSlotStart, duration);

    // Stop if slot overflows business closing hours
    if (currentSlotEnd > dayCloseUtc) {
      break;
    }

    // Do not show past slots if date is today
    const isPast = currentSlotStart.getTime() < now.getTime();

    // Check collision against existing appointments
    const hasCollision = existingAppointments.some((apt) => {
      const aptStart = new Date(apt.startTime).getTime();
      const aptEnd = new Date(apt.endTime).getTime();
      return currentSlotStart.getTime() < aptEnd && currentSlotEnd.getTime() > aptStart;
    });

    slots.push({
      startTime: currentSlotStart.toISOString(),
      endTime: currentSlotEnd.toISOString(),
      timeLabel: formatTimeInTimezone(currentSlotStart, timeZone),
      available: !isPast && !hasCollision,
    });

    currentSlotStart = addMinutes(currentSlotStart, stepMinutes);
  }

  return {
    slots,
    businessOpen: true,
    businessTimezone: timeZone,
  };
}

/**
 * Strict database collision check to prevent double bookings
 */
export async function assertNoBookingConflict(params: {
  businessId: string;
  startTime: Date;
  endTime: Date;
  excludeAppointmentId?: string;
}): Promise<{ hasConflict: boolean; conflictingId?: string }> {
  const { businessId, startTime, endTime, excludeAppointmentId } = params;

  const conflict = await prisma.appointment.findFirst({
    where: {
      businessId,
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
      id: excludeAppointmentId ? { not: excludeAppointmentId } : undefined,
      AND: [
        { startTime: { lt: endTime } },
        { endTime: { gt: startTime } },
      ],
    },
  });

  if (conflict) {
    return { hasConflict: true, conflictingId: conflict.id };
  }

  return { hasConflict: false };
}
