import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBusiness } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * DPDP Act 2023 - Right to Access & Data Portability Endpoint
 * Returns a complete export of all personal data, quotations, invoices,
 * appointments, and communication history for the customer.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBusiness(req);
    if (!auth.ok) return auth.response;
    const { businessId } = auth;

    const customer = await prisma.customer.findFirst({
      where: { id: params.id, businessId },
      include: {
        quotations: {
          include: { items: true },
        },
        invoices: {
          include: {
            items: true,
            payments: true,
          },
        },
        appointments: {
          include: { service: true },
        },
        conversations: {
          include: {
            messages: {
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }

    const exportPayload = {
      complianceNotice: "Export generated under India Digital Personal Data Protection Act, 2023 (DPDP Act)",
      exportedAt: new Date().toISOString(),
      businessId,
      customerProfile: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        company: customer.company,
        gstin: customer.gstin,
        address: customer.address,
        city: customer.city,
        state: customer.state,
        notes: customer.notes,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
      },
      financialRecords: {
        quotations: customer.quotations.map((q) => ({
          quotationNumber: q.quotationNumber,
          issueDate: q.issueDate,
          validUntil: q.validUntil,
          status: q.status,
          subtotal: q.subtotal,
          taxAmount: q.taxAmount,
          totalAmount: q.totalAmount,
          placeOfSupply: q.placeOfSupply,
          isInterState: q.isInterState,
          items: q.items.map((it) => ({
            description: it.description,
            hsnSac: it.hsnSac,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            amount: it.amount,
          })),
        })),
        invoices: customer.invoices.map((inv) => ({
          invoiceNumber: inv.invoiceNumber,
          financialYear: inv.financialYear,
          status: inv.status,
          issueDate: inv.issueDate,
          dueDate: inv.dueDate,
          subtotal: inv.subtotal,
          taxAmount: inv.taxAmount,
          totalAmount: inv.totalAmount,
          amountPaid: inv.amountPaid,
          placeOfSupply: inv.placeOfSupply,
          isInterState: inv.isInterState,
          cgstAmount: inv.cgstAmount,
          sgstAmount: inv.sgstAmount,
          igstAmount: inv.igstAmount,
          items: inv.items.map((it) => ({
            description: it.description,
            hsnSac: it.hsnSac,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            amount: it.amount,
          })),
          payments: inv.payments.map((p) => ({
            amount: p.amount,
            status: p.status,
            paymentMethod: p.paymentMethod,
            receiptNumber: p.receiptNumber,
            verifiedAt: p.verifiedAt,
          })),
        })),
      },
      serviceAppointments: customer.appointments.map((apt) => ({
        id: apt.id,
        serviceName: apt.service.name,
        startTime: apt.startTime,
        endTime: apt.endTime,
        status: apt.status,
        customerNotes: apt.customerNotes,
      })),
      communications: customer.conversations.map((c) => ({
        channel: c.channel,
        messages: c.messages.map((m) => ({
          direction: m.direction,
          body: m.body,
          status: m.status,
          createdAt: m.createdAt,
        })),
      })),
    };

    return new Response(JSON.stringify(exportPayload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="customer-export-${customer.id}.json"`,
      },
    });
  } catch (err: any) {
    console.error("Customer export error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
