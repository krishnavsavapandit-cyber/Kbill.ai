import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export interface PlanLimits {
  name: string;
  maxCustomers: number;
  maxInvoices: number;
  maxAppointments: number;
  allowAiQuotes: boolean;
  allowWhatsAppAi: boolean;
  allowCustomBranding: boolean;
}

export const PLAN_CONFIG: Record<string, PlanLimits> = {
  FREE: {
    name: "Free Tier",
    maxCustomers: 5,
    maxInvoices: 5,
    maxAppointments: 5,
    allowAiQuotes: false,
    allowWhatsAppAi: false,
    allowCustomBranding: false,
  },
  STARTER: {
    name: "Starter Plan",
    maxCustomers: 100,
    maxInvoices: 100,
    maxAppointments: 100,
    allowAiQuotes: true,
    allowWhatsAppAi: true,
    allowCustomBranding: true,
  },
  PRO: {
    name: "Pro Plan",
    maxCustomers: 1000,
    maxInvoices: 1000,
    maxAppointments: 1000,
    allowAiQuotes: true,
    allowWhatsAppAi: true,
    allowCustomBranding: true,
  },
  ENTERPRISE: {
    name: "Enterprise Plan",
    maxCustomers: 999999,
    maxInvoices: 999999,
    maxAppointments: 999999,
    allowAiQuotes: true,
    allowWhatsAppAi: true,
    allowCustomBranding: true,
  },
};

/**
 * Returns the effective active plan for a business.
 * If the current plan is expired, it automatically falls back to FREE.
 */
export function getEffectivePlan(business: {
  planId?: string | null;
  planExpiresAt?: Date | null;
}): {
  planId: string;
  isExpired: boolean;
  limits: PlanLimits;
} {
  const rawPlan = (business.planId || "FREE").toUpperCase();
  const expiresAt = business.planExpiresAt ? new Date(business.planExpiresAt) : null;
  const now = new Date();

  // FREE tier never expires
  if (rawPlan === "FREE") {
    return { planId: "FREE", isExpired: false, limits: PLAN_CONFIG.FREE };
  }

  // If a paid plan has no expiry date or has expired, fall back to FREE
  if (!expiresAt || expiresAt.getTime() < now.getTime()) {
    return {
      planId: "FREE",
      isExpired: true,
      limits: PLAN_CONFIG.FREE,
    };
  }

  const limits = PLAN_CONFIG[rawPlan] || PLAN_CONFIG.FREE;
  return {
    planId: rawPlan,
    isExpired: false,
    limits,
  };
}

export type GatedAction =
  | "create_customer"
  | "create_invoice"
  | "create_appointment"
  | "ai_quotes"
  | "whatsapp_ai";

/**
 * Enforces plan limits and feature gating for a business.
 * Returns { ok: true } if permitted, or a 403 Response if capped or restricted.
 */
export async function requireFeature(
  businessId: string,
  action: GatedAction
): Promise<{ ok: true; planId: string } | { ok: false; response: NextResponse }> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, planId: true, planExpiresAt: true },
  });

  if (!business) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Business not found." }, { status: 404 }),
    };
  }

  const effective = getEffectivePlan(business);
  const limits = effective.limits;

  switch (action) {
    case "create_customer": {
      const currentCount = await prisma.customer.count({ where: { businessId } });
      if (currentCount >= limits.maxCustomers) {
        return {
          ok: false,
          response: NextResponse.json(
            {
              error: `Plan limit reached: Your ${effective.planId} plan allows up to ${limits.maxCustomers} customers. Please upgrade your plan.`,
              code: "PLAN_LIMIT_REACHED",
              limit: limits.maxCustomers,
              current: currentCount,
              planId: effective.planId,
              isExpired: effective.isExpired,
            },
            { status: 403 }
          ),
        };
      }
      break;
    }

    case "create_invoice": {
      const currentCount = await prisma.invoice.count({ where: { businessId } });
      if (currentCount >= limits.maxInvoices) {
        return {
          ok: false,
          response: NextResponse.json(
            {
              error: `Plan limit reached: Your ${effective.planId} plan allows up to ${limits.maxInvoices} invoices. Please upgrade your plan.`,
              code: "PLAN_LIMIT_REACHED",
              limit: limits.maxInvoices,
              current: currentCount,
              planId: effective.planId,
              isExpired: effective.isExpired,
            },
            { status: 403 }
          ),
        };
      }
      break;
    }

    case "create_appointment": {
      const currentCount = await prisma.appointment.count({
        where: { businessId, status: { notIn: ["CANCELLED", "NO_SHOW"] } },
      });
      if (currentCount >= limits.maxAppointments) {
        return {
          ok: false,
          response: NextResponse.json(
            {
              error: `Plan limit reached: Your ${effective.planId} plan allows up to ${limits.maxAppointments} active appointments. Please upgrade your plan.`,
              code: "PLAN_LIMIT_REACHED",
              limit: limits.maxAppointments,
              current: currentCount,
              planId: effective.planId,
              isExpired: effective.isExpired,
            },
            { status: 403 }
          ),
        };
      }
      break;
    }

    case "ai_quotes": {
      if (!limits.allowAiQuotes) {
        return {
          ok: false,
          response: NextResponse.json(
            {
              error: `Feature not available on ${effective.planId} plan. AI quote generation requires a paid plan.`,
              code: "FEATURE_NOT_PERMITTED",
              planId: effective.planId,
              isExpired: effective.isExpired,
            },
            { status: 403 }
          ),
        };
      }
      break;
    }

    case "whatsapp_ai": {
      if (!limits.allowWhatsAppAi) {
        return {
          ok: false,
          response: NextResponse.json(
            {
              error: `Feature not available on ${effective.planId} plan. WhatsApp AI suggested replies require a paid plan.`,
              code: "FEATURE_NOT_PERMITTED",
              planId: effective.planId,
              isExpired: effective.isExpired,
            },
            { status: 403 }
          ),
        };
      }
      break;
    }
  }

  return { ok: true, planId: effective.planId };
}

/**
 * Extends the plan duration for a business by adding days to current expiry or from now.
 */
export async function extendPlanSubscription(
  businessId: string,
  newPlanId: string,
  durationDays: number = 30
): Promise<{ planId: string; planExpiresAt: Date }> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { planId: true, planExpiresAt: true },
  });

  const now = new Date();
  const currentExpiry =
    business?.planExpiresAt && business.planExpiresAt.getTime() > now.getTime()
      ? new Date(business.planExpiresAt)
      : now;

  const newExpiry = new Date(currentExpiry.getTime() + durationDays * 24 * 60 * 60 * 1000);

  await prisma.business.update({
    where: { id: businessId },
    data: {
      planId: newPlanId.toUpperCase(),
      planExpiresAt: newExpiry,
    },
  });

  return {
    planId: newPlanId.toUpperCase(),
    planExpiresAt: newExpiry,
  };
}
