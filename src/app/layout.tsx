import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "BusinessOS AI • One workspace. Every customer. Smarter business.",
  description: "Production-oriented full-stack SaaS platform for small businesses with QuoteFlow AI, ReplyPilot AI, and SlotWise AI.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script src="https://checkout.razorpay.com/v1/checkout.js" async></script>
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
