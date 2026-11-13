import { Prisma } from "@prisma/client";

/**
 * Calculates the Indian Financial Year string (e.g. "2026-27") for a given date.
 * Under Indian accounting and GST rules:
 * - A financial year starts on April 1 (Month 3 in 0-indexed JS Date) and ends on March 31.
 * - Dates between April 1, 2026 and March 31, 2027 belong to FY "2026-27".
 */
export function getFinancialYear(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0 = Jan, ..., 3 = Apr, ..., 11 = Dec

  if (month >= 3) {
    // April to December: Year to Next Year
    const nextYearShort = String((year + 1) % 100).padStart(2, "0");
    return `${year}-${nextYearShort}`;
  } else {
    // January to March: Previous Year to Year
    const currentYearShort = String(year % 100).padStart(2, "0");
    return `${year - 1}-${currentYearShort}`;
  }
}

export interface SequentialInvoiceResult {
  invoiceNumber: string;
  financialYear: string;
  sequenceNumber: number;
}

/**
 * Safely generates the next sequential invoice number per business and per financial year.
 * Concurrency-safe: Must be called inside a Prisma transaction (`tx`).
 * Uses atomic sequence counter table (`InvoiceSequence`) with uniqueness constraint on (businessId, financialYear).
 */
export async function generateNextInvoiceNumber(
  tx: Prisma.TransactionClient,
  businessId: string,
  issueDate: Date = new Date()
): Promise<SequentialInvoiceResult> {
  const financialYear = getFinancialYear(issueDate);

  // 1. Ensure the sequence record exists for this business and financial year
  await tx.invoiceSequence.upsert({
    where: {
      businessId_financialYear: { businessId, financialYear },
    },
    create: {
      businessId,
      financialYear,
      currentNumber: 0,
    },
    update: {},
  });

  // 2. Atomically increment the sequence counter and retrieve the new sequence number
  const updatedSequence = await tx.invoiceSequence.update({
    where: {
      businessId_financialYear: { businessId, financialYear },
    },
    data: {
      currentNumber: { increment: 1 },
    },
  });

  const sequenceNumber = updatedSequence.currentNumber;
  const invoiceNumber = `INV/${financialYear}/${String(sequenceNumber).padStart(4, "0")}`;

  return {
    invoiceNumber,
    financialYear,
    sequenceNumber,
  };
}
