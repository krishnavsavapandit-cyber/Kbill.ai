import { NextResponse } from "next/server";
import { requireBusiness } from "@/lib/auth";

export async function GET(req: Request) {
  const auth = await requireBusiness(req);
  if (!auth.ok) return auth.response;

  return NextResponse.json({
    user: auth.user,
    business: auth.business,
  });
}
