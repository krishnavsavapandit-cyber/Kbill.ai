import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = "INR"): string {
  if (currency === "INR") {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(amount);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(date: string | Date | number, timeZone = "Asia/Kolkata"): string {
  const d = new Date(date);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function formatDateTime(date: string | Date | number, timeZone = "Asia/Kolkata"): string {
  const d = new Date(date);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

export function formatTime(date: string | Date | number, timeZone = "Asia/Kolkata"): string {
  const d = new Date(date);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

export function formatTimeInTimezone(
  date: string | Date | number,
  timeZone = "Asia/Kolkata"
): string {
  return formatTime(date, timeZone);
}

export function formatDateTimeInTimezone(
  date: string | Date | number,
  timeZone = "Asia/Kolkata"
): string {
  return formatDateTime(date, timeZone);
}
