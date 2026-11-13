const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database with authentic BusinessOS data...");

  const passwordHash = await bcrypt.hash("Password123!", 10);

  // Clean existing demo business data to ensure idempotent seed
  await prisma.business.deleteMany({ where: { slug: "apex-digital" } });

  // 1. Business
  const business = await prisma.business.create({
    data: {
      name: "Apex Digital Solutions",
      slug: "apex-digital",
      category: "IT & Digital Services",
      currency: "INR",
      phone: "+91 98765 00000",
      email: "hello@apexdigital.in",
      address: "Suite 402, Trade Tower, Bandra Kurla Complex",
      city: "Mumbai",
      state: "Maharashtra",
      pincode: "400051",
      gstin: "27AABCA1234F1Z8",
      brandColor: "#4F46E5",
      workingHoursStart: "09:00",
      workingHoursEnd: "18:00",
      workingDays: "Monday,Tuesday,Wednesday,Thursday,Friday,Saturday",
    },
  });

  // 2. User
  const user = await prisma.user.upsert({
    where: { email: "admin@businessos.ai" },
    update: { passwordHash },
    create: {
      email: "admin@businessos.ai",
      name: "Rahul Sharma",
      passwordHash,
      role: "OWNER",
      businessId: business.id,
    },
  });

  // 3. Integration Config
  await prisma.integrationConfig.upsert({
    where: { businessId: business.id },
    update: {},
    create: {
      businessId: business.id,
      metaWebhookVerifyToken: "businessos_webhook_token_2026",
      isRazorpayLive: false,
    },
  });

  // 4. Services
  const s1 = await prisma.service.create({
    data: {
      businessId: business.id,
      name: "AI Automation Strategy Session",
      description: "45-minute deep-dive on mapping small business workflows to AI agents.",
      durationMinutes: 45,
      bufferMinutes: 15,
      price: 1500,
      currency: "INR",
      isActive: true,
    },
  });

  const s2 = await prisma.service.create({
    data: {
      businessId: business.id,
      name: "WhatsApp CRM Setup & Onboarding",
      description: "Complete setup of official Meta WhatsApp Business API & automated triggers.",
      durationMinutes: 60,
      bufferMinutes: 15,
      price: 2999,
      currency: "INR",
      isActive: true,
    },
  });

  const s3 = await prisma.service.create({
    data: {
      businessId: business.id,
      name: "SaaS Tech Consultation",
      description: "Quick 30-min technical architecture and billing review.",
      durationMinutes: 30,
      bufferMinutes: 10,
      price: 999,
      currency: "INR",
      isActive: true,
    },
  });

  // 5. Customers
  const c1 = await prisma.customer.create({
    data: {
      businessId: business.id,
      name: "Ananya Sen",
      company: "Apex Global FinTech",
      email: "ananya.sen@apexfintech.io",
      phone: "+919876543210",
      address: "Cyber City, DLF Phase 2",
      city: "Gurugram",
      notes: "High-value client interested in full WhatsApp AI automation suite.",
    },
  });

  const c2 = await prisma.customer.create({
    data: {
      businessId: business.id,
      name: "Vikram Malhotra",
      company: "Malhotra Retail Chains",
      email: "vikram@malhotraretail.in",
      phone: "+919812345678",
      address: "Brigade Road",
      city: "Bengaluru",
      notes: "Requested quote for 5-store WhatsApp ordering system.",
    },
  });

  const c3 = await prisma.customer.create({
    data: {
      businessId: business.id,
      name: "Priya Nair",
      company: "Nair Cold Storage Logistics",
      email: "priya@nairlogistics.com",
      phone: "+919922334455",
      address: "Kochi Port Road",
      city: "Kochi",
      notes: "Looking to schedule weekly maintenance consultation.",
    },
  });

  // 6. Quotation & Invoice
  const q1 = await prisma.quotation.create({
    data: {
      businessId: business.id,
      customerId: c1.id,
      quotationNumber: "QT-2026-0001",
      status: "INVOICED",
      issueDate: new Date(Date.now() - 3 * 24 * 3600 * 1000),
      validUntil: new Date(Date.now() + 12 * 24 * 3600 * 1000),
      subtotal: 3500,
      taxRate: 18,
      taxAmount: 630,
      discountAmount: 0,
      totalAmount: 4130,
      notes: "Includes initial discovery and onboarding collateral.",
      terms: "Payment due within 7 days of invoice generation.",
      items: {
        create: [
          { description: "WhatsApp CRM Setup & Onboarding", quantity: 1, unitPrice: 2999, amount: 2999, serviceId: s2.id },
          { description: "Priority Cloud Integration Support", quantity: 1, unitPrice: 501, amount: 501 },
        ],
      },
    },
  });

  const inv1 = await prisma.invoice.create({
    data: {
      businessId: business.id,
      customerId: c1.id,
      quotationId: q1.id,
      invoiceNumber: "INV-2026-0001",
      status: "PAID",
      issueDate: new Date(Date.now() - 2 * 24 * 3600 * 1000),
      dueDate: new Date(Date.now() + 5 * 24 * 3600 * 1000),
      subtotal: 3500,
      taxAmount: 630,
      discountAmount: 0,
      totalAmount: 4130,
      amountPaid: 4130,
      notes: "Paid in full via Razorpay checkout.",
    },
  });

  // 7. Verified Payment
  await prisma.payment.create({
    data: {
      businessId: business.id,
      invoiceId: inv1.id,
      amount: 4130,
      currency: "INR",
      status: "SUCCESSFUL",
      paymentMethod: "RAZORPAY_UPI",
      razorpayOrderId: "order_ApexTest001",
      razorpayPaymentId: "pay_ApexRzpVerified001",
      razorpaySignature: "sig_verified_sample_sha256",
      receiptNumber: "RCPT-2026-001",
      verifiedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000),
    },
  });

  // Second quotation (Sent status, outstanding value)
  await prisma.quotation.create({
    data: {
      businessId: business.id,
      customerId: c2.id,
      quotationNumber: "QT-2026-0002",
      status: "SENT",
      issueDate: new Date(Date.now() - 1 * 24 * 3600 * 1000),
      validUntil: new Date(Date.now() + 14 * 24 * 3600 * 1000),
      subtotal: 1500,
      taxRate: 18,
      taxAmount: 270,
      discountAmount: 0,
      totalAmount: 1770,
      notes: "Proposal for AI Automation Strategy Session.",
      terms: "100% advance upon confirmation.",
      items: {
        create: [
          { description: "AI Automation Strategy Session", quantity: 1, unitPrice: 1500, amount: 1500, serviceId: s1.id },
        ],
      },
    },
  });

  // 8. Upcoming Appointment for SlotWise
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(11, 0, 0, 0);

  const tomorrowEnd = new Date(tomorrow);
  tomorrowEnd.setMinutes(tomorrowEnd.getMinutes() + 45);

  await prisma.appointment.create({
    data: {
      businessId: business.id,
      customerId: c1.id,
      serviceId: s1.id,
      startTime: tomorrow,
      endTime: tomorrowEnd,
      status: "CONFIRMED",
      customerNotes: "Focusing on QuoteFlow and SlotWise AI automation.",
      reminderSent: true,
    },
  });

  // 9. WhatsApp Conversation for ReplyPilot
  const conv = await prisma.conversation.create({
    data: {
      businessId: business.id,
      customerId: c2.id,
      channel: "WHATSAPP",
      lastMessageAt: new Date(),
      lastMessageText: "Hi Rahul, could you send me the quotation for setting up WhatsApp ordering for our stores?",
      unreadCount: 1,
    },
  });

  // Inbound customer message
  await prisma.message.create({
    data: {
      conversationId: conv.id,
      businessId: business.id,
      direction: "INBOUND",
      senderType: "CUSTOMER",
      body: "Hi Rahul, could you send me the quotation for setting up WhatsApp ordering for our stores?",
      status: "DELIVERED",
      metaMessageId: "wamid.HBgMOTE5ODEyMzQ1Njc4FQIAERgSRDM2QTMwREQ4NDQyRDFFOUU5AA==",
    },
  });

  // AI Generated draft ready for owner review and approval!
  await prisma.message.create({
    data: {
      conversationId: conv.id,
      businessId: business.id,
      direction: "OUTBOUND",
      senderType: "AI_ASSISTANT",
      body: "Hello Vikram! Certainly, I have prepared Quote #QT-2026-0002 for the AI automation setup for Malhotra Retail. You can review the details or we can schedule a quick 15-minute walkthrough. Would 3 PM today work for you?",
      status: "PENDING_APPROVAL",
      isAiGenerated: true,
      aiConfidence: 0.94,
    },
  });

  // 10. Subscription: Pro Plan
  const periodEnd = new Date();
  periodEnd.setDate(periodEnd.getDate() + 28);

  await prisma.subscription.create({
    data: {
      businessId: business.id,
      plan: "PRO",
      status: "ACTIVE",
      currentPeriodStart: new Date(),
      currentPeriodEnd: periodEnd,
    },
  });

  // 11. Activity Logs
  await prisma.activityLog.createMany({
    data: [
      {
        businessId: business.id,
        userId: user.id,
        action: "PAYMENT_RECEIVED",
        entityType: "PAYMENT",
        entityId: "pay_ApexRzpVerified001",
        description: "Received payment of ₹4,130 for Invoice INV-2026-0001 via Razorpay.",
      },
      {
        businessId: business.id,
        userId: user.id,
        action: "QUOTATION_CREATED",
        entityType: "QUOTATION",
        entityId: "QT-2026-0002",
        description: "Created quotation QT-2026-0002 for Vikram Malhotra (₹1,770).",
      },
      {
        businessId: business.id,
        userId: user.id,
        action: "APPOINTMENT_SCHEDULED",
        entityType: "APPOINTMENT",
        entityId: "apt_Apex001",
        description: "Appointment confirmed with Ananya Sen for AI Automation Strategy Session.",
      },
      {
        businessId: business.id,
        userId: user.id,
        action: "WHATSAPP_MESSAGE_RECEIVED",
        entityType: "CONVERSATION",
        entityId: conv.id,
        description: "Incoming WhatsApp message received from Vikram Malhotra (+919812345678).",
      },
    ],
  });

  console.log("Database seeded successfully with authentic production records!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
