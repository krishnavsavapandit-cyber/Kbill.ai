import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./prisma";

export const COOKIE_NAME = "businessos_session";

// Requirement 7: App refuses to start without a strong JWT secret (no fallback default)
const rawSecret = process.env.AUTH_SECRET;
if (!rawSecret || rawSecret.trim().length < 32) {
  throw new Error(
    "FATAL CONFIG ERROR: AUTH_SECRET must be defined in environment and must be at least 32 characters long."
  );
}

const encodedKey = new TextEncoder().encode(rawSecret.trim());

export interface SessionPayload {
  userId: string;
  email: string;
  businessId: string;
  role: string;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function hashPassword(plainText: string): Promise<string> {
  if (!plainText || plainText.length < 8) {
    throw new Error("Password must be at least 8 characters long.");
  }
  return bcrypt.hash(plainText, 10);
}

export async function comparePassword(plainText: string, hash: string): Promise<boolean> {
  if (!plainText || !hash) return false;
  return bcrypt.compare(plainText, hash);
}

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(encodedKey);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, encodedKey, {
      algorithms: ["HS256"],
    });
    if (payload && payload.userId && payload.businessId) {
      return {
        userId: String(payload.userId),
        email: String(payload.email),
        businessId: String(payload.businessId),
        role: String(payload.role || "OWNER"),
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Extracts session from HTTP request (cookie or Bearer header)
 */
export async function getSession(req?: Request): Promise<SessionPayload | null> {
  if (!req) return null;

  // 1. Check Authorization header
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.substring(7).trim();
    const verified = await verifySessionToken(token);
    if (verified) return verified;
  }

  // 2. Check Cookie header
  const cookieHeader = req.headers.get("cookie");
  if (cookieHeader) {
    const cookies = cookieHeader.split(";").map((c) => c.trim());
    const sessionCookie = cookies.find((c) => c.startsWith(`${COOKIE_NAME}=`));
    if (sessionCookie) {
      const token = sessionCookie.substring(COOKIE_NAME.length + 1);
      const verified = await verifySessionToken(token);
      if (verified) return verified;
    }
  }

  return null;
}

export type RequireBusinessResult =
  | {
      ok: true;
      businessId: string;
      userId: string;
      user: { id: string; email: string; name: string; role: string };
      business: { id: string; name: string; slug: string; currency: string };
    }
  | {
      ok: false;
      response: NextResponse;
    };

/**
 * Enforces authentication and multi-tenant scoping.
 * Returns 401 if unauthenticated.
 */
export async function requireBusiness(req?: Request): Promise<RequireBusinessResult> {
  const session = await getSession(req);
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Unauthorized: Authentication required" },
        { status: 401 }
      ),
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { business: true },
  });

  if (!user || !user.businessId || !user.business) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Unauthorized: User or tenant does not exist" },
        { status: 401 }
      ),
    };
  }

  return {
    ok: true,
    businessId: user.businessId,
    userId: user.id,
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
  };
}
