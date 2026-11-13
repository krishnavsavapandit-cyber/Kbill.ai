import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, signSessionToken, COOKIE_NAME, normalizeEmail } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, name, businessName, phone } = body;

    if (!email || !password || !name || !businessName) {
      return NextResponse.json(
        { error: "Email, password, name, and business name are required." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters long." },
        { status: 400 }
      );
    }

    const cleanEmail = normalizeEmail(email);

    // Check if email already taken
    const existingUser = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });
    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    // Generate unique slug
    let baseSlug = businessName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (!baseSlug) baseSlug = "biz";

    let slug = baseSlug;
    let counter = 1;
    while (await prisma.business.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter++}`;
    }

    const passwordHash = await hashPassword(password);

    // Create Business & User atomically
    const result = await prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          name: businessName.trim(),
          slug,
          phone: phone ? String(phone).trim() : null,
          email: cleanEmail,
          currency: "INR",
          workingHoursStart: "09:00",
          workingHoursEnd: "18:00",
          workingDays: "Monday,Tuesday,Wednesday,Thursday,Friday,Saturday",
        },
      });

      const user = await tx.user.create({
        data: {
          email: cleanEmail,
          name: name.trim(),
          passwordHash,
          role: "OWNER",
          businessId: business.id,
        },
      });

      // Initialize Integration Config
      await tx.integrationConfig.create({
        data: {
          businessId: business.id,
          metaWebhookVerifyToken: "businessos_webhook_token_2026",
          isRazorpayLive: false,
        },
      });

      // Default Starter subscription
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + 30);
      await tx.subscription.create({
        data: {
          businessId: business.id,
          plan: "STARTER",
          status: "ACTIVE",
          currentPeriodStart: new Date(),
          currentPeriodEnd: periodEnd,
        },
      });

      return { business, user };
    });

    const token = await signSessionToken({
      userId: result.user.id,
      email: result.user.email,
      businessId: result.business.id,
      role: result.user.role,
    });

    const response = NextResponse.json(
      {
        success: true,
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          role: result.user.role,
        },
        business: {
          id: result.business.id,
          name: result.business.name,
          slug: result.business.slug,
        },
        token,
      },
      { status: 201 }
    );

    response.cookies.set({
      name: COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });

    return response;
  } catch (err: any) {
    console.error("Signup error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
