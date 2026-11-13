import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBusiness } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBusiness(req);
    if (!auth.ok) return auth.response;
    const { businessId } = auth;

    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, businessId },
      include: {
        customer: true,
        quotation: { include: { items: true } },
        payments: true,
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    return NextResponse.json({ invoice });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
