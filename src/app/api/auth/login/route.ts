import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { comparePassword, signSessionToken, COOKIE_NAME, normalizeEmail } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }

    const cleanEmail = normalizeEmail(email);

    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
      include: { business: true },
    });

    if (!user || !user.passwordHash || !user.business) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      );
    }

    const isMatch = await comparePassword(password, user.passwordHash);
    if (!isMatch) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      );
    }

    const token = await signSessionToken({
      userId: user.id,
      email: user.email,
      businessId: user.business.id,
      role: user.role,
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      business: {
        id: user.business.id,
        name: user.business.name,
        slug: user.business.slug,
        currency: user.business.currency,
      },
      token,
    });

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
    console.error("Login error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
