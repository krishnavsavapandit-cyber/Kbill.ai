import { jsPDF } from "jspdf";

export interface PdfDocumentData {
  type: "QUOTATION" | "INVOICE";
  docNumber: string;
  issueDate: string;
  dueDateOrValidUntil: string;
  business: {
    name: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    city?: string | null;
    gstin?: string | null;
  };
  customer: {
    name: string;
    company?: string | null;
    phone: string;
    email?: string | null;
    address?: string | null;
    gstin?: string | null;
  };
  placeOfSupply?: string | null;
  isInterState?: boolean;
  cgstRate?: number;
  cgstAmount?: number;
  sgstRate?: number;
  sgstAmount?: number;
  igstRate?: number;
  igstAmount?: number;
  items: Array<{
    description: string;
    hsnSac?: string | null;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>;
  subtotal: number;
  taxAmount: number;
  taxRate?: number;
  discountAmount: number;
  totalAmount: number;
  notes?: string | null;
  terms?: string | null;
}

/**
 * Generates a clean, professional PDF document for Quotation or Invoice
 * Returns base64 or ArrayBuffer
 */
export function generateDocumentPdf(data: PdfDocumentData): jsPDF {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = margin;

  // Header Bar (Dark Navy #0B1120)
  doc.setFillColor(11, 17, 32);
  doc.rect(0, 0, pageWidth, 28, "F");

  // Title & Document Number
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text(data.business.name.toUpperCase(), margin, 12);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text(
    `${data.business.phone || ""} ${data.business.email ? "• " + data.business.email : ""}`,
    margin,
    18
  );

  // Document Badge on Right
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  const typeText = data.type === "QUOTATION" ? "ESTIMATE / QUOTE" : "TAX INVOICE";
  doc.text(typeText, pageWidth - margin, 12, { align: "right" });

  doc.setFontSize(11);
  doc.setTextColor(99, 102, 241); // indigo-400
  doc.text(data.docNumber, pageWidth - margin, 18, { align: "right" });

  y = 38;

  // Bill From & Bill To Cards
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(71, 85, 105); // slate-600
  doc.text("FROM:", margin, y);
  doc.text("BILLED TO:", pageWidth / 2 + 5, y);

  y += 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(data.business.name, margin, y);
  doc.text(data.customer.name, pageWidth / 2 + 5, y);

  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139); // slate-500
  if (data.business.address) {
    doc.text(data.business.address, margin, y);
  }
  if (data.customer.company) {
    doc.text(data.customer.company, pageWidth / 2 + 5, y);
    y += 4;
  }
  doc.text(`Phone: ${data.customer.phone}`, pageWidth / 2 + 5, y);

  if (data.business.gstin) {
    y += 4;
    doc.text(`GSTIN: ${data.business.gstin}`, margin, y);
  }
  if (data.customer.gstin) {
    y += 4;
    doc.text(`GSTIN: ${data.customer.gstin}`, pageWidth / 2 + 5, y);
  }
  if (data.customer.email) {
    doc.text(`Email: ${data.customer.email}`, pageWidth / 2 + 5, y);
  }
  if (data.placeOfSupply) {
    y += 4;
    doc.text(`Place of Supply: ${data.placeOfSupply}`, pageWidth / 2 + 5, y);
  }

  y += 8;

  // Metadata Row (Dates)
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, pageWidth - margin * 2, 10, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(100, 116, 139);

  doc.text("ISSUE DATE", margin + 4, y + 4);
  doc.text(data.type === "QUOTATION" ? "VALID UNTIL" : "DUE DATE", margin + 40, y + 4);
  doc.text("CURRENCY", margin + 80, y + 4);
  doc.text("STATUS", pageWidth - margin - 20, y + 4);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(15, 23, 42);
  doc.text(data.issueDate, margin + 4, y + 8);
  doc.text(data.dueDateOrValidUntil, margin + 40, y + 8);
  doc.text("INR (Rs.)", margin + 80, y + 8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(16, 185, 129); // green
  doc.text("CONFIRMED", pageWidth - margin - 20, y + 8);

  y += 18;

  // Table Header
  doc.setFillColor(15, 23, 42);
  doc.rect(margin, y, pageWidth - margin * 2, 8, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("#", margin + 4, y + 5.5);
  doc.text("ITEM & DESCRIPTION", margin + 14, y + 5.5);
  doc.text("QTY", pageWidth - margin - 60, y + 5.5, { align: "right" });
  doc.text("RATE (Rs.)", pageWidth - margin - 35, y + 5.5, { align: "right" });
  doc.text("AMOUNT (Rs.)", pageWidth - margin - 4, y + 5.5, { align: "right" });

  y += 8;

  // Line Items
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");

  data.items.forEach((item, index) => {
    // Alternating background
    if (index % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, pageWidth - margin * 2, 7, "F");
    }

    doc.setTextColor(100, 116, 139);
    doc.text((index + 1).toString(), margin + 4, y + 5);

    doc.setTextColor(15, 23, 42);
    // Truncate long descriptions
    const rawDesc = item.hsnSac ? `${item.description} (HSN/SAC: ${item.hsnSac})` : item.description;
    const desc = rawDesc.length > 55 ? rawDesc.substring(0, 52) + "..." : rawDesc;
    doc.text(desc, margin + 14, y + 5);

    doc.setTextColor(71, 85, 105);
    doc.text(item.quantity.toString(), pageWidth - margin - 60, y + 5, { align: "right" });
    doc.text(item.unitPrice.toFixed(2), pageWidth - margin - 35, y + 5, { align: "right" });

    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(item.amount.toFixed(2), pageWidth - margin - 4, y + 5, { align: "right" });
    doc.setFont("helvetica", "normal");

    y += 7;
  });

  y += 4;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageWidth - margin, y);
  y += 4;

  // Calculation Summary on the Right
  const summaryX = pageWidth - margin - 75;
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);

  doc.text("Subtotal:", summaryX, y);
  doc.text(`Rs. ${data.subtotal.toFixed(2)}`, pageWidth - margin - 4, y, { align: "right" });
  y += 5;

  if (data.isInterState && (data.igstAmount || 0) > 0) {
    doc.text(`IGST (${data.igstRate || data.taxRate || 18}%):`, summaryX, y);
    doc.text(`Rs. ${(data.igstAmount || data.taxAmount).toFixed(2)}`, pageWidth - margin - 4, y, { align: "right" });
    y += 5;
  } else if ((data.cgstAmount || 0) > 0 || (data.sgstAmount || 0) > 0) {
    doc.text(`CGST (${data.cgstRate || 9}%):`, summaryX, y);
    doc.text(`Rs. ${(data.cgstAmount || 0).toFixed(2)}`, pageWidth - margin - 4, y, { align: "right" });
    y += 5;
    doc.text(`SGST (${data.sgstRate || 9}%):`, summaryX, y);
    doc.text(`Rs. ${(data.sgstAmount || 0).toFixed(2)}`, pageWidth - margin - 4, y, { align: "right" });
    y += 5;
  } else if (data.taxAmount > 0) {
    doc.text(`Tax (${data.taxRate || 18}% GST):`, summaryX, y);
    doc.text(`Rs. ${data.taxAmount.toFixed(2)}`, pageWidth - margin - 4, y, { align: "right" });
    y += 5;
  }

  if (data.discountAmount > 0) {
    doc.text("Discount:", summaryX, y);
    doc.text(`- Rs. ${data.discountAmount.toFixed(2)}`, pageWidth - margin - 4, y, { align: "right" });
    y += 5;
  }

  // Grand Total Box
  doc.setFillColor(238, 242, 255); // indigo-50
  doc.rect(summaryX - 4, y, 75 + 4, 9, "F");
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(79, 70, 229); // indigo-600
  doc.text("Total Amount:", summaryX, y + 6);
  doc.text(`Rs. ${data.totalAmount.toFixed(2)}`, pageWidth - margin - 4, y + 6, { align: "right" });

  y += 18;

  // Notes & Terms
  if (data.notes) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(71, 85, 105);
    doc.text("Notes / Instructions:", margin, y);
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(data.notes, margin, y);
    y += 7;
  }

  if (data.terms) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(71, 85, 105);
    doc.text("Terms & Conditions:", margin, y);
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(data.terms, margin, y);
    y += 7;
  }

  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 10;
  doc.setDrawColor(241, 245, 249);
  doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4);
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text("Generated by BusinessOS AI • One workspace. Every customer. Smarter business.", margin, footerY);
  doc.text(`Page 1 of 1`, pageWidth - margin, footerY, { align: "right" });

  return doc;
}
