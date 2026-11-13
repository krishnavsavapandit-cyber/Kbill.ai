import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { checkRateLimit } from "@/lib/rate-limit";

const COOKIE_NAME = "businessos_session";

/**
 * Derives the verified client IP address resistant to X-Forwarded-For spoofing.
 *
 * Security Model:
 * 1. Direct Edge runtime property (request.ip): Derived directly from the socket connection.
 * 2. Cloudflare / CDN verified headers (cf-connecting-ip, true-client-ip): Injected by edge; client values are stripped.
 * 3. Nginx / ALB reverse proxy header (x-real-ip): Injected directly from the upstream TCP socket.
 * 4. X-Forwarded-For fallback: To prevent client-injected leftmost spoofing (e.g. "X-Forwarded-For: 1.1.1.1"),
 *    reads the rightmost entry (proxy-appended hop) or trusted socket address.
 */
export function getClientIp(request: NextRequest): string {
  if (request.ip) {
    return request.ip.trim();
  }

  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded.split(",").map((h) => h.trim()).filter(Boolean);
    return hops[hops.length - 1];
  }

  return "127.0.0.1";
}

// Exact public paths or prefixes
const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/privacy",
  "/api/auth/login",
  "/api/auth/signup",
  "/api/appointments/available-slots",
  "/api/whatsapp/webhook",
  "/api/payments/razorpay/webhook",
  "/api/book",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const clientIp = getClientIp(request);

  // 1. Allow Next.js internal files, static assets, and favicon
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // 2. Rate Limiting on Public Endpoints (DoS & Brute Force Prevention)
  let rateLimitConfig: { limit: number; windowMs: number } | null = null;
  if (pathname.startsWith("/api/auth/login") || pathname.startsWith("/api/auth/signup")) {
    rateLimitConfig = { limit: 10, windowMs: 60000 }; // 10 attempts / min
  } else if (pathname.startsWith("/api/whatsapp/webhook") || pathname.startsWith("/api/payments/razorpay/webhook")) {
    rateLimitConfig = { limit: 120, windowMs: 60000 }; // 120 requests / min
  } else if (
    pathname.startsWith("/book/") ||
    pathname.startsWith("/api/appointments/available-slots") ||
    (pathname === "/api/appointments" && request.method === "POST")
  ) {
    rateLimitConfig = { limit: 120, windowMs: 60000 }; // 120 requests / min
  }

  if (rateLimitConfig) {
    const rateLimitKey = `${pathname.split("/").slice(0, 3).join("/")}:${clientIp}`;
    const rl = checkRateLimit(rateLimitKey, rateLimitConfig);
    if (!rl.success) {
      return NextResponse.json(
        {
          error: "Too Many Requests. Rate limit exceeded. Please try again later.",
          code: "RATE_LIMIT_EXCEEDED",
          retryAfter: rl.retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rl.retryAfterSeconds),
            "X-RateLimit-Limit": String(rl.limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(rl.resetAt),
          },
        }
      );
    }
  }

  // 3. Allow explicitly public routes
  if (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    pathname.startsWith("/book/")
  ) {
    return NextResponse.next();
  }

  // 4. Allow public appointment booking POST if unauthenticated (it validates businessSlug)
  if (pathname === "/api/appointments" && request.method === "POST") {
    return NextResponse.next();
  }

  // 4. Verify authentication token (from cookie or Bearer header)
  const token =
    request.cookies.get(COOKIE_NAME)?.value ||
    (request.headers.get("authorization")?.toLowerCase().startsWith("bearer ")
      ? request.headers.get("authorization")!.substring(7).trim()
      : null);

  let isAuthenticated = false;

  if (token) {
    try {
      const secret = process.env.AUTH_SECRET;
      if (secret && secret.trim().length >= 32) {
        const encodedKey = new TextEncoder().encode(secret.trim());
        const { payload } = await jwtVerify(token, encodedKey, {
          algorithms: ["HS256"],
        });
        if (payload && payload.userId && payload.businessId) {
          isAuthenticated = true;
        }
      }
    } catch {
      isAuthenticated = false;
    }
  }

  if (!isAuthenticated) {
    // Return 401 JSON for API endpoints
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Unauthorized: Authentication required" },
        { status: 401 }
      );
    }

    // Redirect to login page for browser pages
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
