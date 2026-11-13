/**
 * India GST (Goods and Services Tax) Engine for BusinessOS AI
 * Handles:
 * - 15-character GSTIN validation & State Code extraction
 * - State code & name resolution
 * - Intra-State (CGST + SGST) vs Inter-State (IGST) determination based on Place of Supply
 * - Integer paise precision decimal math for tax computations
 * - HSN / SAC validation and formatting
 */

export const GST_STATE_CODES: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
};

// Map normalized state names to state codes
const STATE_NAME_TO_CODE: Record<string, string> = {};
for (const [code, name] of Object.entries(GST_STATE_CODES)) {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  STATE_NAME_TO_CODE[normalized] = code;
}
// Add common aliases
STATE_NAME_TO_CODE["maharashtra"] = "27";
STATE_NAME_TO_CODE["karnataka"] = "29";
STATE_NAME_TO_CODE["delhi"] = "07";
STATE_NAME_TO_CODE["nctdelhi"] = "07";
STATE_NAME_TO_CODE["newdelhi"] = "07";
STATE_NAME_TO_CODE["tamilnadu"] = "33";
STATE_NAME_TO_CODE["up"] = "09";
STATE_NAME_TO_CODE["uttarpradesh"] = "09";
STATE_NAME_TO_CODE["westbengal"] = "19";
STATE_NAME_TO_CODE["wb"] = "19";
STATE_NAME_TO_CODE["gujarat"] = "24";
STATE_NAME_TO_CODE["telangana"] = "36";
STATE_NAME_TO_CODE["andhrapradesh"] = "37";
STATE_NAME_TO_CODE["ap"] = "37";
STATE_NAME_TO_CODE["kerala"] = "32";
STATE_NAME_TO_CODE["haryana"] = "06";

export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
export const HSN_SAC_REGEX = /^[0-9]{4,8}$/;

/**
 * Validate an Indian GSTIN (Goods and Services Tax Identification Number)
 * Format: 2 digits (State) + 10 chars (PAN) + 1 entity num + 'Z' + 1 checksum char
 */
export function validateGSTIN(gstin: string | null | undefined): {
  valid: boolean;
  stateCode?: string;
  stateName?: string;
  pan?: string;
  error?: string;
} {
  if (!gstin || typeof gstin !== "string") {
    return { valid: false, error: "GSTIN is required" };
  }

  const clean = gstin.trim().toUpperCase();
  if (clean.length !== 15) {
    return { valid: false, error: "GSTIN must be exactly 15 characters long" };
  }

  if (!GSTIN_REGEX.test(clean)) {
    return {
      valid: false,
      error: "Invalid GSTIN format. Expected format: 22AAAAA0000A1Z5",
    };
  }

  const stateCode = clean.slice(0, 2);
  const stateName = GST_STATE_CODES[stateCode];

  if (!stateName) {
    return {
      valid: false,
      error: `Invalid GST state code: '${stateCode}'. Must be a recognized Indian state/UT code (01-38).`,
    };
  }

  const pan = clean.slice(2, 12);

  return {
    valid: true,
    stateCode,
    stateName,
    pan,
  };
}

/**
 * Validate HSN (Harmonized System of Nomenclature) or SAC (Services Accounting Code)
 * Indian tax invoices accept 4, 6, or 8 digit numerical codes.
 */
export function validateHsnSac(code: string | null | undefined): {
  valid: boolean;
  code?: string;
  error?: string;
} {
  if (!code || typeof code !== "string") {
    return { valid: true }; // Optional field
  }

  const clean = code.trim();
  if (clean === "") return { valid: true };

  if (!HSN_SAC_REGEX.test(clean)) {
    return {
      valid: false,
      error: `Invalid HSN/SAC code '${code}'. Must be 4 to 8 numeric digits.`,
    };
  }

  return { valid: true, code: clean };
}

/**
 * Resolve state name or state code into a canonical state code and name
 */
export function resolveState(input?: string | null): { code: string; name: string } | null {
  if (!input || typeof input !== "string") return null;

  const trimmed = input.trim();
  // Check if it's already a 2-digit code
  if (/^[0-9]{2}$/.test(trimmed) && GST_STATE_CODES[trimmed]) {
    return { code: trimmed, name: GST_STATE_CODES[trimmed] };
  }

  // Check normalized name lookup
  const normalized = trimmed.toLowerCase().replace(/[^a-z0-9]/g, "");
  const codeFromName = STATE_NAME_TO_CODE[normalized];
  if (codeFromName && GST_STATE_CODES[codeFromName]) {
    return { code: codeFromName, name: GST_STATE_CODES[codeFromName] };
  }

  return null;
}

export interface GstCalculationInput {
  subtotal: number;
  taxRate?: number; // Total GST rate, e.g. 18.0
  discountAmount?: number;
  businessState?: string | null;
  businessGstin?: string | null;
  customerState?: string | null;
  customerGstin?: string | null;
  placeOfSupply?: string | null; // Explicit Place of Supply override
}

export interface GstCalculationResult {
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  totalTaxRate: number;
  isInterState: boolean;
  placeOfSupply: string;
  placeOfSupplyStateCode: string;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  totalTaxAmount: number;
  totalAmount: number;
}

/**
 * Deterministic GST Split Calculator:
 * Determines Intra-State vs Inter-State supply based on Place of Supply.
 *
 * Law Rule (IGST Act 2017):
 * - Supplier location == Place of Supply: INTRA-STATE (CGST + SGST split 50/50).
 * - Supplier location != Place of Supply: INTER-STATE (IGST applies in full).
 *
 * Tax math is rounded to 2 decimal places (paise precision).
 */
export function calculateGst(input: GstCalculationInput): GstCalculationResult {
  const subtotal = Math.max(0, Number(input.subtotal) || 0);
  const discountAmount = Math.max(0, Number(input.discountAmount) || 0);
  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const totalTaxRate = input.taxRate !== undefined && input.taxRate !== null ? Number(input.taxRate) : 18.0;

  // 1. Resolve Supplier (Business) State Code
  let supplierStateCode: string = "27"; // Default fallback (Maharashtra)
  if (input.businessGstin) {
    const validBizGstin = validateGSTIN(input.businessGstin);
    if (validBizGstin.valid && validBizGstin.stateCode) {
      supplierStateCode = validBizGstin.stateCode;
    }
  } else if (input.businessState) {
    const resolved = resolveState(input.businessState);
    if (resolved) supplierStateCode = resolved.code;
  }

  // 2. Resolve Place of Supply / Recipient State Code
  let recipientStateCode: string = supplierStateCode; // Default to supplier state if B2C local
  let recipientStateName: string = GST_STATE_CODES[supplierStateCode] || "Intra-State";

  if (input.placeOfSupply) {
    const resolvedPos = resolveState(input.placeOfSupply);
    if (resolvedPos) {
      recipientStateCode = resolvedPos.code;
      recipientStateName = resolvedPos.name;
    }
  } else if (input.customerGstin) {
    const validCustGstin = validateGSTIN(input.customerGstin);
    if (validCustGstin.valid && validCustGstin.stateCode) {
      recipientStateCode = validCustGstin.stateCode;
      recipientStateName = validCustGstin.stateName || GST_STATE_CODES[recipientStateCode];
    }
  } else if (input.customerState) {
    const resolvedCustState = resolveState(input.customerState);
    if (resolvedCustState) {
      recipientStateCode = resolvedCustState.code;
      recipientStateName = resolvedCustState.name;
    }
  }

  // 3. Determine Inter-State vs Intra-State
  const isInterState = supplierStateCode !== recipientStateCode;

  let cgstRate = 0;
  let cgstAmount = 0;
  let sgstRate = 0;
  let sgstAmount = 0;
  let igstRate = 0;
  let igstAmount = 0;

  if (isInterState) {
    // Inter-State: Full IGST
    igstRate = totalTaxRate;
    igstAmount = Math.round(((taxableAmount * igstRate) / 100) * 100) / 100;
  } else {
    // Intra-State: 50% CGST + 50% SGST
    cgstRate = totalTaxRate / 2;
    sgstRate = totalTaxRate / 2;
    cgstAmount = Math.round(((taxableAmount * cgstRate) / 100) * 100) / 100;
    sgstAmount = Math.round(((taxableAmount * sgstRate) / 100) * 100) / 100;
  }

  const totalTaxAmount = Math.round((cgstAmount + sgstAmount + igstAmount) * 100) / 100;
  const totalAmount = Math.round((taxableAmount + totalTaxAmount) * 100) / 100;

  return {
    subtotal,
    discountAmount,
    taxableAmount,
    totalTaxRate,
    isInterState,
    placeOfSupply: recipientStateName,
    placeOfSupplyStateCode: recipientStateCode,
    cgstRate,
    cgstAmount,
    sgstRate,
    sgstAmount,
    igstRate,
    igstAmount,
    totalTaxAmount,
    totalAmount,
  };
}
